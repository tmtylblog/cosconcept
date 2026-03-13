/**
 * GET /api/admin/experts/diagnostic
 *
 * Diagnostic endpoint to check expert_profiles data state.
 * Helps debug: "PDL team import ran but experts don't show on admin pages."
 *
 * Optional query params:
 *   ?orgId=<uuid>   — check a specific organization
 *   ?firmId=<id>    — check a specific firm
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Accept superadmin session OR ADMIN_SECRET header (for CLI/debugging)
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  const secretOk = expectedSecret && secret === expectedSecret;

  if (!secretOk) {
    try {
      const headersList = await headers();
      const session = await auth.api.getSession({ headers: headersList });
      if (!session?.user || session.user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const firmId = searchParams.get("firmId");

  try {
    // 1. Total expert_profiles
    const totalResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_experts,
        COUNT(DISTINCT firm_id)::int AS total_firms
      FROM expert_profiles
    `);

    // 2. By source (PDL vs enrichment_data vs manual)
    const bySource = await db.execute(sql`
      SELECT
        CASE
          WHEN id LIKE 'exp_pdl_%' THEN 'PDL team-ingest'
          WHEN id LIKE 'ep_%' THEN 'enrichment_data script'
          ELSE 'manual/other'
        END AS source,
        COUNT(*)::int AS count,
        COUNT(DISTINCT firm_id)::int AS firms
      FROM expert_profiles
      GROUP BY 1
      ORDER BY count DESC
    `);

    // 3. PDL classification tier distribution
    const byTier = await db.execute(sql`
      SELECT
        COALESCE(pdl_data->>'classifiedAs', 'unclassified') AS tier,
        COUNT(*)::int AS count
      FROM expert_profiles
      WHERE id LIKE 'exp_pdl_%'
      GROUP BY 1
      ORDER BY count DESC
    `);

    // 4. Team-ingest job status
    const jobStats = await db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM background_jobs
      WHERE type = 'team-ingest'
      GROUP BY status
      ORDER BY count DESC
    `);

    // 5. Failed team-ingest jobs (last 10 errors)
    const failedJobs = await db.execute(sql`
      SELECT
        id,
        payload->>'firmId' AS firm_id,
        payload->>'domain' AS domain,
        status,
        last_error,
        created_at,
        completed_at
      FROM background_jobs
      WHERE type = 'team-ingest' AND status = 'failed'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // 6. Firm coverage: firms with website vs firms with experts
    const firmCoverage = await db.execute(sql`
      SELECT
        COUNT(DISTINCT sf.id)::int AS total_firms_with_website,
        COUNT(DISTINCT ep.firm_id)::int AS firms_with_experts,
        COUNT(DISTINCT sf.id)::int - COUNT(DISTINCT ep.firm_id)::int AS firms_without_experts
      FROM service_firms sf
      LEFT JOIN expert_profiles ep ON ep.firm_id = sf.id
      WHERE sf.website IS NOT NULL
    `);

    // 7. Org linkage check
    const orgLinkage = await db.execute(sql`
      SELECT
        COUNT(DISTINCT ep.firm_id)::int AS firms_with_experts,
        COUNT(DISTINCT CASE WHEN sf.organization_id IS NOT NULL THEN ep.firm_id END)::int AS linked_to_org,
        COUNT(DISTINCT CASE WHEN sf.organization_id IS NULL THEN ep.firm_id END)::int AS no_org
      FROM expert_profiles ep
      JOIN service_firms sf ON sf.id = ep.firm_id
    `);

    // 8. Admin page path check: org → firm → experts
    const adminPath = await db.execute(sql`
      SELECT
        COUNT(DISTINCT o.id)::int AS total_orgs,
        COUNT(DISTINCT CASE WHEN ep.id IS NOT NULL THEN o.id END)::int AS orgs_with_experts,
        COUNT(DISTINCT CASE WHEN ep.id IS NULL THEN o.id END)::int AS orgs_without_experts
      FROM organizations o
      JOIN service_firms sf ON sf.organization_id = o.id
      LEFT JOIN expert_profiles ep ON ep.firm_id = sf.id
    `);

    // 9. Top 15 firms by expert count
    const topFirms = await db.execute(sql`
      SELECT
        sf.id AS firm_id,
        sf.name,
        sf.organization_id,
        COUNT(ep.id)::int AS expert_count,
        COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'expert' THEN 1 END)::int AS experts,
        COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'potential_expert' THEN 1 END)::int AS potential,
        COUNT(CASE WHEN ep.pdl_data->>'classifiedAs' = 'not_expert' THEN 1 END)::int AS not_expert
      FROM service_firms sf
      JOIN expert_profiles ep ON ep.firm_id = sf.id
      GROUP BY sf.id, sf.name, sf.organization_id
      ORDER BY expert_count DESC
      LIMIT 15
    `);

    // 10. Specific org/firm check
    let specificCheck = null;
    const targetOrgId = orgId;
    const targetFirmId = firmId;

    if (targetOrgId || targetFirmId) {
      let firmRow;
      if (targetOrgId) {
        const res = await db.execute(sql`
          SELECT id, name, website, organization_id, enrichment_status
          FROM service_firms WHERE organization_id = ${targetOrgId}
          LIMIT 1
        `);
        firmRow = res.rows[0];
      } else {
        const res = await db.execute(sql`
          SELECT id, name, website, organization_id, enrichment_status
          FROM service_firms WHERE id = ${targetFirmId}
          LIMIT 1
        `);
        firmRow = res.rows[0];
      }

      if (firmRow) {
        const fId = firmRow.id as string;
        const expertCount = await db.execute(sql`
          SELECT COUNT(*)::int AS count FROM expert_profiles WHERE firm_id = ${fId}
        `);
        const jobs = await db.execute(sql`
          SELECT id, status, created_at, completed_at, last_error,
                 payload->>'domain' AS domain
          FROM background_jobs
          WHERE type = 'team-ingest' AND payload->>'firmId' = ${fId}
          ORDER BY created_at DESC LIMIT 5
        `);
        specificCheck = {
          firm: firmRow,
          expertCount: expertCount.rows[0]?.count ?? 0,
          teamIngestJobs: jobs.rows,
        };
      } else {
        specificCheck = { error: "Firm not found", searchedBy: targetOrgId ? "orgId" : "firmId" };
      }
    }

    return NextResponse.json({
      summary: {
        totalExperts: totalResult.rows[0],
        bySource: bySource.rows,
        byTier: byTier.rows,
      },
      jobs: {
        teamIngestStatus: jobStats.rows,
        recentFailures: failedJobs.rows,
      },
      coverage: {
        firmCoverage: firmCoverage.rows[0],
        orgLinkage: orgLinkage.rows[0],
        adminPagePath: adminPath.rows[0],
      },
      topFirms: topFirms.rows,
      specificCheck,
    });
  } catch (error) {
    console.error("[Admin] Expert diagnostic error:", error);
    return NextResponse.json(
      { error: "Diagnostic failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
