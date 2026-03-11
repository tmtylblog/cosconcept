import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/setup-superadmin
 * Body: { email: string }
 *
 * One-time bootstrap: promotes a user to superadmin.
 * ONLY works when zero superadmins currently exist in the database.
 * Self-sealing — once one superadmin exists, this endpoint is permanently disabled.
 */
export async function POST(req: NextRequest) {
  // Check if any superadmin already exists
  const existing = await db.execute(
    sql`SELECT count(*) as count FROM users WHERE role = 'superadmin'`
  );
  const count = Number((existing.rows[0] as { count: string }).count);

  if (count > 0) {
    return NextResponse.json(
      { error: "Setup already complete — a superadmin already exists." },
      { status: 403 }
    );
  }

  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const result = await db
    .update(users)
    .set({ role: "superadmin" })
    .where(eq(users.email, email.toLowerCase().trim()))
    .returning({ id: users.id, email: users.email, name: users.name });

  if (result.length === 0) {
    return NextResponse.json(
      { error: `No user found with email: ${email}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `${result[0].name ?? result[0].email} is now superadmin. This endpoint is now permanently disabled.`,
    user: result[0],
  });
}
