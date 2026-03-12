/**
 * GET /api/settings/team?organizationId=...
 *
 * Returns real org members from the members + users tables.
 * Authenticated users only — must be a member of the org.
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { members, users } from "@/lib/db/schema";

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

  // Verify caller is a member of this org
  const [callerMembership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.userId, session.user.id)
      )
    )
    .limit(1);

  if (!callerMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all members with user details
  const rows = await db
    .select({
      id: members.id,
      userId: members.userId,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
      role: members.role,
      banned: users.banned,
      createdAt: members.createdAt,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, organizationId))
    .orderBy(members.createdAt);

  return Response.json({ members: rows });
}
