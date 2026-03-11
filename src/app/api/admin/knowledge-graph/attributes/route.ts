import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/attributes?type=skills|industries|markets|languages&q=&page=1&limit=100
 *
 * Returns distinct attribute values with occurrence counts.
 * Supports search and pagination.
 *
 * Track A update: Now queries firm_case_studies.auto_tags (canonical)
 * and taxonomy tables instead of truncated imported_* tables.
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

  const type = req.nextUrl.searchParams.get("type") ?? "skills";
  const search = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(500, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10)));
  const offset = (page - 1) * limit;

  if (!["skills", "industries", "markets", "languages"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be one of: skills, industries, markets, languages" },
      { status: 400 }
    );
  }

  try {
    // Languages placeholder
    if (type === "languages") {
      return NextResponse.json({
        attributes: [],
        total: 0,
        type,
        page,
        limit,
      });
    }

    let dataQuery: ReturnType<typeof sql>;
    let countQuery: ReturnType<typeof sql>;

    if (type === "skills") {
      // Skills from firm_case_studies auto_tags
      const searchCondition = search
        ? sql`AND skill ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT skill AS name
          FROM firm_case_studies,
               jsonb_array_elements_text(auto_tags->'skills') AS skill
          WHERE auto_tags->'skills' IS NOT NULL
            AND status != 'deleted'
            ${searchCondition}
        ) sub
      `;

      dataQuery = sql`
        SELECT skill AS name, COUNT(*)::int AS count
        FROM firm_case_studies,
             jsonb_array_elements_text(auto_tags->'skills') AS skill
        WHERE auto_tags->'skills' IS NOT NULL
          AND status != 'deleted'
          ${searchCondition}
        GROUP BY skill
        ORDER BY count DESC, name ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (type === "industries") {
      // Industries from firm_case_studies auto_tags + industries taxonomy table
      const searchCondition = search
        ? sql`WHERE sub.name ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT name FROM (
            SELECT DISTINCT industry AS name
            FROM firm_case_studies,
                 jsonb_array_elements_text(auto_tags->'industries') AS industry
            WHERE auto_tags->'industries' IS NOT NULL
              AND status != 'deleted'
            UNION
            SELECT DISTINCT name
            FROM industries
            WHERE name IS NOT NULL
          ) raw
          WHERE name IS NOT NULL
          ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
        ) sub
      `;

      dataQuery = sql`
        SELECT sub.name, SUM(sub.cnt)::int AS count
        FROM (
          SELECT industry AS name, COUNT(*)::int AS cnt
          FROM firm_case_studies,
               jsonb_array_elements_text(auto_tags->'industries') AS industry
          WHERE auto_tags->'industries' IS NOT NULL
            AND status != 'deleted'
          GROUP BY industry
          UNION ALL
          SELECT name, 0::int AS cnt
          FROM industries
          WHERE name IS NOT NULL
        ) sub
        ${searchCondition}
        GROUP BY sub.name
        ORDER BY count DESC, sub.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Markets from firm_case_studies auto_tags + markets taxonomy table
      const searchCondition = search
        ? sql`AND market ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT name FROM (
            SELECT DISTINCT market AS name
            FROM firm_case_studies,
                 jsonb_array_elements_text(auto_tags->'markets') AS market
            WHERE auto_tags->'markets' IS NOT NULL
              AND status != 'deleted'
              ${searchCondition}
            UNION
            SELECT DISTINCT name
            FROM markets
            WHERE name IS NOT NULL
              ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
          ) raw
        ) sub
      `;

      dataQuery = sql`
        SELECT sub.name, SUM(sub.cnt)::int AS count
        FROM (
          SELECT market AS name, COUNT(*)::int AS cnt
          FROM firm_case_studies,
               jsonb_array_elements_text(auto_tags->'markets') AS market
          WHERE auto_tags->'markets' IS NOT NULL
            AND status != 'deleted'
            ${searchCondition}
          GROUP BY market
          UNION ALL
          SELECT name, 0::int AS cnt
          FROM markets
          WHERE name IS NOT NULL
            ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
        ) sub
        GROUP BY sub.name
        ORDER BY count DESC, sub.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const totalResult = await db.execute(countQuery);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    const dataResult = await db.execute(dataQuery);
    const attributes = dataResult.rows.map((r) => ({
      name: r.name as string,
      count: Number(r.count),
    }));

    return NextResponse.json({
      attributes,
      total,
      type,
      page,
      limit,
    });
  } catch (error) {
    console.error("[KnowledgeGraph] Attributes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attributes" },
      { status: 500 }
    );
  }
}
