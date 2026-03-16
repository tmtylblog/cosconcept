/**
 * GET /api/admin/case-studies/poor-results
 *
 * Returns all case studies marked as "not_case_study" across all firms,
 * joined with firm name for admin review.
 * Supports pagination via ?page=1&limit=50
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const role = (session.user as { role?: string }).role;
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Count total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(firmCaseStudies)
      .where(eq(firmCaseStudies.status, "not_case_study"));

    const total = countResult?.count ?? 0;

    // Fetch page
    const rows = await db
      .select({
        id: firmCaseStudies.id,
        sourceUrl: firmCaseStudies.sourceUrl,
        sourceType: firmCaseStudies.sourceType,
        title: firmCaseStudies.title,
        summary: firmCaseStudies.summary,
        cosAnalysis: firmCaseStudies.cosAnalysis,
        autoTags: firmCaseStudies.autoTags,
        statusMessage: firmCaseStudies.statusMessage,
        firmName: serviceFirms.name,
        firmId: firmCaseStudies.firmId,
        markedAt: firmCaseStudies.updatedAt,
        createdAt: firmCaseStudies.createdAt,
      })
      .from(firmCaseStudies)
      .leftJoin(serviceFirms, eq(firmCaseStudies.firmId, serviceFirms.id))
      .where(eq(firmCaseStudies.status, "not_case_study"))
      .orderBy(desc(firmCaseStudies.updatedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      results: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Admin/PoorResults] Error:", error);
    return NextResponse.json({ error: "Failed to fetch poor results" }, { status: 500 });
  }
}
