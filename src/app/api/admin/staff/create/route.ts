/**
 * POST /api/admin/staff/create
 *
 * Create a new admin staff member directly — no frontend signup required.
 * If user exists, just promotes them. If not, creates the account.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];

export async function POST(req: Request) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (session?.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, name, role, password } = (await req.json()) as {
    email: string;
    name?: string;
    role: string;
    password?: string;
  };

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const [existing] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    // User exists — just promote
    await db.update(users).set({ role }).where(eq(users.id, existing.id));
    return NextResponse.json({
      success: true,
      action: "promoted",
      user: { id: existing.id, name: existing.name, email: existing.email, role },
    });
  }

  // User doesn't exist — create via Better Auth
  const tempPassword = password || `COS-${crypto.randomUUID().slice(0, 8)}!`;
  try {
    const result = await auth.api.signUpEmail({
      headers: headersList,
      body: {
        email: normalizedEmail,
        password: tempPassword,
        name: name || normalizedEmail.split("@")[0],
      },
    });

    if (!result?.user?.id) {
      return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
    }

    // Set the admin role (signUp creates with role "user")
    await db.update(users).set({ role }).where(eq(users.id, result.user.id));

    return NextResponse.json({
      success: true,
      action: "created",
      user: { id: result.user.id, name: result.user.name, email: normalizedEmail, role },
      tempPassword,
    });
  } catch (err) {
    return NextResponse.json({
      error: "Failed to create user: " + (err instanceof Error ? err.message : String(err)),
    }, { status: 500 });
  }
}
