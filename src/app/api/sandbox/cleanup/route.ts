/**
 * POST /api/sandbox/cleanup
 *
 * Bulk deletes all sandbox test users and their orgs via direct SQL.
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
    // Delete partner_preferences for sandbox firms first (not FK-cascaded from org)
    const prefResult = await db.execute(sql`
      DELETE FROM "partner_preferences"
      WHERE firm_id IN (
        SELECT sf.id FROM "service_firms" sf
        JOIN "organizations" o ON o.id = sf.organization_id
        WHERE o.metadata::text LIKE '%"sandbox"%'
      )
      RETURNING firm_id
    `);

    // Delete all sandbox users — cascades to sessions, accounts, members via FK
    const userResult = await db.execute(sql`
      DELETE FROM "users"
      WHERE email LIKE 'support+sandbox-%@joincollectiveos.com'
      RETURNING id
    `);

    // Clean up orphaned sandbox orgs (now memberless) — cascades to service_firms, subscriptions
    const orgResult = await db.execute(sql`
      DELETE FROM "organizations"
      WHERE metadata::text LIKE '%"sandbox"%'
        AND id NOT IN (SELECT DISTINCT organization_id FROM "members")
      RETURNING id
    `);

    return NextResponse.json({
      success: true,
      deleted: userResult.rows.length,
      orphanedOrgsDeleted: orgResult.rows.length,
      preferencesDeleted: prefResult.rows.length,
    });
  } catch (error) {
    console.error("[Sandbox] Cleanup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
