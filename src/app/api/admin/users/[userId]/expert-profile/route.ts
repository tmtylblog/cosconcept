import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[userId]/expert-profile
 *
 * Looks up the user by ID, then matches their email against
 * imported_contacts.email to find associated expert profiles.
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

    // Match against imported_contacts by email
    const matches = await db.execute(sql`
      SELECT
        ic.id,
        ic.name,
        ic.first_name AS "firstName",
        ic.last_name AS "lastName",
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
        comp.id AS "companyId",
        comp.name AS "companyName",
        comp.domain AS "companyDomain"
      FROM imported_contacts ic
      LEFT JOIN imported_companies comp ON comp.id = ic.company_id
      WHERE LOWER(ic.email) = LOWER(${userEmail})
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
      isPartner: r.isPartner,
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
