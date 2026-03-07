import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrichmentAuditLog, serviceFirms } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/**
 * GET /api/admin/enrichment/[firmId] — Enrichment audit trail for a firm
 *
 * Returns all enrichment steps with raw data for admin inspection.
 * Query params:
 *   ?phase=pdl|jina|classifier|... — Filter by enrichment phase
 *   ?limit=50 — Max entries (default 50)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  // TODO: Add admin auth check
  const { firmId } = await params;
  const phase = req.nextUrl.searchParams.get("phase");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

  // Get firm info
  const [firm] = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      website: serviceFirms.website,
      organizationId: serviceFirms.organizationId,
    })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }

  // Build query
  const conditions = [eq(enrichmentAuditLog.firmId, firmId)];
  if (phase) {
    conditions.push(eq(enrichmentAuditLog.phase, phase));
  }

  const entries = await db
    .select()
    .from(enrichmentAuditLog)
    .where(sql`${enrichmentAuditLog.firmId} = ${firmId}${phase ? sql` AND ${enrichmentAuditLog.phase} = ${phase}` : sql``}`)
    .orderBy(desc(enrichmentAuditLog.createdAt))
    .limit(limit);

  // Summary stats
  const [stats] = await db
    .select({
      totalEntries: sql<number>`COUNT(*)`,
      totalCost: sql<number>`COALESCE(SUM(${enrichmentAuditLog.costUsd}), 0)`,
      phases: sql<string>`STRING_AGG(DISTINCT ${enrichmentAuditLog.phase}, ', ')`,
      firstEnriched: sql<string>`MIN(${enrichmentAuditLog.createdAt})`,
      lastEnriched: sql<string>`MAX(${enrichmentAuditLog.createdAt})`,
    })
    .from(enrichmentAuditLog)
    .where(eq(enrichmentAuditLog.firmId, firmId));

  return NextResponse.json({
    firm,
    stats: {
      totalEntries: Number(stats.totalEntries),
      totalCost: Number(stats.totalCost),
      phases: stats.phases?.split(", ") ?? [],
      firstEnriched: stats.firstEnriched,
      lastEnriched: stats.lastEnriched,
    },
    entries,
  });
}
