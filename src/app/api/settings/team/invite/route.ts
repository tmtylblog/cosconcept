/**
 * POST /api/settings/team/invite
 * Invites a user to the organization by email.
 * Caller must be owner or admin of the org.
 */

import { headers } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { members, invitations, subscriptions } from "@/lib/db/schema";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, email, role = "member" } = await req.json() as {
    organizationId: string;
    email: string;
    role?: "admin" | "member";
  };

  if (!organizationId || !email) {
    return NextResponse.json({ error: "organizationId and email required" }, { status: 400 });
  }

  // Verify caller is owner or admin
  const [callerMembership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, session.user.id)))
    .limit(1);

  if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
    return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
  }

  // Check seat limit
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  const plan = (sub?.plan ?? "free") as PlanId;
  const limit = PLAN_LIMITS[plan].members;

  if (limit !== Infinity) {
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(members)
      .where(eq(members.organizationId, organizationId));

    const currentCount = countResult[0]?.count ?? 0;

    if (currentCount >= limit) {
      const extraPrice = PLAN_LIMITS[plan].additionalSeatPriceUsd;
      return NextResponse.json({
        error: "seat_limit_reached",
        additionalSeatPriceUsd: extraPrice,
        currentPlan: plan,
      }, { status: 402 });
    }
  }

  // Write invitation directly to the invitations table (Better Auth's format)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  try {
    await db
      .insert(invitations)
      .values({
        id: crypto.randomUUID(),
        email: email.toLowerCase().trim(),
        organizationId,
        role: role as "member" | "admin",
        inviterId: session.user.id,
        status: "pending",
        expiresAt,
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[Team invite]", err);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
