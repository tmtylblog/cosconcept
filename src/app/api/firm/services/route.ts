/**
 * GET   /api/firm/services?organizationId=...  — List firm's services
 * PATCH /api/firm/services                      — Update a service (description, isHidden, displayOrder)
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmServices, serviceFirms, members } from "@/lib/db/schema";
import { randomBytes } from "crypto";

// ─── Seed from enrichment data (silent, first-load only) ─
async function seedServicesIfEmpty(firmId: string, organizationId: string) {
  const [firmRow] = await db
    .select({ enrichmentData: serviceFirms.enrichmentData, website: serviceFirms.website })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  const extracted = (firmRow?.enrichmentData as Record<string, unknown> | null)?.extracted as Record<string, unknown> | null;
  const discoveredServices = (extracted?.services as string[] | undefined) ?? [];
  if (discoveredServices.length === 0) return;

  const now = new Date();
  await db.insert(firmServices).values(
    discoveredServices.map((name, i) => ({
      id: `svc_${Date.now().toString(36)}_${i.toString(36)}_${randomBytes(3).toString("hex")}`,
      firmId,
      organizationId,
      name: name.trim(),
      description: null,
      sourceUrl: firmRow?.website ?? null,
      sourcePageTitle: "Auto-discovered from website",
      subServices: [] as string[],
      isHidden: false,
      displayOrder: i,
      createdAt: now,
      updatedAt: now,
    }))
  ).onConflictDoNothing();
}

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────

async function resolveFirm(userId: string, organizationId: string) {
  const [firm] = await db
    .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, organizationId))
    .limit(1);

  if (!firm) return null;

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!membership) return null;
  return firm;
}

// ─── GET: List services ──────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return Response.json({ error: "organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  const includeHidden = req.nextUrl.searchParams.get("includeHidden") === "true";

  const conditions = [eq(firmServices.firmId, firm.id)];
  if (!includeHidden) {
    conditions.push(eq(firmServices.isHidden, false));
  }

  let rows = await db
    .select({
      id: firmServices.id,
      name: firmServices.name,
      description: firmServices.description,
      sourceUrl: firmServices.sourceUrl,
      sourcePageTitle: firmServices.sourcePageTitle,
      subServices: firmServices.subServices,
      isHidden: firmServices.isHidden,
      displayOrder: firmServices.displayOrder,
      createdAt: firmServices.createdAt,
    })
    .from(firmServices)
    .where(and(...conditions))
    .orderBy(asc(firmServices.displayOrder), asc(firmServices.createdAt));

  // If empty, try seeding from enrichment data then re-fetch
  if (rows.length === 0) {
    await seedServicesIfEmpty(firm.id, organizationId);
    rows = await db
      .select({
        id: firmServices.id,
        name: firmServices.name,
        description: firmServices.description,
        sourceUrl: firmServices.sourceUrl,
        sourcePageTitle: firmServices.sourcePageTitle,
        subServices: firmServices.subServices,
        isHidden: firmServices.isHidden,
        displayOrder: firmServices.displayOrder,
        createdAt: firmServices.createdAt,
      })
      .from(firmServices)
      .where(and(...conditions))
      .orderBy(asc(firmServices.displayOrder), asc(firmServices.createdAt));
  }

  // Count hidden separately
  const hiddenRows = includeHidden
    ? rows.filter((r) => r.isHidden)
    : await db
        .select({ id: firmServices.id })
        .from(firmServices)
        .where(
          and(
            eq(firmServices.firmId, firm.id),
            eq(firmServices.isHidden, true)
          )
        );

  return Response.json({
    services: rows,
    total: rows.length,
    hiddenCount: hiddenRows.length,
  });
}

// ─── POST: Manually create a service ─────────────────────

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { organizationId, name, description } = body;

  if (!organizationId || !name?.trim()) {
    return Response.json({ error: "organizationId and name are required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  const id = `svc_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const now = new Date();

  const [service] = await db.insert(firmServices).values({
    id,
    firmId: firm.id,
    organizationId,
    name: name.trim(),
    description: description?.trim() ?? null,
    sourceUrl: null,
    sourcePageTitle: null,
    subServices: [],
    isHidden: false,
    displayOrder: 9999,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return Response.json({ service });
}

// ─── DELETE: Remove a manually-added service ─────────────

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  const id = req.nextUrl.searchParams.get("id");

  if (!id || !organizationId) {
    return Response.json({ error: "id and organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // Only allow deleting manually-added services (sourceUrl is null)
  const [svc] = await db
    .select({ id: firmServices.id, sourceUrl: firmServices.sourceUrl })
    .from(firmServices)
    .where(and(eq(firmServices.id, id), eq(firmServices.firmId, firm.id)))
    .limit(1);

  if (!svc) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  if (svc.sourceUrl !== null) {
    return Response.json({ error: "Auto-discovered services cannot be deleted — use hide instead" }, { status: 400 });
  }

  await db.delete(firmServices).where(eq(firmServices.id, id));
  return Response.json({ success: true });
}

// ─── PATCH: Update a service ─────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, organizationId, description, isHidden, displayOrder } = body;

  if (!id || !organizationId) {
    return Response.json({ error: "id and organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // Verify service belongs to this firm
  const [svc] = await db
    .select({ id: firmServices.id })
    .from(firmServices)
    .where(
      and(
        eq(firmServices.id, id),
        eq(firmServices.firmId, firm.id)
      )
    )
    .limit(1);

  if (!svc) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof description === "string") updates.description = description;
  if (typeof isHidden === "boolean") updates.isHidden = isHidden;
  if (typeof displayOrder === "number") updates.displayOrder = displayOrder;

  await db.update(firmServices).set(updates).where(eq(firmServices.id, id));

  return Response.json({ success: true });
}
