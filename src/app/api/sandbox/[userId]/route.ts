/**
 * DELETE /api/sandbox/:userId
 *
 * Deletes a single sandbox user + their org (if sole member).
 * Uses direct SQL deletes instead of auth.api.removeUser() for reliability.
 * Auth: superadmin session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

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
    const userResult = await db.execute(sql`
      SELECT id, email FROM "users" WHERE id = ${userId} LIMIT 1
    `);
    const user = userResult.rows[0] as { id: string; email: string } | undefined;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!String(user.email).match(/^support\+sandbox-.*@joincollectiveos\.com$/)) {
      return NextResponse.json(
        { error: "Not a sandbox user — refusing to delete" },
        { status: 400 }
      );
    }

    // Find their org memberships before deleting
    const memberResult = await db.execute(sql`
      SELECT organization_id AS "orgId" FROM "members" WHERE user_id = ${userId}
    `);
    const orgIds = (memberResult.rows as { orgId: string }[]).map((r) => r.orgId);

    // Delete user — cascades to sessions, accounts, members via FK constraints
    await db.execute(sql`DELETE FROM "users" WHERE id = ${userId}`);

    // Clean up sandbox orgs that are now empty
    let orgsDeleted = 0;
    for (const orgId of orgIds) {
      const remaining = await db.execute(sql`
        SELECT id FROM "members" WHERE organization_id = ${orgId} LIMIT 1
      `);
      if (remaining.rows.length === 0) {
        // Verify it's a sandbox org
        const orgResult = await db.execute(sql`
          SELECT metadata FROM "organizations" WHERE id = ${orgId} LIMIT 1
        `);
        const meta = String(orgResult.rows[0]?.metadata ?? "");
        if (meta.includes('"sandbox"')) {
          // Delete partner_preferences for the firm (not FK-cascaded from org)
          await db.execute(sql`
            DELETE FROM "partner_preferences" WHERE firm_id = ${"firm_" + orgId}
          `);
          // Delete org — cascades to service_firms, subscriptions via FK
          await db.execute(sql`DELETE FROM "organizations" WHERE id = ${orgId}`);
          orgsDeleted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      email: user.email,
      orgsDeleted,
    });
  } catch (error) {
    console.error("[Sandbox] Delete user error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
