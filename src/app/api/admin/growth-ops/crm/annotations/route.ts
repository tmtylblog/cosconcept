/**
 * /api/admin/growth-ops/crm/annotations
 *
 * GET  — fetch annotation for an entity
 * POST — create or update annotation (upsert by entityType + entityId)
 *
 * Auth: superadmin or growth_ops role.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { crmAnnotations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

async function checkAuth() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
    return null;
  }
  return session;
}

export async function GET(req: NextRequest) {
  if (!await checkAuth()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select()
      .from(crmAnnotations)
      .where(
        and(
          eq(crmAnnotations.entityType, entityType),
          eq(crmAnnotations.entityId, entityId)
        )
      )
      .limit(1);

    return NextResponse.json({ annotation: row || null });
  } catch (error) {
    console.error("[CRM] Annotations GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await checkAuth()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { entityType, entityId, tags, notes, assignedTo, lastContactedAt, nextFollowUpAt } = body;

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
    }

    // Upsert
    const [existing] = await db
      .select({ id: crmAnnotations.id })
      .from(crmAnnotations)
      .where(
        and(
          eq(crmAnnotations.entityType, entityType),
          eq(crmAnnotations.entityId, entityId)
        )
      )
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(crmAnnotations)
        .set({
          ...(tags !== undefined ? { tags } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(assignedTo !== undefined ? { assignedTo } : {}),
          ...(lastContactedAt !== undefined ? { lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null } : {}),
          ...(nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null } : {}),
          updatedAt: now,
        })
        .where(eq(crmAnnotations.id, existing.id));

      return NextResponse.json({ success: true, id: existing.id, updated: true });
    } else {
      const id = crypto.randomUUID();
      await db.insert(crmAnnotations).values({
        id,
        entityType,
        entityId,
        tags: tags || [],
        notes: notes || null,
        assignedTo: assignedTo || null,
        lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
        createdAt: now,
        updatedAt: now,
      });

      return NextResponse.json({ success: true, id, created: true });
    }
  } catch (error) {
    console.error("[CRM] Annotations POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
