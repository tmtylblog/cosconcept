import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "list";
  const conversationId = url.searchParams.get("conversationId");
  const search = url.searchParams.get("search")?.trim();

  try {
    if (mode === "thread" && conversationId) {
      // Verify this conversation belongs to this user
      const convResult = await db.execute(sql`
        SELECT id, title, mode, created_at AS "createdAt"
        FROM conversations
        WHERE id = ${conversationId} AND user_id = ${userId}
        LIMIT 1
      `);
      if (convResult.rows.length === 0) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const messagesResult = await db.execute(sql`
        SELECT id, role, content, created_at AS "createdAt"
        FROM messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
      `);
      return NextResponse.json({ conversation: convResult.rows[0], messages: messagesResult.rows });
    }

    // List mode
    if (search && search.length >= 2) {
      const result = await db.execute(sql`
        SELECT
          c.id, c.title, c.mode,
          COUNT(m.id)::int AS "messageCount",
          MAX(m.created_at) AS "lastMessageAt",
          c.created_at AS "createdAt"
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.user_id = ${userId}
          AND EXISTS (
            SELECT 1 FROM messages ms
            WHERE ms.conversation_id = c.id
              AND LOWER(ms.content) LIKE LOWER(${"%" + search + "%"})
          )
        GROUP BY c.id, c.title, c.mode, c.created_at
        ORDER BY MAX(m.created_at) DESC NULLS LAST
        LIMIT 100
      `);
      return NextResponse.json({ conversations: result.rows });
    }

    const result = await db.execute(sql`
      SELECT
        c.id, c.title, c.mode,
        COUNT(m.id)::int AS "messageCount",
        MAX(m.created_at) AS "lastMessageAt",
        c.created_at AS "createdAt"
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ${userId}
      GROUP BY c.id, c.title, c.mode, c.created_at
      ORDER BY MAX(m.created_at) DESC NULLS LAST
      LIMIT 100
    `);
    return NextResponse.json({ conversations: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to fetch conversations", detail: message }, { status: 500 });
  }
}
