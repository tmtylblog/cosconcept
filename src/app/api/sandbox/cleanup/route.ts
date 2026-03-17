/**
 * POST /api/sandbox/cleanup
 *
 * Bulk deletes all sandbox test users via auth.api.removeUser().
 * Also cleans up orphaned sandbox orgs.
 * Auth: superadmin session required.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
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

  try {
    // Find all sandbox users
    const usersResult = await db.execute(sql`
      SELECT id, email FROM "users"
      WHERE email LIKE 'support+sandbox-%@joincollectiveos.com'
    `);

    const sandboxUsers = usersResult.rows as { id: string; email: string }[];

    let deleted = 0;
    const errors: { userId: string; email: string; error: string }[] = [];

    // Delete each user via Better Auth (cascades to sessions, accounts, members)
    for (const user of sandboxUsers) {
      try {
        await auth.api.removeUser({ body: { userId: user.id } });
        deleted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ userId: user.id, email: user.email, error: message });
      }
    }

    // Clean up orphaned sandbox orgs (orgs with sandbox metadata and no members)
    const orphanResult = await db.execute(sql`
      DELETE FROM "organizations"
      WHERE metadata::text LIKE '%"source":"sandbox"%'
        AND id NOT IN (SELECT DISTINCT organization_id FROM "members")
      RETURNING id
    `);

    return NextResponse.json({
      success: true,
      deleted,
      orphanedOrgsDeleted: orphanResult.rows.length,
      errors: errors.length > 0 ? errors : undefined,
      totalFound: sandboxUsers.length,
    });
  } catch (error) {
    console.error("[Sandbox] Cleanup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
