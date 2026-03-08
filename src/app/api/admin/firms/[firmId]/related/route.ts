import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/firms/[firmId]/related
 *
 * Returns experts, clients, and case studies associated with a firm.
 * firmId can be an imported_companies.id, service_firms.id, or matched by name.
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
    // First, resolve the firmId to imported_companies.id(s)
    // Try direct match on imported_companies.id
    let companyIds: string[] = [];

    const directMatch = await db.execute(sql`
      SELECT id FROM imported_companies WHERE id = ${firmId} LIMIT 1
    `);

    if (directMatch.rows.length > 0) {
      companyIds = [firmId];
    } else {
      // Try matching via service_firms → imported_companies.service_firm_id
      const sfMatch = await db.execute(sql`
        SELECT ic.id FROM imported_companies ic
        WHERE ic.service_firm_id = ${firmId}
      `);
      if (sfMatch.rows.length > 0) {
        companyIds = sfMatch.rows.map((r) => r.id as string);
      } else {
        // Try matching by name: service_firms.name → imported_companies.name
        const sfNameResult = await db.execute(sql`
          SELECT name FROM service_firms WHERE id = ${firmId} LIMIT 1
        `);
        if (sfNameResult.rows.length > 0) {
          const firmName = sfNameResult.rows[0].name as string;
          const nameMatch = await db.execute(sql`
            SELECT id FROM imported_companies
            WHERE LOWER(name) = LOWER(${firmName})
          `);
          companyIds = nameMatch.rows.map((r) => r.id as string);
        }
      }
    }

    // If no company IDs found, also try imported_companies matching by name for the given firmId
    if (companyIds.length === 0) {
      const icNameResult = await db.execute(sql`
        SELECT name FROM imported_companies WHERE id = ${firmId} LIMIT 1
      `);
      if (icNameResult.rows.length > 0) {
        companyIds = [firmId];
      }
    }

    // Experts: imported_contacts WHERE company_id IN companyIds
    let experts: Array<Record<string, unknown>> = [];
    let expertCount = 0;

    if (companyIds.length > 0) {
      const expertResult = await db.execute(sql`
        SELECT
          id, name, first_name AS "firstName", last_name AS "lastName",
          title, email, expert_classification AS "expertClassification",
          linkedin_url AS "linkedinUrl"
        FROM imported_contacts
        WHERE company_id = ANY(${companyIds})
        ORDER BY name ASC NULLS LAST
        LIMIT 20
      `);
      experts = expertResult.rows;

      const expertCountResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM imported_contacts
        WHERE company_id = ANY(${companyIds})
      `);
      expertCount = Number(expertCountResult.rows[0]?.count ?? 0);
    }

    // Clients: imported_clients WHERE imported_company_id IN companyIds
    let clients: Array<Record<string, unknown>> = [];
    let clientCount = 0;

    if (companyIds.length > 0) {
      // Also match by service_firm_source_id or service_firm_name
      const firmNameResult = await db.execute(sql`
        SELECT name FROM imported_companies WHERE id = ANY(${companyIds}) LIMIT 1
      `);
      const firmName = firmNameResult.rows[0]?.name as string | undefined;

      const clientResult = await db.execute(sql`
        SELECT id, name, industry, website, employee_count AS "employeeCount"
        FROM imported_clients
        WHERE imported_company_id = ANY(${companyIds})
          ${firmName ? sql`OR LOWER(service_firm_name) = LOWER(${firmName})` : sql``}
        ORDER BY name ASC
        LIMIT 20
      `);
      clients = clientResult.rows;

      const clientCountResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM imported_clients
        WHERE imported_company_id = ANY(${companyIds})
          ${firmName ? sql`OR LOWER(service_firm_name) = LOWER(${firmName})` : sql``}
      `);
      clientCount = Number(clientCountResult.rows[0]?.count ?? 0);
    }

    // Case Studies: imported_case_studies WHERE imported_company_id IN companyIds
    let caseStudies: Array<Record<string, unknown>> = [];
    let caseStudyCount = 0;

    if (companyIds.length > 0) {
      const firmNameResult2 = await db.execute(sql`
        SELECT name FROM imported_companies WHERE id = ANY(${companyIds}) LIMIT 1
      `);
      const firmName2 = firmNameResult2.rows[0]?.name as string | undefined;

      const csResult = await db.execute(sql`
        SELECT
          id, author_org_name AS "authorOrgName", status,
          client_companies AS "clientCompanies",
          industries, skills, links,
          SUBSTRING(content FROM 1 FOR 300) AS "contentPreview"
        FROM imported_case_studies
        WHERE imported_company_id = ANY(${companyIds})
          ${firmName2 ? sql`OR LOWER(author_org_name) = LOWER(${firmName2})` : sql``}
        ORDER BY created_at DESC
        LIMIT 20
      `);
      caseStudies = csResult.rows;

      const csCountResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM imported_case_studies
        WHERE imported_company_id = ANY(${companyIds})
          ${firmName2 ? sql`OR LOWER(author_org_name) = LOWER(${firmName2})` : sql``}
      `);
      caseStudyCount = Number(csCountResult.rows[0]?.count ?? 0);
    }

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
