/**
 * POST /api/experts/create
 *
 * Creates a new expert profile for the caller's organization.
 * Checks plan limits (free = 5 experts max, pro = unlimited).
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  serviceFirms,
  members,
  subscriptions,
} from "@/lib/db/schema";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { firstName, lastName, email, title, linkedinUrl, organizationId } = body;

  if (!firstName && !lastName) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  if (!organizationId) {
    return Response.json({ error: "Organization ID is required" }, { status: 400 });
  }

  // Verify caller is a member of this org
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, organizationId))
    .limit(1);

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find firm for this org
  const [firm] = await db
    .select({ id: serviceFirms.id })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, organizationId))
    .limit(1);

  if (!firm) {
    return Response.json({ error: "No firm found for this organization" }, { status: 404 });
  }

  // Check plan limit
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  const plan = (sub?.plan ?? "free") as PlanId;
  const limit = PLAN_LIMITS[plan]?.expertRosterLimit ?? 5;

  if (limit !== -1) {
    // Count existing experts
    const existingResult = await db
      .select({ id: expertProfiles.id })
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id));

    if (existingResult.length >= limit) {
      return Response.json(
        { error: "Expert limit reached. Upgrade to Pro for unlimited experts.", upgrade: true },
        { status: 403 }
      );
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const id = `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  await db.insert(expertProfiles).values({
    id,
    firmId: firm.id,
    firstName: firstName || null,
    lastName: lastName || null,
    fullName: fullName || null,
    email: email || null,
    title: title || null,
    linkedinUrl: linkedinUrl || null,
    division: "expert",
  });

  return Response.json({ id, fullName });
}
