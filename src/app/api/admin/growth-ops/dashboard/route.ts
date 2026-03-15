import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acqDeals,
  acqDealActivities,
  acqPipelineStages,
  growthOpsInviteQueue,
  attributionEvents,
} from "@/lib/db/schema";
import { eq, gte, desc, asc, sql, and, count } from "drizzle-orm";

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
    // ── Deals data ──────────────────────────────────────────
    const allDeals = await db
      .select({
        id: acqDeals.id,
        status: acqDeals.status,
        dealValue: acqDeals.dealValue,
        source: acqDeals.source,
        sourceChannel: acqDeals.sourceChannel,
        stageId: acqDeals.stageId,
        stageLabel: acqDeals.stageLabel,
        createdAt: acqDeals.createdAt,
        closedAt: acqDeals.closedAt,
      })
      .from(acqDeals);

    const periodDeals = allDeals.filter(
      (d) => d.createdAt && new Date(d.createdAt) >= since,
    );

    // ── Activities in period ────────────────────────────────
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

    // ── Stages ──────────────────────────────────────────────
    const stages = await db
      .select()
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(asc(acqPipelineStages.displayOrder));

    // ── Invite queue (LinkedIn) ─────────────────────────────
    const inviteQueueRows = await db
      .select({
        status: growthOpsInviteQueue.status,
        cnt: count(),
      })
      .from(growthOpsInviteQueue)
      .where(gte(growthOpsInviteQueue.createdAt, since))
      .groupBy(growthOpsInviteQueue.status);

    // ── Attribution ─────────────────────────────────────────
    const attributionRows = await db
      .select({
        matchMethod: attributionEvents.matchMethod,
        cnt: count(),
      })
      .from(attributionEvents)
      .where(gte(attributionEvents.createdAt, since))
      .groupBy(attributionEvents.matchMethod);

    // ── Build stage order map ──────────────────────────────
    const stageOrder = new Map<string, number>();
    for (const s of stages) stageOrder.set(s.id, s.displayOrder);

    // ── Compute metrics ─────────────────────────────────────
    const activeDeals = allDeals.filter((d) => d.status === "open").length;
    const dealsWon = allDeals.filter((d) => d.status === "won").length;
    const dealsWonInPeriod = periodDeals.filter((d) => d.status === "won").length;

    // Pipeline value (sum of open deal values)
    const pipelineValue = allDeals
      .filter((d) => d.status === "open" && d.dealValue)
      .reduce((sum, d) => sum + (parseFloat(d.dealValue!) || 0), 0);

    // Response rate: deals at "Replied" stage or later / total deals
    const totalDeals = allDeals.length;
    const repliedOrLater = allDeals.filter((d) => {
      const order = d.stageId ? stageOrder.get(d.stageId) ?? -1 : -1;
      return order >= 1; // Replied = displayOrder 1
    }).length;
    const responseRate = totalDeals > 0 ? repliedOrLater / totalDeals : 0;

    // Avg time to reply: not computable from current data, show 0
    const avgTimeToReply = 0;

    // Conversion rate: won / total
    const conversionRate = totalDeals > 0 ? dealsWon / totalDeals : 0;

    const metrics = {
      responseRate: Math.round(responseRate * 100),
      avgTimeToReply: Math.round(avgTimeToReply * 10) / 10,
      pipelineValue,
      conversionRate: Math.round(conversionRate * 100),
      activeDeals,
      dealsWon: dealsWonInPeriod,
    };

    // ── Funnel (based on deal stage positions) ──────────────
    // Count deals that have reached each stage or beyond
    function dealsAtOrBeyond(minOrder: number): number {
      return allDeals.filter((d) => {
        if (d.status === "won") return true; // won deals passed all stages
        const order = d.stageId ? stageOrder.get(d.stageId) ?? -1 : -1;
        return order >= minOrder;
      }).length;
    }

    const funnel = [
      { label: "Contacted", value: dealsAtOrBeyond(0) },
      { label: "Replied", value: dealsAtOrBeyond(1) },
      { label: "Booked Call", value: dealsAtOrBeyond(2) },
      { label: "Signed Up", value: dealsAtOrBeyond(3) },
      { label: "Onboarded", value: dealsAtOrBeyond(4) },
      { label: "Paying", value: dealsAtOrBeyond(5) },
    ];

    // ── By Source ────────────────────────────────────────────
    const bySource = {
      instantly: periodDeals.filter(
        (d) => d.source === "instantly_auto" || d.sourceChannel === "instantly",
      ).length,
      linkedinCampaign: periodDeals.filter(
        (d) => d.source === "linkedin_auto" || d.sourceChannel === "linkedin",
      ).length,
      linkedinOrganic: attributionRows
        .filter((r) => r.matchMethod === "linkedin_url" || r.matchMethod === "linkedin_pdl")
        .reduce((s, r) => s + Number(r.cnt), 0),
      direct: periodDeals.filter(
        (d) => d.source === "manual" || d.source === "hubspot_sync",
      ).length + directSignups,
    };

    // ── Recent Activity (10 items) ──────────────────────────
    const recentActivity = periodActivities.slice(0, 10).map((a) => ({
      id: a.id,
      dealId: a.dealId,
      type: a.activityType,
      description: a.description,
      createdAt: a.createdAt?.toISOString() ?? null,
    }));

    // ── Deals by Stage ──────────────────────────────────────
    const dealsByStage = stages.map((s) => ({
      label: s.label,
      color: s.color,
      count: allDeals.filter((d) => d.stageId === s.id).length,
    }));

    // Add unassigned if any
    const unassigned = allDeals.filter((d) => !d.stageId).length;
    if (unassigned > 0) {
      dealsByStage.push({ label: "Unassigned", color: "#9ca3af", count: unassigned });
    }

    return NextResponse.json({
      metrics,
      funnel,
      bySource,
      recentActivity,
      dealsByStage,
      _meta: {
        period,
        since: since.toISOString(),
        totalDeals: allDeals.length,
        inviteQueue: Object.fromEntries(inviteQueueRows.map((r) => [r.status, Number(r.cnt)])),
      },
    });
  } catch (err) {
    console.error("Dashboard metrics error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
