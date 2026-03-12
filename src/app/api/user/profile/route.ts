import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/user/profile
 * Updates profile fields that Better Auth's updateUser doesn't handle natively.
 * Body: { jobTitle?, phone?, linkedinUrl? }
 */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    jobTitle?: string;
    phone?: string;
    linkedinUrl?: string;
  };

  // Only set defined fields — don't overwrite others with undefined
  const updates: Record<string, string | null> = {};
  if ("jobTitle" in body) updates.jobTitle = body.jobTitle?.trim() || null;
  if ("phone" in body) updates.phone = body.phone?.trim() || null;
  if ("linkedinUrl" in body) updates.linkedinUrl = body.linkedinUrl?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/user/profile
 * Returns the current user's extended profile fields.
 */
export async function GET(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({
      jobTitle: users.jobTitle,
      phone: users.phone,
      linkedinUrl: users.linkedinUrl,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return NextResponse.json(user ?? {});
}
