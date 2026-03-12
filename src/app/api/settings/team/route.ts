/**
 * GET /api/settings/team?organizationId=...
 *
 * Returns org members + expert roster for the org's firm.
 * Caller must be a member of the org.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { members, users, serviceFirms, expertProfiles, verifications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) {
    return Response.json({ error: "organizationId required" }, { status: 400 });
  }

  // Verify caller is a member + get their role
  const [callerMembership] = await db
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, session.user.id)))
    .limit(1);

  if (!callerMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Members with user details
  const memberRows = await db
    .select({
      id: members.id,
      userId: members.userId,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
      userJobTitle: users.jobTitle,
      role: members.role,
      banned: users.banned,
      createdAt: members.createdAt,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, organizationId))
    .orderBy(members.createdAt);

  // Find firm for this org
  const [firm] = await db
    .select({ id: serviceFirms.id, name: serviceFirms.name })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, organizationId))
    .limit(1);

  // Expert roster (if firm exists)
  let experts: {
    id: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    photoUrl: string | null;
    linkedinUrl: string | null;
    userId: string | null;
    division: string;
    claimStatus: "claimed" | "invited" | "expired" | "unclaimed";
  }[] = [];

  if (firm) {
    const expertRows = await db
      .select({
        id: expertProfiles.id,
        fullName: expertProfiles.fullName,
        firstName: expertProfiles.firstName,
        lastName: expertProfiles.lastName,
        email: expertProfiles.email,
        title: expertProfiles.title,
        photoUrl: expertProfiles.photoUrl,
        linkedinUrl: expertProfiles.linkedinUrl,
        userId: expertProfiles.userId,
        division: expertProfiles.division,
      })
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id))
      .orderBy(expertProfiles.fullName);

    // Determine invite status for unclaimed experts
    const unclaimedIds = expertRows.filter((e) => !e.userId).map((e) => e.id);
    const inviteMap = new Map<string, "invited" | "expired">();

    if (unclaimedIds.length > 0) {
      for (const id of unclaimedIds) {
        const [ver] = await db
          .select({ expiresAt: verifications.expiresAt })
          .from(verifications)
          .where(eq(verifications.identifier, `expert-claim:${id}`))
          .limit(1);
        if (ver) {
          inviteMap.set(id, ver.expiresAt > new Date() ? "invited" : "expired");
        }
      }
    }

    experts = expertRows.map((e) => ({
      ...e,
      division: e.division ?? "expert",
      claimStatus: e.userId
        ? "claimed"
        : (inviteMap.get(e.id) ?? "unclaimed"),
    }));
  }

  return Response.json({
    members: memberRows,
    experts,
    callerRole: callerMembership.role,
    firmName: firm?.name ?? null,
  });
}
