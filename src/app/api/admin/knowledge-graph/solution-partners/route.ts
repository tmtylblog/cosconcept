import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { solutionPartners } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/knowledge-graph/solution-partners?q=&category=&page=1&limit=50
 *
 * Returns paginated solution partners with search and category filter.
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
  const category = req.nextUrl.searchParams.get("category") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        ${solutionPartners.name} ILIKE ${pattern}
        OR ${solutionPartners.domain} ILIKE ${pattern}
      )`);
    }

    if (category) {
      conditions.push(sql`${solutionPartners.category} = ${category}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get filtered total
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM solution_partners sp
      ${whereClause}
    `);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    // Get distinct categories for filter UI
    const categoriesResult = await db.execute(sql`
      SELECT DISTINCT category
      FROM solution_partners
      WHERE category IS NOT NULL
      ORDER BY category ASC
    `);
    const categories = categoriesResult.rows
      .map((r) => r.category as string)
      .filter(Boolean);

    // Get paginated results
    const result = await db.execute(sql`
      SELECT
        sp.id,
        sp.name,
        sp.domain,
        sp.category,
        sp.description,
        sp.logo_url AS "logoUrl",
        sp.website_url AS "websiteUrl",
        sp.is_verified AS "isVerified",
        sp.created_at AS "createdAt"
      FROM solution_partners sp
      ${whereClause}
      ORDER BY sp.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return NextResponse.json({
      solutionPartners: result.rows,
      total,
      categories,
      page,
      limit,
    });
  } catch (error) {
    console.error("[KnowledgeGraph] Solution partners error:", error);
    return NextResponse.json(
      { error: "Failed to fetch solution partners" },
      { status: 500 }
    );
  }
}
