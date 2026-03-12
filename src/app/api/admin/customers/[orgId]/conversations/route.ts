import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/customers/[orgId]/conversations
 *
 * Two modes:
 *   ?mode=list  (default) — all conversations for this org
 *   ?mode=thread&conversationId=xxx — full message thread
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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

  const { orgId } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "list";
  const conversationId = url.searchParams.get("conversationId");
  const search = url.searchParams.get("search")?.trim();

  try {
    if (mode === "thread" && conversationId) {
      // Full message thread for a specific conversation
      const convResult = await db.execute(sql`
        SELECT
          c.id, c.title, c.mode,
          u.name AS "userName", u.email AS "userEmail",
          c.created_at AS "createdAt"
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = ${conversationId}
          AND c.organization_id = ${orgId}
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

      return NextResponse.json({
        conversation: convResult.rows[0],
        messages: messagesResult.rows,
      });
    }

    // List mode — all conversations for this org
    let conversationsResult;

    if (search && search.length >= 2) {
      // Search within conversation content
      conversationsResult = await db.execute(sql`
        SELECT
          c.id, c.title, c.mode,
          u.name AS "userName", u.email AS "userEmail",
          COUNT(m.id)::int AS "messageCount",
          MAX(m.created_at) AS "lastMessageAt",
          c.created_at AS "createdAt"
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.organization_id = ${orgId}
          AND EXISTS (
            SELECT 1 FROM messages ms
            WHERE ms.conversation_id = c.id
              AND LOWER(ms.content) LIKE LOWER(${"%" + search + "%"})
          )
        GROUP BY c.id, c.title, c.mode, u.name, u.email, c.created_at
        ORDER BY MAX(m.created_at) DESC NULLS LAST
        LIMIT 100
      `);
    } else {
      conversationsResult = await db.execute(sql`
        SELECT
          c.id, c.title, c.mode,
          u.name AS "userName", u.email AS "userEmail",
          COUNT(m.id)::int AS "messageCount",
          MAX(m.created_at) AS "lastMessageAt",
          c.created_at AS "createdAt"
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.organization_id = ${orgId}
        GROUP BY c.id, c.title, c.mode, u.name, u.email, c.created_at
        ORDER BY MAX(m.created_at) DESC NULLS LAST
        LIMIT 100
      `);
    }

    return NextResponse.json({
      conversations: conversationsResult.rows,
    });
  } catch (error) {
    console.error("[Admin] Customer conversations error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch conversations", detail: message },
      { status: 500 }
    );
  }
}
