import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, attributionEvents, attributionTouchpoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/user/profile
 * Updates profile fields that Better Auth's updateUser doesn't handle natively.
 * Body: { jobTitle?, phone?, linkedinUrl? }
 *
 * When linkedinUrl changes, triggers re-attribution to match the user
 * against LinkedIn conversations and campaign invites.
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

  // Check if LinkedIn URL is changing — triggers re-attribution
  let linkedinUrlChanged = false;
  if ("linkedinUrl" in updates) {
    const [current] = await db
      .select({ linkedinUrl: users.linkedinUrl })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const oldUrl = current?.linkedinUrl?.trim() || null;
    const newUrl = updates.linkedinUrl?.trim() || null;
    linkedinUrlChanged = oldUrl !== newUrl && !!newUrl;
  }

  await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  // Re-run attribution when LinkedIn URL changes
  if (linkedinUrlChanged) {
    try {
      // Clear old attribution data so re-check runs fresh
      await db
        .delete(attributionTouchpoints)
        .where(eq(attributionTouchpoints.userId, session.user.id));
      await db
        .delete(attributionEvents)
        .where(eq(attributionEvents.userId, session.user.id));

      // Enqueue fresh attribution check with the new LinkedIn URL
      const nameParts = (session.user.name ?? "").split(" ");
      await inngest.send({ name: "growth/attribution-check", data: {
        userId: session.user.id,
        email: session.user.email ?? "",
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(" ") || null,
        linkedinUrl: updates.linkedinUrl,
      } });
    } catch {
      // Re-attribution failure is non-critical — profile update still succeeds
    }
  }

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
