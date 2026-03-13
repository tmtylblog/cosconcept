/**
 * POST /api/admin/promote-user
 *
 * One-time utility to promote a user to superadmin by email.
 * Protected by ADMIN_SECRET header (not session-based, so it can bootstrap the first admin).
 *
 * Usage:
 *   POST /api/admin/promote-user
 *   Headers: { "x-admin-secret": "<ADMIN_SECRET>" }
 *   Body: { "email": "freddie@chameleon.co", "role": "superadmin" }
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["superadmin", "admin", "growth_ops", "customer_success", "user"];

export async function POST(req: NextRequest) {
  // Authenticate via admin secret (same pattern used by neo4j/seed, import/* routes)
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: "email and role are required" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    // Find user by email
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
    }

    const previousRole = user.role;

    // Update role
    await db
      .update(users)
      .set({ role })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
      previousRole,
      newRole: role,
    });
  } catch (error) {
    console.error("[Admin] Promote user error:", error);
    return NextResponse.json(
      { error: "Failed to promote user", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
