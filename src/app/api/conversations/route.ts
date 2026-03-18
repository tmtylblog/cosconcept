import { headers } from "next/headers";
import { eq, and, desc, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, conversationThreads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations
 * Returns the user's most recent conversation with messages + thread info.
 * Only returns conversations updated within the last 24 hours (stale ones start fresh).
 * Query params:
 *   - organizationId: filter by org
 *   - conversationId: load a specific conversation
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");
  const specificConvId = url.searchParams.get("conversationId");

  // Find conversation
  const conditions = [eq(conversations.userId, session.user.id)];
  if (organizationId) {
    conditions.push(eq(conversations.organizationId, organizationId));
  }

  let conv;
  if (specificConvId) {
    // Load a specific conversation
    conditions.push(eq(conversations.id, specificConvId));
    const rows = await db.select().from(conversations).where(and(...conditions)).limit(1);
    conv = rows[0] ?? null;
  } else {
    // Find most recent conversation updated within last 24 hours
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    conditions.push(gt(conversations.updatedAt, staleThreshold));
    const rows = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    conv = rows[0] ?? null;
  }

  if (!conv) {
    return Response.json({ conversation: null, messages: [], threads: [] });
  }

  // Fetch messages + threads in parallel
  const [msgRows, threadRows] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt),
    db
      .select()
      .from(conversationThreads)
      .where(eq(conversationThreads.conversationId, conv.id))
      .orderBy(desc(conversationThreads.lastMessageAt)),
  ]);

  return Response.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      mode: conv.mode,
      activeThreadId: conv.activeThreadId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    },
    messages: msgRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      threadId: m.threadId,
      isPivot: m.isPivot,
      createdAt: m.createdAt,
    })),
    threads: threadRows.map((t) => ({
      id: t.id,
      title: t.title,
      topic: t.topic,
      status: t.status,
      messageCount: t.messageCount,
      lastMessageAt: t.lastMessageAt,
    })),
  });
}
