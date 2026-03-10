/**
 * POST /api/onboarding/check-domain
 *
 * Check if an organization already exists for a given email domain.
 * Used during org provisioning to detect when someone from the same company
 * has already claimed an org. Returns the partially masked owner email
 * so the new user can contact them to be added.
 *
 * Takes: { domain } — e.g., "chameleon.co"
 * Returns: { claimed: false } or { claimed: true, ownerEmailMasked: "f***@chameleon.co" }
 */

import { NextResponse } from "next/server";
import { eq, and, ne, like } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { organizations, members, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Mask an email: "freddie@chameleon.co" → "f*****e@chameleon.co" */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domain } = (await req.json()) as { domain: string };
    if (!domain) {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }

    const currentUserId = session.user.id;

    // Find orgs whose slug starts with this domain (we encode domain in slug as "domain-xxxx")
    const slugPattern = domain.replace(/\./g, "-");
    const existingOrgs = await db
      .select({
        orgId: organizations.id,
        orgName: organizations.name,
        slug: organizations.slug,
      })
      .from(organizations)
      .where(like(organizations.slug, `${slugPattern}%`));

    if (existingOrgs.length === 0) {
      return NextResponse.json({ claimed: false });
    }

    // Check if any of these orgs have members OTHER than the current user
    for (const org of existingOrgs) {
      const orgMembers = await db
        .select({
          userId: members.userId,
        })
        .from(members)
        .where(
          and(
            eq(members.organizationId, org.orgId),
            ne(members.userId, currentUserId)
          )
        );

      if (orgMembers.length > 0) {
        // Found an org with a different user — get the owner's email
        const ownerMember = orgMembers[0];
        const [owner] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, ownerMember.userId))
          .limit(1);

        return NextResponse.json({
          claimed: true,
          orgName: org.orgName,
          ownerEmailMasked: owner ? maskEmail(owner.email) : "***@" + domain,
        });
      }
    }

    // Orgs exist but only with current user (or empty) — not truly claimed by someone else
    return NextResponse.json({ claimed: false });
  } catch (error) {
    console.error("[CheckDomain] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
