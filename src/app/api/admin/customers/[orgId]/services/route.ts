/**
 * Admin API: CRUD for firm services
 * GET    /api/admin/customers/[orgId]/services
 * POST   /api/admin/customers/[orgId]/services  — create service
 * PATCH  /api/admin/customers/[orgId]/services  — update service
 * DELETE /api/admin/customers/[orgId]/services?id=...  — delete service
 */

import { NextRequest } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { firmServices } from "@/lib/db/schema";
import { resolveAdminFirm } from "../utils";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const rows = await db
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
    .where(eq(firmServices.firmId, firm!.id))
    .orderBy(asc(firmServices.displayOrder), asc(firmServices.createdAt));

  return Response.json({
    services: rows,
    total: rows.length,
    hiddenCount: rows.filter((r) => r.isHidden).length,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const body = await req.json();
  const { name, description } = body;
  if (!name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const id = `svc_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const now = new Date();

  const [service] = await db.insert(firmServices).values({
    id,
    firmId: firm!.id,
    organizationId: orgId,
    name: name.trim(),
    description: description?.trim() ?? null,
    sourceUrl: null,
    sourcePageTitle: "Added by admin",
    subServices: [],
    isHidden: false,
    displayOrder: 9999,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return Response.json({ service }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const body = await req.json();
  const { id, description, isHidden, displayOrder } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const [svc] = await db.select({ id: firmServices.id }).from(firmServices)
    .where(and(eq(firmServices.id, id), eq(firmServices.firmId, firm!.id)))
    .limit(1);
  if (!svc) return Response.json({ error: "Service not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof description === "string") updates.description = description;
  if (typeof isHidden === "boolean") updates.isHidden = isHidden;
  if (typeof displayOrder === "number") updates.displayOrder = displayOrder;

  await db.update(firmServices).set(updates).where(eq(firmServices.id, id));
  return Response.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const [svc] = await db.select({ id: firmServices.id, sourceUrl: firmServices.sourceUrl })
    .from(firmServices)
    .where(and(eq(firmServices.id, id), eq(firmServices.firmId, firm!.id)))
    .limit(1);
  if (!svc) return Response.json({ error: "Service not found" }, { status: 404 });

  await db.delete(firmServices).where(eq(firmServices.id, id));
  return Response.json({ success: true });
}
