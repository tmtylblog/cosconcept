import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/experts?q=&division=all&page=1&limit=50&firmId=
 *
 * Returns expert profiles with optional division filter, search, and pagination.
 * Includes firm info via LEFT JOIN on service_firms.
 *
 * Track A update: Now queries expert_profiles (canonical)
 * instead of truncated imported_contacts.
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

  const division = req.nextUrl.searchParams.get("division") ?? "all";
  // Also accept "classification" for backward compat
  const classification = req.nextUrl.searchParams.get("classification") ?? "";
  const search = req.nextUrl.searchParams.get("q") ?? "";
  const firmId = req.nextUrl.searchParams.get("firmId") ?? req.nextUrl.searchParams.get("companyId") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions: ReturnType<typeof sql>[] = [];

    // Division filter (Track A) or classification filter (legacy compat)
    const filterValue = division !== "all" ? division : classification !== "all" ? classification : "";
    if (filterValue && filterValue !== "all") {
      conditions.push(sql`ep.division = ${filterValue}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        ep.full_name ILIKE ${pattern}
        OR ep.email ILIKE ${pattern}
        OR ep.title ILIKE ${pattern}
        OR ep.first_name ILIKE ${pattern}
        OR ep.last_name ILIKE ${pattern}
        OR sf.name ILIKE ${pattern}
      )`);
    }

    if (firmId) {
      conditions.push(sql`ep.firm_id = ${firmId}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get counts by division
    const countsResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE division = 'expert')::int AS expert_count,
        COUNT(*) FILTER (WHERE division = 'internal')::int AS internal_count,
        COUNT(*) FILTER (WHERE division IS NULL OR division NOT IN ('expert', 'internal'))::int AS other_count,
        COUNT(*)::int AS total_count
      FROM expert_profiles
    `);
    const counts = {
      expert: Number(countsResult.rows[0]?.expert_count ?? 0),
      internal: Number(countsResult.rows[0]?.internal_count ?? 0),
      ambiguous: Number(countsResult.rows[0]?.other_count ?? 0),
      total: Number(countsResult.rows[0]?.total_count ?? 0),
    };

    // Get filtered total
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM expert_profiles ep
      LEFT JOIN service_firms sf ON sf.id = ep.firm_id
      ${whereClause}
    `);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    // Get paginated results
    const result = await db.execute(sql`
      SELECT
        ep.id,
        ep.first_name AS "firstName",
        ep.last_name AS "lastName",
        ep.full_name AS "name",
        ep.email,
        ep.title,
        ep.division AS "expertClassification",
        ep.photo_url AS "photoUrl",
        ep.linkedin_url AS "linkedinUrl",
        ep.headline,
        ep.bio AS "shortBio",
        ep.location AS "city",
        NULL AS "state",
        NULL AS "country",
        ep.top_skills AS "topSkills",
        ep.top_industries AS "topIndustries",
        ep.created_at AS "createdAt",
        sf.id AS "companyId",
        sf.name AS "companyName",
        sf.website AS "companyDomain"
      FROM expert_profiles ep
      LEFT JOIN service_firms sf ON sf.id = ep.firm_id
      ${whereClause}
      ORDER BY ep.full_name ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Transform rows (backward-compatible shape)
    const contacts = result.rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      name: r.name,
      email: r.email,
      title: r.title,
      expertClassification: r.expertClassification,
      photoUrl: r.photoUrl,
      linkedinUrl: r.linkedinUrl,
      headline: r.headline,
      shortBio: r.shortBio,
      city: r.city,
      state: r.state,
      country: r.country,
      topSkills: r.topSkills,
      topIndustries: r.topIndustries,
      createdAt: r.createdAt,
      company: r.companyId
        ? {
            id: r.companyId,
            name: r.companyName,
            domain: r.companyDomain,
          }
        : null,
    }));

    return NextResponse.json({
      contacts,
      total,
      page,
      limit,
      counts,
    });
  } catch (error) {
    console.error("[Admin] Experts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch experts" },
      { status: 500 }
    );
  }
}
