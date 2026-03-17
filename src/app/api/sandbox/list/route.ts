/**
 * GET /api/sandbox/list
 *
 * Returns all sandbox test users with their org/firm info.
 * Auth: superadmin session required.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
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
    const result = await db.execute(sql`
      SELECT
        u.id AS "userId",
        u.name,
        u.email,
        u.created_at AS "createdAt",
        o.id AS "orgId",
        o.name AS "orgName",
        o.metadata AS "orgMetadata",
        sf.id AS "firmId",
        sf.website,
        sf.enrichment_status AS "enrichmentStatus"
      FROM "users" u
      LEFT JOIN "members" m ON m.user_id = u.id
      LEFT JOIN "organizations" o ON o.id = m.organization_id
      LEFT JOIN "service_firms" sf ON sf.organization_id = o.id
      WHERE u.email LIKE 'support+sandbox-%@joincollectiveos.com'
      ORDER BY u.created_at DESC
    `);

    return NextResponse.json({
      sessions: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("[Sandbox] List error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
