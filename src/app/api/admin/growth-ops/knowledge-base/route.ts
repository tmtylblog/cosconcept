import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { replyKnowledgeBase } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * GET /api/admin/growth-ops/knowledge-base
 * List all knowledge base entries.
 */
export async function GET() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await db
    .select()
    .from(replyKnowledgeBase)
    .orderBy(replyKnowledgeBase.displayOrder);

  return NextResponse.json({ entries });
}

/**
 * POST /api/admin/growth-ops/knowledge-base
 * CRUD actions: create, update, delete, toggleActive
 */
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const { category, title, content } = body;
    if (!category || !title || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existing = await db.select().from(replyKnowledgeBase);
    const maxOrder = existing.reduce((m, e) => Math.max(m, e.displayOrder), -1);

    const id = `rkb_${randomUUID().slice(0, 8)}`;
    await db.insert(replyKnowledgeBase).values({
      id,
      category,
      title,
      content,
      displayOrder: maxOrder + 1,
    });

    return NextResponse.json({ id });
  }

  if (action === "update") {
    const { id, category, title, content } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (category !== undefined) updates.category = category;
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;

    await db.update(replyKnowledgeBase).set(updates).where(eq(replyKnowledgeBase.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await db.delete(replyKnowledgeBase).where(eq(replyKnowledgeBase.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "toggleActive") {
    const { id, isActive } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await db
      .update(replyKnowledgeBase)
      .set({ isActive: !!isActive, updatedAt: new Date() })
      .where(eq(replyKnowledgeBase.id, id));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
