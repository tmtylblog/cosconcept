import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, inArray, or, ilike, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];

async function checkSuperadmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

// GET /api/admin/staff — list all staff users
export async function GET(req: NextRequest) {
  if (!await checkSuperadmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  let query = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      jobTitle: users.jobTitle,
      createdAt: users.createdAt,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(
      search
        ? or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`),
          )
        : inArray(users.role, STAFF_ROLES)
    )
    .orderBy(desc(users.createdAt))
    .$dynamic();

  // If searching, still filter to staff roles
  if (search) {
    query = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        banned: users.banned,
        jobTitle: users.jobTitle,
        createdAt: users.createdAt,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
        )
      )
      .orderBy(desc(users.createdAt))
      .$dynamic();
  }

  const staff = await query;
  return NextResponse.json({ staff });
}

// POST /api/admin/staff — invite a new staff member
export async function POST(req: NextRequest) {
  const session = await checkSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    name: string;
    email: string;
    role: string;
  };

  if (!body.name || !body.email || !body.role) {
    return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 });
  }

  if (!STAFF_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if user already exists
  const existing = await db.select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    // User exists — just update their role
    await db.update(users)
      .set({ role: body.role })
      .where(eq(users.id, existing[0].id));

    return NextResponse.json({ message: "Role updated for existing user", userId: existing[0].id });
  }

  // Create new user with a random temporary password
  const tempPassword = randomBytes(16).toString("hex");
  const headersList = await headers();

  const created = await auth.api.createUser({
    body: {
      name: body.name,
      email: body.email.toLowerCase(),
      password: tempPassword,
      role: body.role,
    },
    headers: headersList,
  });

  if (!created?.user) {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }

  // Send password reset email so they can set their own password
  try {
    await auth.api.forgetPassword({
      body: {
        email: body.email.toLowerCase(),
        redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
      },
    });
  } catch (err) {
    // Non-fatal — user was created, just couldn't send the invite email
    console.error("[staff invite] forgetPassword failed:", err);
    return NextResponse.json({
      message: "User created but invite email failed to send. Ask them to use Forgot Password.",
      userId: created.user.id,
      emailSent: false,
    });
  }

  return NextResponse.json({
    message: "User invited successfully",
    userId: created.user.id,
    emailSent: true,
  });
}

// PATCH /api/admin/staff — change a user's role
export async function PATCH(req: NextRequest) {
  const session = await checkSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { userId: string; role: string };
  if (!body.userId || !body.role) {
    return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
  }

  const validRoles = [...STAFF_ROLES, "user"];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent self-demotion
  const me = session.user;
  if (me.id === body.userId && body.role === "user") {
    return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
  }

  await db.update(users)
    .set({ role: body.role })
    .where(eq(users.id, body.userId));

  return NextResponse.json({ message: "Role updated" });
}

// DELETE /api/admin/staff — revoke admin access (demote to user)
export async function DELETE(req: NextRequest) {
  const session = await checkSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (session.user.id === userId) {
    return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
  }

  await db.update(users)
    .set({ role: "user" })
    .where(eq(users.id, userId));

  return NextResponse.json({ message: "Access revoked" });
}
