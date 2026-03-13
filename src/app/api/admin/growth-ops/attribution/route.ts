import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  attributionEvents,
  attributionTouchpoints,
  acqContacts,
  acqDeals,
  users,
  members,
  organizations,
  serviceFirms,
  subscriptions,
  growthOpsConversations,
  growthOpsMessages,
  growthOpsInviteTargets,
  growthOpsInviteQueue,
  growthOpsInviteCampaigns,
} from "@/lib/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

async function checkAccess() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) return null;
  if (!ALLOWED_ROLES.includes(session.user.role ?? "")) return null;
  return session;
}

// Engagement scoring weights
const SCORE_WEIGHTS: Record<string, number> = {
  replied: 5,
  accepted: 4,
  conversation_started: 3,
  opened: 2,
  sent: 1,
};

function computeEngagementScore(touchpoints: { interactionType: string }[]): number {
  let score = 0;
  for (const tp of touchpoints) {
    score += SCORE_WEIGHTS[tp.interactionType] ?? 1;
  }
  return Math.min(score, 10);
}

function computeJourneyStage(row: {
  matchMethod: string;
  onboardingComplete: boolean;
  subscriptionPlan: string | null;
  touchpointCount: number;
}): string {
  if (row.subscriptionPlan && row.subscriptionPlan !== "free") return "paying";
  if (row.onboardingComplete) return "onboarded";
  if (row.touchpointCount > 0) return "engaged";
  return "signed_up";
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  if (!await checkAccess()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Query 1: Core attribution rows with user + contact ─────────────────
  const rows = await db
    .select({
      id: attributionEvents.id,
      userId: attributionEvents.userId,
      matchMethod: attributionEvents.matchMethod,
      instantlyCampaignId: attributionEvents.instantlyCampaignId,
      instantlyCampaignName: attributionEvents.instantlyCampaignName,
      linkedinCampaignId: attributionEvents.linkedinCampaignId,
      hasLinkedinOrganic: attributionEvents.hasLinkedinOrganic,
      hasLinkedinCampaign: attributionEvents.hasLinkedinCampaign,
      linkedinConversationCount: attributionEvents.linkedinConversationCount,
      matchedAt: attributionEvents.matchedAt,
      createdAt: attributionEvents.createdAt,
      userName: users.name,
      userEmail: users.email,
      userLinkedinUrl: users.linkedinUrl,
      userCreatedAt: users.createdAt,
      contactFirstName: acqContacts.firstName,
      contactLastName: acqContacts.lastName,
      contactEmail: acqContacts.email,
    })
    .from(attributionEvents)
    .leftJoin(users, eq(users.id, attributionEvents.userId))
    .leftJoin(acqContacts, eq(acqContacts.id, attributionEvents.contactId))
    .orderBy(desc(attributionEvents.createdAt))
    .limit(500);

  if (rows.length === 0) {
    return NextResponse.json({
      rows: [],
      summary: {
        total: 0, matched: 0, matchRate: 0,
        byMethod: {},
        byChannel: { instantly: 0, linkedinCampaign: 0, linkedinOrganic: 0, direct: 0, unattributed: 0 },
        conversion: { signedUp: 0, onboarded: 0, paying: 0, conversionRate: 0 },
        avgTimeToConversion: null,
      },
      funnel: { totalProspects: 0, contacted: 0, engaged: 0, signedUp: 0, onboarded: 0, paying: 0 },
    });
  }

  const userIds = rows.map((r) => r.userId);

  // ── Query 2: Org + firm + subscription per user ────────────────────────
  const orgData = await db
    .select({
      userId: members.userId,
      orgName: organizations.name,
      firmName: serviceFirms.name,
      firmProfileCompleteness: serviceFirms.profileCompleteness,
      subscriptionPlan: subscriptions.plan,
      subscriptionStatus: subscriptions.status,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .leftJoin(serviceFirms, eq(serviceFirms.organizationId, organizations.id))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .where(inArray(members.userId, userIds));

  const orgMap = new Map<string, (typeof orgData)[0]>();
  for (const o of orgData) orgMap.set(o.userId, o);

  // ── Query 3: Deals for attributed contacts ─────────────────────────────
  const contactsWithUser = await db
    .select({ id: acqContacts.id, cosUserId: acqContacts.cosUserId })
    .from(acqContacts)
    .where(inArray(acqContacts.cosUserId, userIds));

  const contactIdToUserId = new Map<string, string>();
  for (const c of contactsWithUser) {
    if (c.cosUserId) contactIdToUserId.set(c.id, c.cosUserId);
  }

  const dealsByUser = new Map<string, { status: string; dealValue: string | null; stageLabel: string }>();
  if (contactsWithUser.length > 0) {
    const cIds = contactsWithUser.map((c) => c.id);
    const deals = await db
      .select({
        contactId: acqDeals.contactId,
        status: acqDeals.status,
        dealValue: acqDeals.dealValue,
        stageLabel: acqDeals.stageLabel,
      })
      .from(acqDeals)
      .where(inArray(acqDeals.contactId, cIds));

    for (const d of deals) {
      const uid = d.contactId ? contactIdToUserId.get(d.contactId) : null;
      if (uid) dealsByUser.set(uid, { status: d.status, dealValue: d.dealValue, stageLabel: d.stageLabel });
    }
  }

  // ── Query 4: LinkedIn organic conversations ────────────────────────────
  const urlToUserId = new Map<string, string>();
  for (const r of rows) {
    if (r.userLinkedinUrl) {
      urlToUserId.set(r.userLinkedinUrl.toLowerCase().trim().replace(/\/$/, ""), r.userId);
    }
  }
  const linkedinUrls = [...urlToUserId.keys()];

  type ConvoSummary = { participantName: string; lastMessageAt: string | null; messageCount: number };
  const linkedinOrganicByUser = new Map<string, ConvoSummary[]>();

  if (linkedinUrls.length > 0) {
    const convos = await db
      .select({
        participantProfileUrl: growthOpsConversations.participantProfileUrl,
        participantName: growthOpsConversations.participantName,
        lastMessageAt: growthOpsConversations.lastMessageAt,
        chatId: growthOpsConversations.chatId,
      })
      .from(growthOpsConversations)
      .where(sql`LOWER(RTRIM(${growthOpsConversations.participantProfileUrl}, '/')) = ANY(ARRAY[${sql.join(
        linkedinUrls.map((u) => sql`${u}`), sql`, `
      )}])`);

    // Message counts per conversation
    const chatIds = convos.map((c) => c.chatId);
    const msgCounts = new Map<string, number>();
    if (chatIds.length > 0) {
      const counts = await db
        .select({ chatId: growthOpsMessages.chatId, count: sql<number>`COUNT(*)::int` })
        .from(growthOpsMessages)
        .where(inArray(growthOpsMessages.chatId, chatIds))
        .groupBy(growthOpsMessages.chatId);
      for (const c of counts) msgCounts.set(c.chatId, c.count);
    }

    for (const convo of convos) {
      const normUrl = (convo.participantProfileUrl ?? "").toLowerCase().trim().replace(/\/$/, "");
      const uid = urlToUserId.get(normUrl);
      if (!uid) continue;
      const existing = linkedinOrganicByUser.get(uid) ?? [];
      existing.push({
        participantName: convo.participantName,
        lastMessageAt: convo.lastMessageAt?.toISOString() ?? null,
        messageCount: msgCounts.get(convo.chatId) ?? 0,
      });
      linkedinOrganicByUser.set(uid, existing);
    }
  }

  // ── Query 5: LinkedIn campaign activity ────────────────────────────────
  type CampaignActivity = { campaignName: string; inviteStatus: string; sentAt: string | null; acceptedAt: string | null };
  const linkedinCampaignByUser = new Map<string, CampaignActivity[]>();

  if (linkedinUrls.length > 0) {
    const targets = await db
      .select({
        linkedinUrl: growthOpsInviteTargets.linkedinUrl,
        targetId: growthOpsInviteTargets.id,
      })
      .from(growthOpsInviteTargets)
      .where(sql`LOWER(RTRIM(${growthOpsInviteTargets.linkedinUrl}, '/')) = ANY(ARRAY[${sql.join(
        linkedinUrls.map((u) => sql`${u}`), sql`, `
      )}])`);

    if (targets.length > 0) {
      const targetIds = targets.map((t) => t.targetId);
      const queueEntries = await db
        .select({
          targetId: growthOpsInviteQueue.targetId,
          campaignId: growthOpsInviteQueue.campaignId,
          status: growthOpsInviteQueue.status,
          sentAt: growthOpsInviteQueue.sentAt,
          acceptedAt: growthOpsInviteQueue.acceptedAt,
        })
        .from(growthOpsInviteQueue)
        .where(inArray(growthOpsInviteQueue.targetId, targetIds));

      const campaignIds = [...new Set(queueEntries.map((q) => q.campaignId))];
      const campaignNames = new Map<string, string>();
      if (campaignIds.length > 0) {
        const campaigns = await db
          .select({ id: growthOpsInviteCampaigns.id, name: growthOpsInviteCampaigns.name })
          .from(growthOpsInviteCampaigns)
          .where(inArray(growthOpsInviteCampaigns.id, campaignIds));
        for (const c of campaigns) campaignNames.set(c.id, c.name);
      }

      // Map targets back to users via LinkedIn URL
      const targetToUrl = new Map<string, string>();
      for (const t of targets) {
        targetToUrl.set(t.targetId, t.linkedinUrl.toLowerCase().trim().replace(/\/$/, ""));
      }

      for (const q of queueEntries) {
        const normUrl = targetToUrl.get(q.targetId);
        const uid = normUrl ? urlToUserId.get(normUrl) : null;
        if (!uid) continue;
        const existing = linkedinCampaignByUser.get(uid) ?? [];
        existing.push({
          campaignName: campaignNames.get(q.campaignId) ?? "Unknown",
          inviteStatus: q.status,
          sentAt: q.sentAt?.toISOString() ?? null,
          acceptedAt: q.acceptedAt?.toISOString() ?? null,
        });
        linkedinCampaignByUser.set(uid, existing);
      }
    }
  }

  // ── Query 6: Touchpoints per user ──────────────────────────────────────
  const touchpointsByUser = new Map<string, { interactionType: string; touchpointAt: Date }[]>();
  if (userIds.length > 0) {
    const touchpoints = await db
      .select({
        userId: attributionTouchpoints.userId,
        interactionType: attributionTouchpoints.interactionType,
        touchpointAt: attributionTouchpoints.touchpointAt,
      })
      .from(attributionTouchpoints)
      .where(inArray(attributionTouchpoints.userId, userIds));

    for (const tp of touchpoints) {
      const existing = touchpointsByUser.get(tp.userId) ?? [];
      existing.push({ interactionType: tp.interactionType, touchpointAt: tp.touchpointAt });
      touchpointsByUser.set(tp.userId, existing);
    }
  }

  // ── Assemble enriched rows ─────────────────────────────────────────────
  const enrichedRows = rows.map((row) => {
    const org = orgMap.get(row.userId);
    const organicConvos = linkedinOrganicByUser.get(row.userId) ?? [];
    const campaignActivity = linkedinCampaignByUser.get(row.userId) ?? [];
    const userTouchpoints = touchpointsByUser.get(row.userId) ?? [];
    const deal = dealsByUser.get(row.userId);

    const onboardingComplete = (org?.firmProfileCompleteness ?? 0) > 0.3;
    const subscriptionPlan = org?.subscriptionPlan ?? null;
    const touchpointCount = userTouchpoints.length + organicConvos.length + campaignActivity.length;

    // Time to conversion: earliest touchpoint &rarr; signup
    let timeToConversionDays: number | null = null;
    const allDates = [
      ...userTouchpoints.map((tp) => tp.touchpointAt),
      ...organicConvos.filter((c) => c.lastMessageAt).map((c) => new Date(c.lastMessageAt!)),
      ...campaignActivity.filter((c) => c.sentAt).map((c) => new Date(c.sentAt!)),
    ];
    if (allDates.length > 0 && row.userCreatedAt) {
      const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
      timeToConversionDays = daysBetween(earliest, row.userCreatedAt);
    }

    const engagementScore = computeEngagementScore(userTouchpoints);
    const journeyStage = computeJourneyStage({ matchMethod: row.matchMethod, onboardingComplete, subscriptionPlan, touchpointCount });

    const daysSinceSignup = row.userCreatedAt ? daysBetween(row.userCreatedAt, new Date()) : 0;
    const atRisk = (!onboardingComplete && daysSinceSignup > 7) || (subscriptionPlan === "free" && daysSinceSignup > 30);

    return {
      id: row.id,
      userId: row.userId,
      matchMethod: row.matchMethod,
      instantlyCampaignId: row.instantlyCampaignId,
      instantlyCampaignName: row.instantlyCampaignName,
      linkedinCampaignId: row.linkedinCampaignId,
      hasLinkedinOrganic: row.hasLinkedinOrganic || organicConvos.length > 0,
      hasLinkedinCampaign: row.hasLinkedinCampaign || campaignActivity.length > 0,
      matchedAt: row.matchedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      userName: row.userName,
      userEmail: row.userEmail,
      contactFirstName: row.contactFirstName,
      contactLastName: row.contactLastName,
      contactEmail: row.contactEmail,
      orgName: org?.orgName ?? null,
      firmName: org?.firmName ?? null,
      firmProfileCompleteness: org?.firmProfileCompleteness ?? null,
      subscriptionPlan,
      subscriptionStatus: org?.subscriptionStatus ?? null,
      onboardingComplete,
      dealStatus: deal?.status ?? null,
      dealValue: deal?.dealValue ?? null,
      dealStage: deal?.stageLabel ?? null,
      linkedinOrganicConversations: organicConvos,
      linkedinCampaignActivity: campaignActivity,
      timeToConversionDays,
      engagementScore,
      journeyStage,
      touchpointCount,
      atRisk,
    };
  });

  // ── Summary stats ──────────────────────────────────────────────────────
  const total = enrichedRows.length;
  const matched = enrichedRows.filter((r) => r.matchMethod !== "none").length;
  const byMethod: Record<string, number> = {};
  for (const row of enrichedRows) byMethod[row.matchMethod] = (byMethod[row.matchMethod] ?? 0) + 1;

  const byChannel = {
    instantly: enrichedRows.filter((r) => r.instantlyCampaignId).length,
    linkedinCampaign: enrichedRows.filter((r) => r.hasLinkedinCampaign).length,
    linkedinOrganic: enrichedRows.filter((r) => r.hasLinkedinOrganic).length,
    direct: enrichedRows.filter((r) => r.matchMethod === "email_exact" || r.matchMethod === "name_domain").length,
    unattributed: enrichedRows.filter((r) => r.matchMethod === "none" && !r.hasLinkedinOrganic && !r.hasLinkedinCampaign).length,
  };

  const onboardedCount = enrichedRows.filter((r) => r.onboardingComplete).length;
  const payingCount = enrichedRows.filter((r) => r.subscriptionPlan && r.subscriptionPlan !== "free").length;

  const conversionTimes = enrichedRows.filter((r) => r.timeToConversionDays !== null).map((r) => r.timeToConversionDays!);
  const avgTimeToConversion = conversionTimes.length > 0
    ? Math.round(conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length)
    : null;

  // ── Funnel data ────────────────────────────────────────────────────────
  const [prospectCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(acqContacts);
  const [targetCount] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(growthOpsInviteTargets);
  const [contactedCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(growthOpsInviteQueue)
    .where(sql`${growthOpsInviteQueue.status} IN ('sent', 'accepted')`);
  const [engagedCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(growthOpsInviteQueue)
    .where(eq(growthOpsInviteQueue.status, "accepted"));
  const [contactEngaged] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(acqContacts)
    .where(sql`${acqContacts.cosUserId} IS NOT NULL`);

  return NextResponse.json({
    rows: enrichedRows,
    summary: {
      total,
      matched,
      matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
      byMethod,
      byChannel,
      conversion: {
        signedUp: total,
        onboarded: onboardedCount,
        paying: payingCount,
        conversionRate: total > 0 ? Math.round((payingCount / total) * 100) : 0,
      },
      avgTimeToConversion,
    },
    funnel: {
      totalProspects: (prospectCount?.count ?? 0) + (targetCount?.count ?? 0),
      contacted: contactedCount?.count ?? 0,
      engaged: (engagedCount?.count ?? 0) + (contactEngaged?.count ?? 0),
      signedUp: total,
      onboarded: onboardedCount,
      paying: payingCount,
    },
  });
}
