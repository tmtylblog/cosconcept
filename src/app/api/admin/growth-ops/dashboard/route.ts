import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  prospectTimeline,
  acqDeals,
  acqDealActivities,
  acqPipelineStages,
  growthOpsInviteQueue,
  attributionEvents,
  serviceFirms,
} from "@/lib/db/schema";
import { eq, gte, desc, asc, sql, count } from "drizzle-orm";

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

function getPeriodDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const since = getPeriodDate(period);

  try {
    // ── Prospect Timeline funnel ─────────────────────────────
    // Count distinct prospects who reached each event type
    const timelineRows = await db
      .select({
        eventType: prospectTimeline.eventType,
        cnt: sql<number>`count(distinct ${prospectTimeline.prospectEmail})`,
      })
      .from(prospectTimeline)
      .where(gte(prospectTimeline.eventAt, since))
      .groupBy(prospectTimeline.eventType);

    const timelineCounts = Object.fromEntries(
      timelineRows.map((r) => [r.eventType, Number(r.cnt)])
    );

    // Build the funnel from timeline data
    // "Contacted" = anyone with ANY outbound event
    const contacted =
      (timelineCounts["email_sent"] ?? 0) +
      (timelineCounts["linkedin_invite_sent"] ?? 0) +
      (timelineCounts["deal_created"] ?? 0);

    const funnel = [
      { label: "Contacted", value: contacted },
      {
        label: "Replied",
        value:
          (timelineCounts["email_replied"] ?? 0) +
          (timelineCounts["linkedin_invite_accepted"] ?? 0) +
          (timelineCounts["linkedin_message"] ?? 0),
      },
      { label: "Signed Up", value: timelineCounts["signed_up"] ?? 0 },
      { label: "Onboarded", value: timelineCounts["onboarded"] ?? 0 },
      { label: "Paying", value: timelineCounts["paying"] ?? 0 },
    ];

    // ── By Source (from timeline channels) ────────────────────
    const channelRows = await db
      .select({
        channel: prospectTimeline.channel,
        cnt: sql<number>`count(distinct ${prospectTimeline.prospectEmail})`,
      })
      .from(prospectTimeline)
      .where(gte(prospectTimeline.eventAt, since))
      .groupBy(prospectTimeline.channel);

    const channelCounts = Object.fromEntries(
      channelRows.map((r) => [r.channel, Number(r.cnt)])
    );

    const bySource = {
      instantly: channelCounts["instantly"] ?? 0,
      linkedinCampaign: channelCounts["linkedin"] ?? 0,
      linkedinOrganic: channelCounts["organic"] ?? 0,
      direct: channelCounts["manual"] ?? 0,
    };

    // ── Deals data (kept for pipeline metrics) ────────────────
    const allDeals = await db
      .select({
        id: acqDeals.id,
        status: acqDeals.status,
        dealValue: acqDeals.dealValue,
        stageId: acqDeals.stageId,
        stageLabel: acqDeals.stageLabel,
        createdAt: acqDeals.createdAt,
      })
      .from(acqDeals);

    const periodDeals = allDeals.filter(
      (d) => d.createdAt && new Date(d.createdAt) >= since,
    );

    // ── Stages ────────────────────────────────────────────────
    const stages = await db
      .select()
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(asc(acqPipelineStages.displayOrder));

    const stageOrder = new Map<string, number>();
    for (const s of stages) stageOrder.set(s.id, s.displayOrder);

    // ── Activities (recent) ───────────────────────────────────
    const periodActivities = await db
      .select({
        id: acqDealActivities.id,
        dealId: acqDealActivities.dealId,
        activityType: acqDealActivities.activityType,
        description: acqDealActivities.description,
        createdAt: acqDealActivities.createdAt,
      })
      .from(acqDealActivities)
      .where(gte(acqDealActivities.createdAt, since))
      .orderBy(desc(acqDealActivities.createdAt))
      .limit(100);

    // ── Invite queue (LinkedIn) ───────────────────────────────
    const inviteQueueRows = await db
      .select({
        status: growthOpsInviteQueue.status,
        cnt: count(),
      })
      .from(growthOpsInviteQueue)
      .where(gte(growthOpsInviteQueue.createdAt, since))
      .groupBy(growthOpsInviteQueue.status);

    // ── Attribution ───────────────────────────────────────────
    const attributionRows = await db
      .select({
        matchMethod: attributionEvents.matchMethod,
        cnt: count(),
      })
      .from(attributionEvents)
      .where(gte(attributionEvents.createdAt, since))
      .groupBy(attributionEvents.matchMethod);

    // ── Compute pipeline metrics ──────────────────────────────
    const activeDeals = allDeals.filter((d) => d.status === "open").length;
    const dealsWon = allDeals.filter((d) => d.status === "won").length;
    const dealsWonInPeriod = periodDeals.filter((d) => d.status === "won").length;

    const pipelineValue = allDeals
      .filter((d) => d.status === "open" && d.dealValue)
      .reduce((sum, d) => sum + (parseFloat(d.dealValue!) || 0), 0);

    const totalDeals = allDeals.length;
    const repliedOrLater = allDeals.filter((d) => {
      const order = d.stageId ? stageOrder.get(d.stageId) ?? -1 : -1;
      return order >= 1;
    }).length;
    const responseRate = totalDeals > 0 ? repliedOrLater / totalDeals : 0;
    const conversionRate = totalDeals > 0 ? dealsWon / totalDeals : 0;

    const metrics = {
      responseRate: Math.round(responseRate * 100),
      avgTimeToReply: 0,
      pipelineValue,
      conversionRate: Math.round(conversionRate * 100),
      activeDeals,
      dealsWon: dealsWonInPeriod,
    };

    // ── Deals by Stage ────────────────────────────────────────
    const dealsByStage = stages.map((s) => ({
      label: s.label,
      color: s.color,
      count: allDeals.filter((d) => d.stageId === s.id).length,
    }));

    const unassigned = allDeals.filter((d) => !d.stageId).length;
    if (unassigned > 0) {
      dealsByStage.push({ label: "Unassigned", color: "#9ca3af", count: unassigned });
    }

    // ── Recent Activity (10 items) ────────────────────────────
    const recentActivity = periodActivities.slice(0, 10).map((a) => ({
      id: a.id,
      dealId: a.dealId,
      type: a.activityType,
      description: a.description,
      createdAt: a.createdAt?.toISOString() ?? null,
    }));

    // ── Real Customer Data (from service_firms) ────────────
    const EXCLUDED_DOMAINS = ["joincollectiveos.com", "example.com", "madebyspeak.com"];

    const cosCustomers = await db
      .select({
        name: serviceFirms.name,
        website: serviceFirms.website,
        cosCustomerSince: serviceFirms.cosCustomerSince,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.isCosCustomer, true));

    // Filter out sandbox/internal entries
    const realCustomers = cosCustomers.filter((c) => {
      if (!c.name || c.name.toLowerCase().startsWith("sandbox")) return false;
      if (c.website) {
        const domain = c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
        if (EXCLUDED_DOMAINS.some((ex) => domain.includes(ex))) return false;
      }
      return true;
    });

    const customerData = {
      totalCustomers: realCustomers.length,
      recentCustomers: realCustomers
        .filter((c) => c.cosCustomerSince)
        .sort((a, b) => new Date(b.cosCustomerSince!).getTime() - new Date(a.cosCustomerSince!).getTime())
        .slice(0, 30)
        .map((c) => ({
          name: c.name,
          website: c.website,
          since: c.cosCustomerSince ? new Date(c.cosCustomerSince).toISOString().slice(0, 10) : null,
        })),
    };

    // ── Timeline event counts (for sparklines / detail views) ─
    const timelineByDay = await db
      .select({
        day: sql<string>`date_trunc('day', ${prospectTimeline.eventAt})::date::text`,
        eventType: prospectTimeline.eventType,
        cnt: sql<number>`count(*)`,
      })
      .from(prospectTimeline)
      .where(gte(prospectTimeline.eventAt, since))
      .groupBy(sql`date_trunc('day', ${prospectTimeline.eventAt})::date`, prospectTimeline.eventType)
      .orderBy(sql`date_trunc('day', ${prospectTimeline.eventAt})::date`);

    return NextResponse.json({
      metrics,
      funnel,
      bySource,
      recentActivity,
      dealsByStage,
      timelineByDay,
      customers: customerData,
      _meta: {
        period,
        since: since.toISOString(),
        totalDeals: allDeals.length,
        timelineEventCounts: timelineCounts,
        inviteQueue: Object.fromEntries(inviteQueueRows.map((r) => [r.status, Number(r.cnt)])),
        attributionMethods: Object.fromEntries(attributionRows.map((r) => [r.matchMethod, Number(r.cnt)])),
      },
    });
  } catch (err) {
    console.error("Dashboard metrics error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
