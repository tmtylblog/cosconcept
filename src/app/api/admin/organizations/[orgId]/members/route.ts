import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/organizations/[orgId]/members
 * Lists members of an organization with user details.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  // Verify superadmin role
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    const rows = await db.execute(sql`
      SELECT
        m.id,
        m.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        m.role
      FROM "members" m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId}
      ORDER BY m.created_at ASC
    `);

    return NextResponse.json({ members: rows.rows });
  } catch (error) {
    console.error("[Admin] Org members error:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}
