/**
 * GET /api/admin/extraction-outcomes
 *
 * Returns aggregated stats on extraction success/failure patterns.
 * Used by admin dashboard to understand enrichment quality.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractionOutcomes } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Domains with 0 services grouped by failure reason
    const serviceFailures = await db
      .select({
        failureReason: extractionOutcomes.failureReason,
        count: sql<number>`count(*)::int`,
      })
      .from(extractionOutcomes)
      .where(eq(extractionOutcomes.extractionType, "services"))
      .groupBy(extractionOutcomes.failureReason);

    // Domains with 0 case studies grouped by failure reason
    const caseStudyFailures = await db
      .select({
        failureReason: extractionOutcomes.failureReason,
        count: sql<number>`count(*)::int`,
      })
      .from(extractionOutcomes)
      .where(eq(extractionOutcomes.extractionType, "case_studies"))
      .groupBy(extractionOutcomes.failureReason);

    // Manual correction rate
    const manualCorrections = await db
      .select({
        extractionType: extractionOutcomes.extractionType,
        totalOutcomes: sql<number>`count(*)::int`,
        withManualCorrections: sql<number>`count(*) filter (where manually_added_count > 0)::int`,
        resolved: sql<number>`count(*) filter (where resolved = true)::int`,
      })
      .from(extractionOutcomes)
      .groupBy(extractionOutcomes.extractionType);

    // Recent failures (last 50)
    const recentFailures = await db
      .select({
        domain: extractionOutcomes.domain,
        extractionType: extractionOutcomes.extractionType,
        failureReason: extractionOutcomes.failureReason,
        autoExtractedCount: extractionOutcomes.autoExtractedCount,
        manuallyAddedCount: extractionOutcomes.manuallyAddedCount,
        resolved: extractionOutcomes.resolved,
        createdAt: extractionOutcomes.createdAt,
      })
      .from(extractionOutcomes)
      .orderBy(sql`created_at desc`)
      .limit(50);

    return NextResponse.json({
      serviceFailures,
      caseStudyFailures,
      manualCorrections,
      recentFailures,
    });
  } catch (error) {
    console.error("[Admin/ExtractionOutcomes] Error:", error);
    return NextResponse.json({ error: "Failed to fetch extraction outcomes" }, { status: 500 });
  }
}
