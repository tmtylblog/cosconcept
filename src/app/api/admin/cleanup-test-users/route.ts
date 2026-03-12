import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * POST /api/admin/cleanup-test-users
 *
 * Finds and deletes support+*@joincollectiveos.com test users
 * that were created before the simulate/impersonate feature.
 *
 * Query params:
 *   dryRun=true — preview only (default: true for safety)
 */
export async function POST(req: NextRequest) {
  // Auth check — superadmin only
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") !== "false"; // default true

  try {
    // Find all support+*@joincollectiveos.com users
    const usersResult = await db.execute(sql`
      SELECT u.id, u.name, u.email, u.role, u.created_at AS "createdAt"
      FROM "user" u
      WHERE u.email LIKE 'support+%@joincollectiveos.com'
      ORDER BY u.created_at DESC
    `);

    const testUsers = usersResult.rows as {
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: string;
    }[];

    if (dryRun) {
      // Also check their org memberships
      const membershipResult = testUsers.length > 0
        ? await db.execute(sql`
            SELECT m.user_id AS "userId", m.organization_id AS "orgId", m.role,
                   o.name AS "orgName"
            FROM member m
            JOIN organization o ON o.id = m.organization_id
            WHERE m.user_id = ANY(${testUsers.map((u) => u.id)})
          `)
        : { rows: [] };

      return NextResponse.json({
        dryRun: true,
        usersFound: testUsers.length,
        users: testUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
        })),
        memberships: membershipResult.rows,
      });
    }

    // Delete each user using Better Auth admin API
    let deleted = 0;
    const errors: { userId: string; email: string; error: string }[] = [];

    for (const user of testUsers) {
      try {
        await auth.api.removeUser({
          body: { userId: user.id },
        });
        deleted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ userId: user.id, email: user.email, error: message });
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      errors: errors.length > 0 ? errors : undefined,
      totalFound: testUsers.length,
    });
  } catch (error) {
    console.error("[Admin] Cleanup test users error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
