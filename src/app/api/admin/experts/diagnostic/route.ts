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

    // 11. Check enrichment_data column on service_firms for team members
    const enrichmentTeamData = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_firms,
        COUNT(CASE WHEN enrichment_data IS NOT NULL THEN 1 END)::int AS firms_with_enrichment,
        COUNT(CASE WHEN enrichment_data->'extracted'->>'teamMembers' IS NOT NULL
              AND enrichment_data->'extracted'->>'teamMembers' != '[]'
              AND enrichment_data->'extracted'->>'teamMembers' != 'null' THEN 1 END)::int AS firms_with_team_in_enrichment
      FROM service_firms
    `);

    // Check enrichment_cache for team data
    const cacheTeamData = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_cache_rows,
        COUNT(CASE WHEN enrichment_data->'extracted'->>'teamMembers' IS NOT NULL
              AND enrichment_data->'extracted'->>'teamMembers' != '[]' THEN 1 END)::int AS rows_with_team
      FROM enrichment_cache
    `);

    // Check enrichment_audit_log for team-ingest entries
    const auditEntries = await db.execute(sql`
      SELECT firm_id, phase, status, created_at, extracted_data
      FROM enrichment_audit_log
      WHERE phase = 'team-ingest'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Sample: what does a firm's enrichment_data look like?
    const sampleEnrichment = await db.execute(sql`
      SELECT id, name,
        jsonb_typeof(enrichment_data) as data_type,
        CASE WHEN jsonb_typeof(enrichment_data) = 'object'
          THEN (SELECT jsonb_agg(k) FROM jsonb_object_keys(enrichment_data) k)
          ELSE NULL END as top_keys
      FROM service_firms
      WHERE enrichment_data IS NOT NULL
      LIMIT 3
    `);

    // Check if enrichment_data.extracted.teamMembers exists on any firm
    const sampleTeamData = await db.execute(sql`
      SELECT id, name,
        jsonb_array_length(COALESCE(enrichment_data->'extracted'->'teamMembers', '[]'::jsonb)) AS team_count
      FROM service_firms
      WHERE enrichment_data->'extracted'->'teamMembers' IS NOT NULL
        AND jsonb_array_length(COALESCE(enrichment_data->'extracted'->'teamMembers', '[]'::jsonb)) > 0
      ORDER BY jsonb_array_length(enrichment_data->'extracted'->'teamMembers') DESC
      LIMIT 10
    `);

    const totalTeamMembers = await db.execute(sql`
      SELECT COALESCE(SUM(jsonb_array_length(COALESCE(enrichment_data->'extracted'->'teamMembers', '[]'::jsonb))), 0)::int AS total
      FROM service_firms
      WHERE enrichment_data->'extracted'->'teamMembers' IS NOT NULL
        AND jsonb_array_length(COALESCE(enrichment_data->'extracted'->'teamMembers', '[]'::jsonb)) > 0
    `);

    // Check extracted keys for a sample enriched firm
    const extractedKeys = await db.execute(sql`
      SELECT id, name,
        CASE WHEN jsonb_typeof(enrichment_data->'extracted') = 'object'
          THEN (SELECT jsonb_agg(k) FROM jsonb_object_keys(enrichment_data->'extracted') k)
          ELSE NULL END as extracted_keys
      FROM service_firms
      WHERE enrichment_data->'extracted' IS NOT NULL
      LIMIT 3
    `);

    // Check raw teamMembers values for sample firms
    const sampleTeamValues = await db.execute(sql`
      SELECT id, name,
        enrichment_data->'extracted'->'teamMembers' as team_raw,
        jsonb_typeof(enrichment_data->'extracted'->'teamMembers') as team_type
      FROM service_firms
      WHERE enrichment_data->'extracted'->'teamMembers' IS NOT NULL
      LIMIT 5
    `);

    // Check background_jobs detail for team-ingest
    const allTeamJobs = await db.execute(sql`
      SELECT id, status, payload->>'firmId' AS firm_id, payload->>'domain' AS domain,
             created_at, completed_at, last_error
      FROM background_jobs
      WHERE type = 'team-ingest'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      summary: {
        totalExperts: totalResult.rows[0],
        bySource: bySource.rows,
        byTier: byTier.rows,
      },
      jobs: {
        teamIngestStatus: jobStats.rows,
        recentFailures: failedJobs.rows,
        allTeamJobs: allTeamJobs.rows,
      },
      coverage: {
        firmCoverage: firmCoverage.rows[0],
        orgLinkage: orgLinkage.rows[0],
        adminPagePath: adminPath.rows[0],
      },
      enrichmentData: {
        firmEnrichment: enrichmentTeamData.rows[0],
        cacheTeamData: cacheTeamData.rows[0],
        auditEntries: auditEntries.rows,
        sampleEnrichment: sampleEnrichment.rows,
        extractedKeys: extractedKeys.rows,
        sampleTeamValues: sampleTeamValues.rows,
        totalTeamMembers: totalTeamMembers.rows[0]?.total ?? 0,
        topFirmsByTeamSize: sampleTeamData.rows,
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
