import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/case-studies?q=&status=&industry=&firmName=&page=1&limit=50
 *
 * Returns paginated case studies from the imported_case_studies table
 * with search and filter support.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("q") ?? "";
  const status = req.nextUrl.searchParams.get("status") ?? "";
  const industry = req.nextUrl.searchParams.get("industry") ?? "";
  const firmName = req.nextUrl.searchParams.get("firmName") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        cs.content ILIKE ${pattern}
        OR cs.author_org_name ILIKE ${pattern}
        OR cs.client_companies::text ILIKE ${pattern}
      )`);
    }

    if (status) {
      conditions.push(sql`cs.status = ${status}`);
    }

    if (industry) {
      const industryPattern = `%${industry}%`;
      conditions.push(sql`cs.industries::text ILIKE ${industryPattern}`);
    }

    if (firmName) {
      const firmPattern = `%${firmName}%`;
      conditions.push(sql`cs.author_org_name ILIKE ${firmPattern}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get filtered total
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM imported_case_studies cs
      ${whereClause}
    `);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    // Get paginated results
    const result = await db.execute(sql`
      SELECT
        cs.id,
        cs.source_id AS "sourceId",
        LEFT(cs.content, 300) AS content,
        cs.author_org_name AS "authorOrgName",
        cs.status,
        cs.client_companies AS "clientCompanies",
        cs.industries,
        cs.skills,
        cs.markets,
        cs.links,
        cs.expert_users AS "expertUsers",
        cs.created_at AS "createdAt"
      FROM imported_case_studies cs
      ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return NextResponse.json({
      caseStudies: result.rows,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("[KnowledgeGraph] Case studies error:", error);
    return NextResponse.json(
      { error: "Failed to fetch case studies" },
      { status: 500 }
    );
  }
}
