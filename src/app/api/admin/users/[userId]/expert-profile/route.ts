import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[userId]/expert-profile
 *
 * Looks up the user by ID, then matches against expert_profiles
 * by userId or email to find associated expert profiles.
 *
 * Track A update: Now queries expert_profiles (canonical)
 * instead of truncated imported_contacts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  try {
    // Get user email
    const userResult = await db.execute(sql`
      SELECT email FROM users WHERE id = ${userId} LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userEmail = userResult.rows[0].email as string;

    // Match against expert_profiles by userId first, then by email
    const matches = await db.execute(sql`
      SELECT
        ep.id,
        ep.full_name AS "name",
        ep.first_name AS "firstName",
        ep.last_name AS "lastName",
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
        sf.id AS "companyId",
        sf.name AS "companyName",
        sf.website AS "companyDomain"
      FROM expert_profiles ep
      LEFT JOIN service_firms sf ON sf.id = ep.firm_id
      WHERE ep.user_id = ${userId}
         OR LOWER(ep.email) = LOWER(${userEmail})
      LIMIT 5
    `);

    if (matches.rows.length === 0) {
      return NextResponse.json({ match: null });
    }

    const profiles = matches.rows.map((r) => ({
      id: r.id,
      name: r.name,
      firstName: r.firstName,
      lastName: r.lastName,
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
      company: r.companyId
        ? { id: r.companyId, name: r.companyName, domain: r.companyDomain }
        : null,
    }));

    return NextResponse.json({
      match: profiles[0],
      allMatches: profiles,
    });
  } catch (error) {
    console.error("[Admin] Expert profile lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up expert profile" },
      { status: 500 }
    );
  }
}
