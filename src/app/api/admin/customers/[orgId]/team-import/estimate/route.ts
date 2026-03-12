/**
 * GET /api/admin/customers/[orgId]/team-import/estimate
 *
 * Returns estimated PDL credit cost before importing a team.
 * Uses stored enrichmentData.companyData.employeeCount when available,
 * otherwise returns -1 (unknown) so the UI can show "estimate unavailable".
 *
 * Cost breakdown:
 * - Search: ~employeeCount credits (1 per person found)
 * - Auto-enrich (Free tier): min(5, ~50% of experts)
 * - Auto-enrich (Pro tier): ~50% of employees (estimated expert ratio)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    // Find firm for this org
    const [firm] = await db
      .select({
        id: serviceFirms.id,
        website: serviceFirms.website,
        enrichmentData: serviceFirms.enrichmentData,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found" }, { status: 404 });
    }

    if (!firm.website) {
      return NextResponse.json({ error: "Firm has no website — cannot estimate" }, { status: 400 });
    }

    // Try to get employee count from stored enrichment data
    const enrichData = firm.enrichmentData as Record<string, unknown> | null;
    const companyData = (enrichData?.companyData ?? enrichData?.pdlCompany) as Record<string, unknown> | null;
    const employeeCount = (companyData?.employeeCount as number) ?? -1;

    if (employeeCount <= 0) {
      return NextResponse.json({
        employeeCount: -1,
        message: "Employee count unknown — company may not have been enriched yet",
        estimates: null,
      });
    }

    // Estimate: ~50% of employees are expert/billable roles
    const expertRatio = 0.5;
    const estimatedExperts = Math.round(employeeCount * expertRatio);

    return NextResponse.json({
      employeeCount,
      estimates: {
        searchCredits: employeeCount,
        enrichCreditsFree: Math.min(5, estimatedExperts),
        enrichCreditsPro: estimatedExperts,
        totalFree: employeeCount + Math.min(5, estimatedExperts),
        totalPro: employeeCount + estimatedExperts,
      },
    });
  } catch (error) {
    console.error("[Admin] Team import estimate error:", error);
    return NextResponse.json({ error: "Failed to estimate" }, { status: 500 });
  }
}
