import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations
 * Returns the user's most recent conversation with all messages.
 * Query params:
 *   - organizationId: filter by org
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");

  // Find most recent conversation
  const conditions = [eq(conversations.userId, session.user.id)];
  if (organizationId) {
    conditions.push(eq(conversations.organizationId, organizationId));
  }

  const convRows = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (convRows.length === 0) {
    return Response.json({ conversation: null, messages: [] });
  }

  const conv = convRows[0];

  // Fetch all messages for this conversation
  const msgRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);

  return Response.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      mode: conv.mode,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    },
    messages: msgRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
