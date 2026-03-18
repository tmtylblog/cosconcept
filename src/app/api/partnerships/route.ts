/**
 * Partnership API — CRUD + Lifecycle
 *
 * GET  /api/partnerships — List partnerships for user's firm
 * POST /api/partnerships — Request a new partnership
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { partnerships, partnershipEvents, serviceFirms, members } from "@/lib/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import type { RequestPartnershipInput } from "@/types/partnerships";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET — List partnerships for the current user's firm.
 * Query params: ?status=accepted&type=trusted_partner&firmId=xxx
 * If firmId is omitted, auto-resolves from session.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let firmId = url.searchParams.get("firmId");
  const status = url.searchParams.get("status");

  // Auto-resolve firmId from session if not provided
  if (!firmId) {
    const [membership] = await db
      .select({ orgId: members.organizationId })
      .from(members)
      .where(eq(members.userId, session.user.id))
      .limit(1);
    if (membership) {
      const firm = await db.query.serviceFirms.findFirst({
        where: eq(serviceFirms.organizationId, membership.orgId),
        columns: { id: true },
      });
      firmId = firm?.id ?? null;
    }
    if (!firmId) {
      return NextResponse.json({ error: "No firm found for user" }, { status: 404 });
    }
  }

  // Verify firm exists
  const firm = await db.query.serviceFirms.findFirst({
    where: eq(serviceFirms.id, firmId),
    columns: { organizationId: true },
  });

  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }

  // Build query — partnerships where firm is either side
  const allPartnerships = await db
    .select()
    .from(partnerships)
    .where(
      and(
        or(
          eq(partnerships.firmAId, firmId),
          eq(partnerships.firmBId, firmId)
        ),
        status ? eq(partnerships.status, status as "suggested" | "requested" | "accepted" | "declined" | "inactive") : undefined
      )
    )
    .orderBy(desc(partnerships.updatedAt));

  // Enrich with partner firm details
  const enriched = await Promise.all(
    allPartnerships.map(async (p) => {
      const partnerFirmId = p.firmAId === firmId ? p.firmBId : p.firmAId;
      const partnerFirm = await db.query.serviceFirms.findFirst({
        where: eq(serviceFirms.id, partnerFirmId),
        columns: { id: true, name: true, website: true, description: true },
      });

      return {
        ...p,
        partnerFirm: partnerFirm ?? { id: partnerFirmId, name: "Unknown" },
        isInitiator: p.firmAId === firmId,
      };
    })
  );

  return NextResponse.json({ partnerships: enriched, firmId });
}

/**
 * POST — Request a new partnership.
 * Body: { firmId, targetFirmId, type?, message? }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as RequestPartnershipInput & { firmId: string };
  const { firmId, targetFirmId, type = "trusted_partner", message } = body;

  if (!firmId || !targetFirmId) {
    return NextResponse.json(
      { error: "firmId and targetFirmId are required" },
      { status: 400 }
    );
  }

  if (firmId === targetFirmId) {
    return NextResponse.json(
      { error: "Cannot partner with yourself" },
      { status: 400 }
    );
  }

  // Check for existing partnership between these firms
  const existing = await db.query.partnerships.findFirst({
    where: and(
      or(
        and(eq(partnerships.firmAId, firmId), eq(partnerships.firmBId, targetFirmId)),
        and(eq(partnerships.firmAId, targetFirmId), eq(partnerships.firmBId, firmId))
      ),
      or(
        eq(partnerships.status, "requested"),
        eq(partnerships.status, "accepted"),
        eq(partnerships.status, "suggested")
      )
    ),
  });

  if (existing) {
    return NextResponse.json(
      { error: "Partnership already exists", partnership: existing },
      { status: 409 }
    );
  }

  // Create the partnership
  const partnershipId = generateId("ptn");
  const eventId = generateId("pev");

  await db.insert(partnerships).values({
    id: partnershipId,
    firmAId: firmId,
    firmBId: targetFirmId,
    status: "requested",
    type: type as "trusted_partner" | "collective" | "vendor_network",
    initiatedBy: session.user.id,
    notes: message ?? null,
  });

  // Log the event
  await db.insert(partnershipEvents).values({
    id: eventId,
    partnershipId,
    eventType: "requested",
    actorId: session.user.id,
    metadata: message ? { message } : null,
  });

  return NextResponse.json(
    { partnership: { id: partnershipId, status: "requested", type } },
    { status: 201 }
  );
}
