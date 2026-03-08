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
      const searchCondition = search
        ? sql`AND skill->>'name' ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT skill->>'name' AS name
          FROM imported_case_studies, jsonb_array_elements(skills) AS skill
          WHERE skills IS NOT NULL ${searchCondition}
        ) sub
      `;

      dataQuery = sql`
        SELECT skill->>'name' AS name, COUNT(*)::int AS count
        FROM imported_case_studies, jsonb_array_elements(skills) AS skill
        WHERE skills IS NOT NULL ${searchCondition}
        GROUP BY skill->>'name'
        ORDER BY count DESC, name ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (type === "industries") {
      const searchCondition = search
        ? sql`WHERE sub.name ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT name FROM (
            SELECT DISTINCT industry AS name
            FROM imported_companies
            WHERE industry IS NOT NULL
            UNION ALL
            SELECT DISTINCT ind->>'name' AS name
            FROM imported_case_studies, jsonb_array_elements(industries) AS ind
            WHERE industries IS NOT NULL
          ) raw
          WHERE name IS NOT NULL
          ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
        ) sub
      `;

      dataQuery = sql`
        SELECT sub.name, SUM(sub.cnt)::int AS count
        FROM (
          SELECT industry AS name, COUNT(*)::int AS cnt
          FROM imported_companies
          WHERE industry IS NOT NULL
          GROUP BY industry
          UNION ALL
          SELECT ind->>'name' AS name, COUNT(*)::int AS cnt
          FROM imported_case_studies, jsonb_array_elements(industries) AS ind
          WHERE industries IS NOT NULL
          GROUP BY ind->>'name'
        ) sub
        ${searchCondition}
        GROUP BY sub.name
        ORDER BY count DESC, sub.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // markets
      const searchCondition = search
        ? sql`AND market ILIKE ${`%${search}%`}`
        : sql``;

      countQuery = sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT DISTINCT market AS name
          FROM imported_case_studies, jsonb_array_elements_text(markets) AS market
          WHERE markets IS NOT NULL ${searchCondition}
        ) sub
      `;

      dataQuery = sql`
        SELECT market AS name, COUNT(*)::int AS count
        FROM imported_case_studies, jsonb_array_elements_text(markets) AS market
        WHERE markets IS NOT NULL ${searchCondition}
        GROUP BY market
        ORDER BY count DESC, market ASC
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
