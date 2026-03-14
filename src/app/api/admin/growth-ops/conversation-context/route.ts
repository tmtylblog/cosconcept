import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acqContacts,
  acqDeals,
  acqCompanies,
  acqDealActivities,
  acqPipelineStages,
  attributionEvents,
  growthOpsInviteTargets,
  growthOpsInviteQueue,
  growthOpsInviteCampaigns,
} from "@/lib/db/schema";
import { eq, ilike, desc, or, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (
    !session?.user ||
    !ALLOWED_ROLES.includes((session.user as Record<string, unknown>).role as string)
  )
    return null;
  return session;
}

/** Normalize LinkedIn URL for ILIKE matching: strip protocol, www, trailing slash */
function normalizeLinkedinUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export async function GET(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profileUrl = req.nextUrl.searchParams.get("profileUrl");
  const participantName = req.nextUrl.searchParams.get("participantName");

  if (!profileUrl && !participantName) {
    return NextResponse.json(
      { error: "profileUrl or participantName is required" },
      { status: 400 },
    );
  }

  try {
    // 1. Find contact by LinkedIn URL (ILIKE, normalized) or name fallback
    let contact: (typeof acqContacts.$inferSelect) | null = null;

    if (profileUrl) {
      const normalized = normalizeLinkedinUrl(profileUrl);
      const contacts = await db
        .select()
        .from(acqContacts)
        .where(ilike(acqContacts.linkedinUrl, `%${normalized}%`))
        .limit(1);
      contact = contacts[0] ?? null;
    }

    // Name fallback if no URL match
    if (!contact && participantName) {
      const parts = participantName.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ");

      if (lastName) {
        const contacts = await db
          .select()
          .from(acqContacts)
          .where(
            and(
              ilike(acqContacts.firstName, firstName),
              ilike(acqContacts.lastName, lastName),
            ),
          )
          .limit(1);
        contact = contacts[0] ?? null;
      }

      // Try first name only if no last name match
      if (!contact && firstName) {
        const contacts = await db
          .select()
          .from(acqContacts)
          .where(ilike(acqContacts.firstName, firstName))
          .limit(5);
        if (contacts.length === 1) contact = contacts[0];
      }
    }

    if (!contact) {
      return NextResponse.json({
        contact: null,
        deal: null,
        company: null,
        stages: [],
        activities: [],
        outreach: { instantly: [], linkedinCampaigns: [], attributionMethod: null },
      });
    }

    // 2. Load deal (prefer open)
    const deals = await db
      .select()
      .from(acqDeals)
      .where(eq(acqDeals.contactId, contact.id))
      .orderBy(
        sql`CASE WHEN ${acqDeals.status} = 'open' THEN 0 ELSE 1 END`,
        desc(acqDeals.updatedAt),
      )
      .limit(1);
    const deal = deals[0] ?? null;

    // 3. Load company
    let company: (typeof acqCompanies.$inferSelect) | null = null;
    const companyId = deal?.companyId ?? contact.companyId;
    if (companyId) {
      const companies = await db
        .select()
        .from(acqCompanies)
        .where(eq(acqCompanies.id, companyId))
        .limit(1);
      company = companies[0] ?? null;
    }

    // 4. Load stages
    const stages = await db
      .select()
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(sql`${acqPipelineStages.displayOrder} ASC`);

    // 5. Load last 10 activities for the deal
    let activities: (typeof acqDealActivities.$inferSelect)[] = [];
    if (deal) {
      activities = await db
        .select()
        .from(acqDealActivities)
        .where(eq(acqDealActivities.dealId, deal.id))
        .orderBy(desc(acqDealActivities.createdAt))
        .limit(10);
    }

    // 6. Load outreach data

    // 6a. Instantly campaigns (try/catch — external API may fail)
    let instantlyCampaigns: { campaignId: string | null; campaignName: string | null }[] = [];
    try {
      if (deal?.sourceChannel === "instantly" || deal?.source === "instantly_auto") {
        instantlyCampaigns = [
          {
            campaignId: deal.sourceCampaignId,
            campaignName: deal.sourceCampaignName,
          },
        ];
      }
      // Also check attribution for Instantly
      const attrRows = await db
        .select({
          instantlyCampaignId: attributionEvents.instantlyCampaignId,
          instantlyCampaignName: attributionEvents.instantlyCampaignName,
        })
        .from(attributionEvents)
        .where(eq(attributionEvents.contactId, contact.id))
        .limit(5);

      for (const row of attrRows) {
        if (
          row.instantlyCampaignId &&
          !instantlyCampaigns.some((c) => c.campaignId === row.instantlyCampaignId)
        ) {
          instantlyCampaigns.push({
            campaignId: row.instantlyCampaignId,
            campaignName: row.instantlyCampaignName,
          });
        }
      }
    } catch {
      // Silently handle Instantly lookup failures
    }

    // 6b. LinkedIn campaigns (via invite targets / queue)
    const linkedinCampaigns: {
      campaignId: string;
      campaignName: string;
      status: string;
      sentAt: string | null;
    }[] = [];
    if (profileUrl) {
      const normalized = normalizeLinkedinUrl(profileUrl);
      const targets = await db
        .select({
          targetId: growthOpsInviteTargets.id,
          linkedinUrl: growthOpsInviteTargets.linkedinUrl,
        })
        .from(growthOpsInviteTargets)
        .where(ilike(growthOpsInviteTargets.linkedinUrl, `%${normalized}%`))
        .limit(10);

      if (targets.length > 0) {
        const targetIds = targets.map((t) => t.targetId);
        const queueItems = await db
          .select({
            campaignId: growthOpsInviteQueue.campaignId,
            status: growthOpsInviteQueue.status,
            sentAt: growthOpsInviteQueue.sentAt,
          })
          .from(growthOpsInviteQueue)
          .where(
            or(...targetIds.map((tid) => eq(growthOpsInviteQueue.targetId, tid))),
          );

        const campaignIds = [...new Set(queueItems.map((q) => q.campaignId))];
        for (const cId of campaignIds) {
          const campaigns = await db
            .select({ id: growthOpsInviteCampaigns.id, name: growthOpsInviteCampaigns.name })
            .from(growthOpsInviteCampaigns)
            .where(eq(growthOpsInviteCampaigns.id, cId))
            .limit(1);
          const campaign = campaigns[0];
          const qi = queueItems.find((q) => q.campaignId === cId);
          if (campaign) {
            linkedinCampaigns.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              status: qi?.status ?? "unknown",
              sentAt: qi?.sentAt?.toISOString() ?? null,
            });
          }
        }
      }
    }

    // 6c. Attribution method
    let attributionMethod: string | null = null;
    const attrEvent = await db
      .select({ matchMethod: attributionEvents.matchMethod })
      .from(attributionEvents)
      .where(eq(attributionEvents.contactId, contact.id))
      .limit(1);
    if (attrEvent[0]) {
      attributionMethod = attrEvent[0].matchMethod;
    }

    return NextResponse.json({
      contact,
      deal,
      company,
      stages,
      activities,
      outreach: {
        instantly: instantlyCampaigns.slice(0, 5),
        linkedinCampaigns,
        attributionMethod,
      },
    });
  } catch (err) {
    console.error("Conversation context error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
