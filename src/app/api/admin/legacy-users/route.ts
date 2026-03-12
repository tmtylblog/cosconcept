import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/legacy-users
 *
 * List legacy users with filtering and search.
 *
 * Query params:
 *   search — search by name or email
 *   role   — filter by legacy role (e.g., "Admin", "Expert")
 *   firmId — filter by linked service firm
 *   matched — "true" for matched to firm, "false" for unmatched
 *   page   — pagination (default 1)
 *   limit  — items per page (default 50, max 200)
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

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const roleFilter = url.searchParams.get("role");
  const firmIdFilter = url.searchParams.get("firmId");
  const matchedFilter = url.searchParams.get("matched");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions: string[] = [];

    if (search && search.length >= 2) {
      const escaped = search.replace(/'/g, "''");
      conditions.push(
        `(LOWER(lu.first_name || ' ' || lu.last_name) LIKE LOWER('%${escaped}%') OR LOWER(lu.email) LIKE LOWER('%${escaped}%') OR LOWER(lu.legacy_org_name) LIKE LOWER('%${escaped}%'))`
      );
    }

    if (roleFilter) {
      const escaped = roleFilter.replace(/'/g, "''");
      conditions.push(`lu.legacy_roles @> '"${escaped}"'`);
    }

    if (firmIdFilter) {
      conditions.push(`lu.firm_id = '${firmIdFilter.replace(/'/g, "''")}'`);
    }

    if (matchedFilter === "true") {
      conditions.push("lu.firm_id IS NOT NULL");
    } else if (matchedFilter === "false") {
      conditions.push("lu.firm_id IS NULL");
    }

    const whereClause =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countResult = await db.execute(
      sql.raw(`SELECT COUNT(*)::int AS count FROM legacy_users lu ${whereClause}`)
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    // Fetch users with firm name
    const usersResult = await db.execute(
      sql.raw(`
        SELECT
          lu.id,
          lu.legacy_user_id AS "legacyUserId",
          lu.legacy_org_id AS "legacyOrgId",
          lu.legacy_org_name AS "legacyOrgName",
          lu.first_name AS "firstName",
          lu.last_name AS "lastName",
          lu.email,
          lu.title,
          lu.legacy_roles AS "legacyRoles",
          lu.firm_id AS "firmId",
          sf.name AS "firmName",
          sf.website AS "firmWebsite",
          lu.user_id AS "userId",
          lu.created_at AS "createdAt"
        FROM legacy_users lu
        LEFT JOIN service_firms sf ON sf.id = lu.firm_id
        ${whereClause}
        ORDER BY lu.legacy_org_name ASC NULLS LAST, lu.last_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `)
    );

    // Stats
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(firm_id)::int AS "matchedCount",
        COUNT(*) FILTER (WHERE firm_id IS NULL)::int AS "unmatchedCount",
        COUNT(DISTINCT legacy_org_name)::int AS "uniqueOrgs",
        COUNT(DISTINCT firm_id) FILTER (WHERE firm_id IS NOT NULL)::int AS "uniqueFirms"
      FROM legacy_users
    `);

    // Role distribution
    const rolesResult = await db.execute(sql`
      SELECT role, COUNT(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text(legacy_roles) AS role
        FROM legacy_users
      ) r
      GROUP BY role
      ORDER BY count DESC
    `);

    return NextResponse.json({
      users: usersResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: statsResult.rows[0] ?? {},
      roles: rolesResult.rows,
    });
  } catch (error) {
    console.error("[Admin] Legacy users error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch legacy users", detail: message },
      { status: 500 }
    );
  }
}
