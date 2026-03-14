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

    // ── Compute metrics ─────────────────────────────────────
    const activeDeals = allDeals.filter((d) => d.status === "open").length;
    const dealsWon = periodDeals.filter((d) => d.status === "won").length;
    const totalPeriodDeals = periodDeals.length;

    // Pipeline value (sum of open deal values)
    const pipelineValue = allDeals
      .filter((d) => d.status === "open" && d.dealValue)
      .reduce((sum, d) => sum + (parseFloat(d.dealValue!) || 0), 0);

    // Response rate: deals with email_replied activities / total deals contacted
    const repliedDealIds = new Set(
      periodActivities
        .filter((a) => a.activityType === "email_replied" || a.activityType === "linkedin_message")
        .map((a) => a.dealId),
    );
    const contacted = periodDeals.length;
    const responseRate = contacted > 0 ? repliedDealIds.size / contacted : 0;

    // Avg time to reply (deals with reply activity)
    const replyActivities = periodActivities.filter(
      (a) => a.activityType === "email_replied",
    );
    let avgTimeToReply = 0;
    if (replyActivities.length > 0) {
      const replyDelays: number[] = [];
      for (const ra of replyActivities) {
        const deal = periodDeals.find((d) => d.id === ra.dealId);
        if (deal?.createdAt && ra.createdAt) {
          const delay =
            new Date(ra.createdAt).getTime() - new Date(deal.createdAt).getTime();
          if (delay > 0) replyDelays.push(delay / (1000 * 60 * 60)); // hours
        }
      }
      if (replyDelays.length > 0) {
        avgTimeToReply =
          replyDelays.reduce((s, d) => s + d, 0) / replyDelays.length;
      }
    }

    // Conversion rate: won / total in period
    const conversionRate =
      totalPeriodDeals > 0 ? dealsWon / totalPeriodDeals : 0;

    const metrics = {
      responseRate: Math.round(responseRate * 100),
      avgTimeToReply: Math.round(avgTimeToReply * 10) / 10,
      pipelineValue,
      conversionRate: Math.round(conversionRate * 100),
      activeDeals,
      dealsWon,
    };

    // ── Funnel ──────────────────────────────────────────────
    // Build funnel from deal stages + attribution
    const contacted_count = periodDeals.length;
    const replied_count = repliedDealIds.size;
    const bookedCall = periodActivities.filter(
      (a) =>
        a.activityType === "stage_change" &&
        (a.description?.toLowerCase().includes("demo") ||
          a.description?.toLowerCase().includes("call") ||
          a.description?.toLowerCase().includes("meeting")),
    ).length;

    // Attribution-based: signups with matchMethod != "none"
    const totalAttributed = attributionRows.reduce(
      (s, r) => s + Number(r.cnt),
      0,
    );
    const directSignups = attributionRows
      .filter((r) => r.matchMethod === "none")
      .reduce((s, r) => s + Number(r.cnt), 0);
    const signedUp = totalAttributed;
    const onboarded = Math.round(signedUp * 0.7); // estimate
    const paying = dealsWon;

    const funnel = [
      { label: "Contacted", value: contacted_count },
      { label: "Replied", value: replied_count },
      { label: "Booked Call", value: bookedCall || Math.round(replied_count * 0.3) },
      { label: "Signed Up", value: signedUp },
      { label: "Onboarded", value: onboarded },
      { label: "Paying", value: paying },
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
