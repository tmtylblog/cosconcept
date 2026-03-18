import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acqPipelineStages,
  acqDealSources,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const role = (session.user as Record<string, unknown>).role as string;
  if (!session?.user || !["superadmin", "admin", "growth_ops"].includes(role)) return null;
  return session;
}

function randomId() {
  return crypto.randomUUID();
}

// GET — all settings data (stages + sources)
export async function GET() {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const stages = await db
      .select()
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(asc(acqPipelineStages.displayOrder));

    const sources = await db
      .select()
      .from(acqDealSources)
      .orderBy(asc(acqDealSources.displayOrder));

    return NextResponse.json({ stages, sources });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — mutations
export async function POST(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const now = new Date();

  try {
    // ── Stage CRUD ──────────────────────────────────────────────
    if (body.action === "createStage") {
      const { label, displayOrder, color, isClosedWon, isClosedLost, parentStageId } = body;
      const id = randomId();
      await db.insert(acqPipelineStages).values({
        id,
        pipelineId: "default",
        label: label || "New Stage",
        displayOrder: displayOrder ?? 0,
        color: color || "#6366f1",
        isClosedWon: isClosedWon ?? false,
        isClosedLost: isClosedLost ?? false,
        parentStageId: parentStageId || null,
      });
      return NextResponse.json({ id });
    }

    if (body.action === "updateStage") {
      const { stageId, label, displayOrder, color, isClosedWon, isClosedLost } = body;
      const updateData: Record<string, unknown> = { updatedAt: now };
      if (label !== undefined) updateData.label = label;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (color !== undefined) updateData.color = color;
      if (isClosedWon !== undefined) updateData.isClosedWon = isClosedWon;
      if (isClosedLost !== undefined) updateData.isClosedLost = isClosedLost;
      if (body.parentStageId !== undefined) updateData.parentStageId = body.parentStageId || null;
      await db.update(acqPipelineStages).set(updateData).where(eq(acqPipelineStages.id, stageId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteStage") {
      const { stageId } = body;
      // Deals in this stage get stageId set to null (FK onDelete: set null)
      await db.delete(acqPipelineStages).where(eq(acqPipelineStages.id, stageId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reorderStages") {
      const { order } = body as { order: { id: string; displayOrder: number }[] };
      for (const item of order) {
        await db
          .update(acqPipelineStages)
          .set({ displayOrder: item.displayOrder, updatedAt: now })
          .where(eq(acqPipelineStages.id, item.id));
      }
      return NextResponse.json({ ok: true });
    }

    // ── Deal Source CRUD ────────────────────────────────────────
    if (body.action === "createSource") {
      const { key, label, color, icon, displayOrder } = body;
      if (!key || !label) return NextResponse.json({ error: "key and label required" }, { status: 400 });
      const id = randomId();
      await db.insert(acqDealSources).values({
        id,
        key: key.toLowerCase().replace(/\s+/g, "_"),
        label,
        color: color || "#6366f1",
        icon: icon || "globe",
        isSystem: false,
        displayOrder: displayOrder ?? 99,
      });
      return NextResponse.json({ id });
    }

    if (body.action === "updateSource") {
      const { sourceId, label, color, icon, displayOrder } = body;
      const updateData: Record<string, unknown> = { updatedAt: now };
      if (label !== undefined) updateData.label = label;
      if (color !== undefined) updateData.color = color;
      if (icon !== undefined) updateData.icon = icon;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      await db.update(acqDealSources).set(updateData).where(eq(acqDealSources.id, sourceId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteSource") {
      const { sourceId } = body;
      // Only allow deleting non-system sources
      const [source] = await db.select().from(acqDealSources).where(eq(acqDealSources.id, sourceId)).limit(1);
      if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
      if (source.isSystem) return NextResponse.json({ error: "Cannot delete system source" }, { status: 400 });
      await db.delete(acqDealSources).where(eq(acqDealSources.id, sourceId));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
