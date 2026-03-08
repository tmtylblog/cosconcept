import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  importedCompanies,
  importedContacts,
  importedClients,
  importedCaseStudies,
  solutionPartners,
} from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/stats
 *
 * Returns counts for all 6 Knowledge Graph tabs:
 * Service Providers, Solution Partners, Experts, Clients, Case Studies, Attributes.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Service Providers: imported_companies where is_icp = true
    const [spCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(importedCompanies)
      .where(sql`${importedCompanies.isIcp} = true`);

    // Solution Partners
    const [solCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutionPartners);

    // Experts: imported_contacts where expert_classification = 'expert'
    const [expertCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(importedContacts)
      .where(sql`${importedContacts.expertClassification} = 'expert'`);

    // Clients
    const [clientCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(importedClients);

    // Case Studies
    const [csCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(importedCaseStudies);

    // Attributes — Skills (distinct skill names from case studies JSONB)
    const skillsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT skill->>'name')::int AS count
      FROM imported_case_studies, jsonb_array_elements(skills) AS skill
      WHERE skills IS NOT NULL
    `);
    const skillsCount = Number(skillsResult.rows[0]?.count ?? 0);

    // Attributes — Industries (union of imported_companies.industry + case studies industries JSONB)
    const industriesResult = await db.execute(sql`
      SELECT COUNT(DISTINCT val)::int AS count
      FROM (
        SELECT DISTINCT industry AS val
        FROM imported_companies
        WHERE industry IS NOT NULL
        UNION
        SELECT DISTINCT ind->>'name' AS val
        FROM imported_case_studies, jsonb_array_elements(industries) AS ind
        WHERE industries IS NOT NULL
      ) sub
    `);
    const industriesCount = Number(industriesResult.rows[0]?.count ?? 0);

    // Attributes — Markets (distinct market values from case studies JSONB)
    const marketsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT market)::int AS count
      FROM imported_case_studies, jsonb_array_elements_text(markets) AS market
      WHERE markets IS NOT NULL
    `);
    const marketsCount = Number(marketsResult.rows[0]?.count ?? 0);

    return NextResponse.json({
      serviceProviders: Number(spCount.count),
      solutionPartners: Number(solCount.count),
      experts: Number(expertCount.count),
      clients: Number(clientCount.count),
      caseStudies: Number(csCount.count),
      attributes: {
        skills: skillsCount,
        industries: industriesCount,
        markets: marketsCount,
        languages: 0,
      },
    });
  } catch (error) {
    console.error("[KnowledgeGraph] Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge graph stats" },
      { status: 500 }
    );
  }
}
