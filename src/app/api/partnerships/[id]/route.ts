/**
 * Partnership Detail API
 *
 * GET    /api/partnerships/[id] — Get partnership details with events
 * PATCH  /api/partnerships/[id] — Accept/decline/update partnership
 * DELETE /api/partnerships/[id] — Deactivate partnership
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { partnerships, partnershipEvents, serviceFirms } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { RespondPartnershipInput } from "@/types/partnerships";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET — Partnership details with event history.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const partnership = await db.query.partnerships.findFirst({
    where: eq(partnerships.id, id),
  });

  if (!partnership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get event history
  const events = await db
    .select()
    .from(partnershipEvents)
    .where(eq(partnershipEvents.partnershipId, id))
    .orderBy(desc(partnershipEvents.createdAt));

  // Get both firm details
  const [firmA, firmB] = await Promise.all([
    db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.id, partnership.firmAId),
      columns: { id: true, name: true, website: true, description: true },
    }),
    db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.id, partnership.firmBId),
      columns: { id: true, name: true, website: true, description: true },
    }),
  ]);

  return NextResponse.json({
    partnership: {
      ...partnership,
      firmA,
      firmB,
      events,
    },
  });
}

/**
 * PATCH — Accept, decline, or update a partnership.
 * Body: { action: "accept"|"decline", message? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json()) as RespondPartnershipInput;
  const { action, message } = body;

  if (!action || !["accept", "decline"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'accept' or 'decline'" },
      { status: 400 }
    );
  }

  const partnership = await db.query.partnerships.findFirst({
    where: eq(partnerships.id, id),
  });

  if (!partnership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (partnership.status !== "requested" && partnership.status !== "suggested") {
    return NextResponse.json(
      { error: `Cannot ${action} a partnership with status '${partnership.status}'` },
      { status: 400 }
    );
  }

  const now = new Date();

  if (action === "accept") {
    await db
      .update(partnerships)
      .set({
        status: "accepted",
        acceptedAt: now,
        updatedAt: now,
      })
      .where(eq(partnerships.id, id));

    await db.insert(partnershipEvents).values({
      id: generateId("pev"),
      partnershipId: id,
      eventType: "accepted",
      actorId: session.user.id,
      metadata: message ? { message } : null,
    });
  } else {
    await db
      .update(partnerships)
      .set({
        status: "declined",
        declinedAt: now,
        updatedAt: now,
      })
      .where(eq(partnerships.id, id));

    await db.insert(partnershipEvents).values({
      id: generateId("pev"),
      partnershipId: id,
      eventType: "declined",
      actorId: session.user.id,
      metadata: message ? { message } : null,
    });
  }

  return NextResponse.json({
    partnership: { id, status: action === "accept" ? "accepted" : "declined" },
  });
}

/**
 * DELETE — Deactivate a partnership (soft delete).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const partnership = await db.query.partnerships.findFirst({
    where: eq(partnerships.id, id),
  });

  if (!partnership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(partnerships)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(partnerships.id, id));

  await db.insert(partnershipEvents).values({
    id: generateId("pev"),
    partnershipId: id,
    eventType: "deactivated",
    actorId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
