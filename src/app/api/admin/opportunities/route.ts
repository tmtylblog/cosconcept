import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { opportunities, leads, leadShares, serviceFirms } from "@/lib/db/schema";
import { sql, gte, desc, count, avg, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getPeriodDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "30d";
  const periodDate = getPeriodDate(period);

  try {
    // ─── Opportunity funnel ────────────────────────────────
    const oppCounts = await db.execute(sql`
      SELECT
        status,
        signal_type,
        priority,
        source,
        COUNT(*)::int AS cnt
      FROM opportunities
      ${periodDate ? sql`WHERE created_at >= ${periodDate}` : sql``}
      GROUP BY status, signal_type, priority, source
    `);

    const oppByStatus: Record<string, number> = {};
    const oppBySignal: Record<string, number> = {};
    const oppByPriority: Record<string, number> = {};
    const oppBySource: Record<string, number> = {};

    for (const row of oppCounts.rows as Array<Record<string, unknown>>) {
      const s = row.status as string;
      const sig = row.signal_type as string;
      const pri = row.priority as string;
      const src = row.source as string;
      const n = Number(row.cnt);
      oppByStatus[s] = (oppByStatus[s] ?? 0) + n;
      oppBySignal[sig] = (oppBySignal[sig] ?? 0) + n;
      oppByPriority[pri] = (oppByPriority[pri] ?? 0) + n;
      oppBySource[src] = (oppBySource[src] ?? 0) + n;
    }

    const totalOpportunities = Object.values(oppByStatus).reduce((a, b) => a + b, 0);

    // ─── Lead stats ───────────────────────────────────────
    const leadStats = await db.execute(sql`
      SELECT
        status,
        AVG(quality_score)::numeric(5,1) AS avg_score,
        COUNT(*)::int AS cnt,
        COUNT(*) FILTER (WHERE quality_score >= 90)::int AS strong,
        COUNT(*) FILTER (WHERE quality_score >= 75 AND quality_score < 90)::int AS good,
        COUNT(*) FILTER (WHERE quality_score >= 60 AND quality_score < 75)::int AS adequate,
        COUNT(*) FILTER (WHERE quality_score < 60)::int AS weak
      FROM leads
      ${periodDate ? sql`WHERE created_at >= ${periodDate}` : sql``}
      GROUP BY status
    `);

    const leadByStatus: Record<string, number> = {};
    let totalLeads = 0;
    let avgQuality = 0;
    let qualitySum = 0;
    const qualityTiers = { strong: 0, good: 0, adequate: 0, weak: 0 };

    for (const row of leadStats.rows as Array<Record<string, unknown>>) {
      const s = row.status as string;
      const n = Number(row.cnt);
      leadByStatus[s] = n;
      totalLeads += n;
      qualitySum += Number(row.avg_score) * n;
      qualityTiers.strong += Number(row.strong);
      qualityTiers.good += Number(row.good);
      qualityTiers.adequate += Number(row.adequate);
      qualityTiers.weak += Number(row.weak);
    }
    avgQuality = totalLeads > 0 ? qualitySum / totalLeads : 0;

    // ─── Share stats ──────────────────────────────────────
    const shareStats = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_shares,
        COUNT(*) FILTER (WHERE claimed_at IS NOT NULL)::int AS claimed,
        COUNT(*) FILTER (WHERE viewed_at IS NOT NULL)::int AS viewed
      FROM lead_shares
      ${periodDate ? sql`WHERE created_at >= ${periodDate}` : sql``}
    `);
    const shares = (shareStats.rows[0] ?? {}) as Record<string, unknown>;

    // ─── Recent opportunities ─────────────────────────────
    const recentOpps = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        signalType: opportunities.signalType,
        priority: opportunities.priority,
        resolutionApproach: opportunities.resolutionApproach,
        status: opportunities.status,
        source: opportunities.source,
        firmId: opportunities.firmId,
        firmName: serviceFirms.name,
        firmOrgId: serviceFirms.organizationId,
        requiredCategories: opportunities.requiredCategories,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .leftJoin(serviceFirms, eq(opportunities.firmId, serviceFirms.id))
      .orderBy(desc(opportunities.createdAt))
      .limit(20);

    // ─── Recent leads ─────────────────────────────────────
    const recentLeads = await db
      .select({
        id: leads.id,
        title: leads.title,
        status: leads.status,
        qualityScore: leads.qualityScore,
        firmId: leads.firmId,
        firmName: serviceFirms.name,
        firmOrgId: serviceFirms.organizationId,
        timeline: leads.timeline,
        estimatedValue: leads.estimatedValue,
        requiredCategories: leads.requiredCategories,
        anonymizeClient: leads.anonymizeClient,
        clientName: leads.clientName,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(serviceFirms, eq(leads.firmId, serviceFirms.id))
      .orderBy(desc(leads.createdAt))
      .limit(20);

    return NextResponse.json({
      period,
      opportunities: {
        total: totalOpportunities,
        byStatus: oppByStatus,
        bySignal: oppBySignal,
        byPriority: oppByPriority,
        bySource: oppBySource,
      },
      leads: {
        total: totalLeads,
        byStatus: leadByStatus,
        avgQuality: Math.round(avgQuality),
        qualityTiers,
        shares: {
          total: Number(shares.total_shares ?? 0),
          claimed: Number(shares.claimed ?? 0),
          viewed: Number(shares.viewed ?? 0),
        },
      },
      recentOpportunities: recentOpps,
      recentLeads,
    });
  } catch (error) {
    console.error("[Admin/Opportunities] Query error:", error);
    return NextResponse.json({ error: "Failed to query data" }, { status: 500 });
  }
}
