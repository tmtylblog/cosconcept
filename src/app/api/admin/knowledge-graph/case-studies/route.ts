import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/case-studies?q=&status=&industry=&firmName=&page=1&limit=50
 *
 * Returns paginated case studies from the firm_case_studies table
 * with search and filter support.
 *
 * Track A update: Now queries firm_case_studies (canonical)
 * instead of truncated imported_case_studies.
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

    // Never show deleted case studies
    conditions.push(sql`cs.status != 'deleted'`);

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        cs.title ILIKE ${pattern}
        OR cs.summary ILIKE ${pattern}
        OR cs.source_url ILIKE ${pattern}
        OR sf.name ILIKE ${pattern}
        OR cs.auto_tags->>'clientName' ILIKE ${pattern}
      )`);
    }

    if (status) {
      conditions.push(sql`cs.status = ${status}`);
    }

    if (industry) {
      const industryPattern = `%${industry}%`;
      conditions.push(sql`cs.auto_tags->'industries'::text ILIKE ${industryPattern}`);
    }

    if (firmName) {
      const firmPattern = `%${firmName}%`;
      conditions.push(sql`sf.name ILIKE ${firmPattern}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get filtered total
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM firm_case_studies cs
      LEFT JOIN service_firms sf ON sf.id = cs.firm_id
      ${whereClause}
    `);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    // Get paginated results
    const result = await db.execute(sql`
      SELECT
        cs.id,
        cs.firm_id AS "firmId",
        cs.title,
        LEFT(cs.summary, 300) AS summary,
        cs.source_url AS "sourceUrl",
        cs.source_type AS "sourceType",
        cs.status,
        cs.auto_tags AS "autoTags",
        cs.thumbnail_url AS "thumbnailUrl",
        cs.is_hidden AS "isHidden",
        cs.ingested_at AS "ingestedAt",
        cs.created_at AS "createdAt",
        sf.name AS "firmName",
        sf.website AS "firmWebsite"
      FROM firm_case_studies cs
      LEFT JOIN service_firms sf ON sf.id = cs.firm_id
      ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Transform to match expected shape (backward-compatible with frontend)
    const caseStudies = result.rows.map((r) => {
      const autoTags = r.autoTags as {
        skills?: string[];
        industries?: string[];
        services?: string[];
        markets?: string[];
        clientName?: string | null;
      } | null;

      return {
        id: r.id,
        firmId: r.firmId,
        title: r.title,
        content: r.summary, // Map summary → content for backward compat
        authorOrgName: r.firmName,
        sourceUrl: r.sourceUrl,
        status: r.status,
        clientCompanies: autoTags?.clientName ? [autoTags.clientName] : [],
        industries: autoTags?.industries?.map((name: string) => ({ name })) ?? [],
        skills: autoTags?.skills?.map((name: string) => ({ name })) ?? [],
        markets: autoTags?.markets ?? [],
        thumbnailUrl: r.thumbnailUrl,
        isHidden: r.isHidden,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({
      caseStudies,
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
