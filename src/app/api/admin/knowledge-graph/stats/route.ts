import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  serviceFirms,
  solutionPartners,
  expertProfiles,
  firmCaseStudies,
} from "@/lib/db/schema";
import { sql, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/stats
 *
 * Returns counts for all 6 Knowledge Graph tabs:
 * Service Providers, Solution Partners, Experts, Clients, Case Studies, Attributes.
 *
 * Track A update: All counts now use canonical tables (serviceFirms, expertProfiles,
 * firmCaseStudies) instead of truncated imported_* tables.
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
    // Service Providers: service_firms (canonical source)
    const [spCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceFirms);

    // Solution Partners
    const [solCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutionPartners);

    // Experts: expert_profiles (canonical source — replaces imported_contacts)
    const [expertCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(expertProfiles);

    // Clients: distinct clientName from firm_case_studies auto_tags
    const clientResult = await db.execute(sql`
      SELECT COUNT(DISTINCT auto_tags->>'clientName')::int AS count
      FROM firm_case_studies
      WHERE auto_tags->>'clientName' IS NOT NULL
        AND auto_tags->>'clientName' != ''
        AND status != 'deleted'
    `);
    const clientCount = Number(clientResult.rows[0]?.count ?? 0);

    // Case Studies: firm_case_studies (canonical — replaces imported_case_studies)
    const [csCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(firmCaseStudies)
      .where(ne(firmCaseStudies.status, "deleted"));

    // Attributes — Skills (distinct skill names from firm_case_studies auto_tags)
    const skillsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT skill)::int AS count
      FROM firm_case_studies,
           jsonb_array_elements_text(auto_tags->'skills') AS skill
      WHERE auto_tags->'skills' IS NOT NULL
        AND status != 'deleted'
    `);
    const skillsCount = Number(skillsResult.rows[0]?.count ?? 0);

    // Attributes — Industries (from firm_case_studies auto_tags + taxonomy tables)
    const industriesResult = await db.execute(sql`
      SELECT COUNT(DISTINCT val)::int AS count
      FROM (
        SELECT DISTINCT industry AS val
        FROM firm_case_studies,
             jsonb_array_elements_text(auto_tags->'industries') AS industry
        WHERE auto_tags->'industries' IS NOT NULL
          AND status != 'deleted'
        UNION
        SELECT DISTINCT name AS val
        FROM industries
        WHERE name IS NOT NULL
      ) sub
    `);
    const industriesCount = Number(industriesResult.rows[0]?.count ?? 0);

    // Attributes — Markets (from firm_case_studies auto_tags + taxonomy tables)
    const marketsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT val)::int AS count
      FROM (
        SELECT DISTINCT market AS val
        FROM firm_case_studies,
             jsonb_array_elements_text(auto_tags->'markets') AS market
        WHERE auto_tags->'markets' IS NOT NULL
          AND status != 'deleted'
        UNION
        SELECT DISTINCT name AS val
        FROM markets
        WHERE name IS NOT NULL
      ) sub
    `);
    const marketsCount = Number(marketsResult.rows[0]?.count ?? 0);

    return NextResponse.json({
      serviceProviders: Number(spCount.count),
      solutionPartners: Number(solCount.count),
      experts: Number(expertCount.count),
      clients: clientCount,
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
