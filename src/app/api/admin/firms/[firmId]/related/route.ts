import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/firms/[firmId]/related
 *
 * Returns experts, clients (from case studies), and case studies associated with a firm.
 * firmId is a service_firms.id.
 *
 * Track A update: Now queries expert_profiles and firm_case_studies (canonical)
 * instead of truncated imported_contacts, imported_clients, imported_case_studies.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firmId } = await params;

  try {
    // Verify the firm exists
    const firmCheck = await db.execute(sql`
      SELECT id, name FROM service_firms WHERE id = ${firmId} LIMIT 1
    `);

    if (firmCheck.rows.length === 0) {
      return NextResponse.json({ error: "Firm not found" }, { status: 404 });
    }

    // Experts: expert_profiles for this firm
    const expertResult = await db.execute(sql`
      SELECT
        id, full_name AS "name", first_name AS "firstName", last_name AS "lastName",
        title, email, division AS "expertClassification",
        linkedin_url AS "linkedinUrl", photo_url AS "photoUrl"
      FROM expert_profiles
      WHERE firm_id = ${firmId}
      ORDER BY full_name ASC NULLS LAST
      LIMIT 20
    `);
    const experts = expertResult.rows;

    const expertCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM expert_profiles
      WHERE firm_id = ${firmId}
    `);
    const expertCount = Number(expertCountResult.rows[0]?.count ?? 0);

    // Clients: distinct client names from firm_case_studies auto_tags
    const clientResult = await db.execute(sql`
      SELECT DISTINCT
        auto_tags->>'clientName' AS name,
        NULL AS industry,
        NULL AS website,
        NULL AS "employeeCount"
      FROM firm_case_studies
      WHERE firm_id = ${firmId}
        AND auto_tags->>'clientName' IS NOT NULL
        AND auto_tags->>'clientName' != ''
        AND status != 'deleted'
      ORDER BY name ASC
      LIMIT 20
    `);
    const clients = clientResult.rows.map((r, i) => ({
      id: `client-${i}`,
      name: r.name,
      industry: r.industry,
      website: r.website,
      employeeCount: r.employeeCount,
    }));

    const clientCountResult = await db.execute(sql`
      SELECT COUNT(DISTINCT auto_tags->>'clientName')::int AS count
      FROM firm_case_studies
      WHERE firm_id = ${firmId}
        AND auto_tags->>'clientName' IS NOT NULL
        AND auto_tags->>'clientName' != ''
        AND status != 'deleted'
    `);
    const clientCount = Number(clientCountResult.rows[0]?.count ?? 0);

    // Case Studies: firm_case_studies for this firm
    const csResult = await db.execute(sql`
      SELECT
        cs.id, sf.name AS "authorOrgName", cs.status,
        cs.auto_tags AS "autoTags",
        cs.title,
        LEFT(cs.summary, 300) AS "contentPreview",
        cs.source_url AS "sourceUrl"
      FROM firm_case_studies cs
      LEFT JOIN service_firms sf ON sf.id = cs.firm_id
      WHERE cs.firm_id = ${firmId}
        AND cs.status != 'deleted'
      ORDER BY cs.created_at DESC
      LIMIT 20
    `);
    const caseStudies = csResult.rows.map((r) => {
      const autoTags = r.autoTags as {
        skills?: string[];
        industries?: string[];
        clientName?: string | null;
      } | null;
      return {
        id: r.id,
        authorOrgName: r.authorOrgName,
        status: r.status,
        title: r.title,
        contentPreview: r.contentPreview,
        sourceUrl: r.sourceUrl,
        clientCompanies: autoTags?.clientName ? [autoTags.clientName] : [],
        industries: autoTags?.industries ?? [],
        skills: autoTags?.skills ?? [],
      };
    });

    const csCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM firm_case_studies
      WHERE firm_id = ${firmId}
        AND status != 'deleted'
    `);
    const caseStudyCount = Number(csCountResult.rows[0]?.count ?? 0);

    return NextResponse.json({
      experts,
      expertCount,
      clients,
      clientCount,
      caseStudies,
      caseStudyCount,
    });
  } catch (error) {
    console.error("[Admin] Firm related data error:", error);
    return NextResponse.json(
      { error: "Failed to fetch firm related data" },
      { status: 500 }
    );
  }
}
