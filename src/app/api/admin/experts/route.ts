import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/experts?q=&classification=expert&page=1&limit=50&companyId=
 *
 * Returns imported contacts with optional classification filter, search, and pagination.
 * Includes company info via LEFT JOIN.
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

  const classification = req.nextUrl.searchParams.get("classification") ?? "all";
  const search = req.nextUrl.searchParams.get("q") ?? "";
  const companyId = req.nextUrl.searchParams.get("companyId") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions: ReturnType<typeof sql>[] = [];

    if (classification !== "all") {
      conditions.push(sql`ic.expert_classification = ${classification}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        ic.name ILIKE ${pattern}
        OR ic.email ILIKE ${pattern}
        OR ic.title ILIKE ${pattern}
        OR ic.first_name ILIKE ${pattern}
        OR ic.last_name ILIKE ${pattern}
        OR comp.name ILIKE ${pattern}
      )`);
    }

    if (companyId) {
      conditions.push(sql`ic.company_id = ${companyId}`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // Get counts by classification
    const countsResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE expert_classification = 'expert')::int AS expert_count,
        COUNT(*) FILTER (WHERE expert_classification = 'internal')::int AS internal_count,
        COUNT(*) FILTER (WHERE expert_classification = 'ambiguous' OR expert_classification IS NULL)::int AS ambiguous_count,
        COUNT(*)::int AS total_count
      FROM imported_contacts
    `);
    const counts = {
      expert: Number(countsResult.rows[0]?.expert_count ?? 0),
      internal: Number(countsResult.rows[0]?.internal_count ?? 0),
      ambiguous: Number(countsResult.rows[0]?.ambiguous_count ?? 0),
      total: Number(countsResult.rows[0]?.total_count ?? 0),
    };

    // Get filtered total
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM imported_contacts ic
      LEFT JOIN imported_companies comp ON comp.id = ic.company_id
      ${whereClause}
    `);
    const total = Number(totalResult.rows[0]?.total ?? 0);

    // Get paginated results
    const result = await db.execute(sql`
      SELECT
        ic.id,
        ic.source_id AS "sourceId",
        ic.first_name AS "firstName",
        ic.last_name AS "lastName",
        ic.name,
        ic.email,
        ic.title,
        ic.expert_classification AS "expertClassification",
        ic.photo_url AS "photoUrl",
        ic.linkedin_url AS "linkedinUrl",
        ic.headline,
        ic.short_bio AS "shortBio",
        ic.city,
        ic.state,
        ic.country,
        ic.is_partner AS "isPartner",
        ic.is_icp AS "isIcp",
        ic.review_tags AS "reviewTags",
        ic.created_at AS "createdAt",
        comp.id AS "companyId",
        comp.name AS "companyName",
        comp.domain AS "companyDomain"
      FROM imported_contacts ic
      LEFT JOIN imported_companies comp ON comp.id = ic.company_id
      ${whereClause}
      ORDER BY ic.name ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Transform rows
    const contacts = result.rows.map((r) => ({
      id: r.id,
      sourceId: r.sourceId,
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
      isPartner: r.isPartner,
      isIcp: r.isIcp,
      reviewTags: r.reviewTags,
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
