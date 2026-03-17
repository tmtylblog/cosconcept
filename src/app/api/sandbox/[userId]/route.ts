/**
 * DELETE /api/sandbox/:userId
 *
 * Deletes a single sandbox user + their org (if sole member).
 * Auth: superadmin session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, members, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Auth: superadmin only
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
    // Verify this is actually a sandbox user
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.email.match(/^support\+sandbox-.*@joincollectiveos\.com$/)) {
      return NextResponse.json(
        { error: "Not a sandbox user — refusing to delete" },
        { status: 400 }
      );
    }

    // Find their org memberships
    const userMembers = await db
      .select({ orgId: members.organizationId })
      .from(members)
      .where(eq(members.userId, userId));

    // Delete the user via Better Auth (cascades to sessions, accounts, members)
    await auth.api.removeUser({ body: { userId } });

    // Clean up orgs that are now empty (sandbox orgs only)
    for (const m of userMembers) {
      const remainingMembers = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.organizationId, m.orgId))
        .limit(1);

      if (remainingMembers.length === 0) {
        // Check it's a sandbox org before deleting
        const [org] = await db
          .select({ metadata: organizations.metadata })
          .from(organizations)
          .where(eq(organizations.id, m.orgId))
          .limit(1);

        if (org?.metadata?.includes('"source":"sandbox"') || org?.metadata?.includes('"source": "sandbox"')) {
          // service_firms and subscriptions cascade from org delete
          await db.delete(organizations).where(eq(organizations.id, m.orgId));
        }
      }
    }

    return NextResponse.json({ success: true, userId, email: user.email });
  } catch (error) {
    console.error("[Sandbox] Delete user error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
