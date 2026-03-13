import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages as messagesTable } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Generate a short unique ID */
function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Migrate guest conversation to authenticated user's account.
 * Persists guest messages into a new conversation in the database.
 */
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { messages, organizationId } = await req.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: true, migrated: 0 });
    }

    // Create a new conversation for the migrated guest messages
    const conversationId = uid("conv");
    const firstUserMsg = messages.find(
      (m: { role: string; content?: string }) => m.role === "user"
    );
    const title =
      (typeof firstUserMsg?.content === "string"
        ? firstUserMsg.content.slice(0, 100)
        : null) || "Migrated conversation";

    await db.insert(conversations).values({
      id: conversationId,
      userId,
      organizationId,
      title,
      mode: "general",
    });

    // Insert all messages in order
    const messageValues = messages
      .filter(
        (m: { role: string; content?: string }) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0
      )
      .map((m: { role: string; content: string }) => ({
        id: uid("msg"),
        conversationId,
        role: m.role,
        content: m.content,
      }));

    if (messageValues.length > 0) {
      await db.insert(messagesTable).values(messageValues);
    }

    console.log(
      `[Chat Migration] Migrated ${messageValues.length} messages to conv ${conversationId} for org ${organizationId}`
    );

    return NextResponse.json({
      success: true,
      migrated: messageValues.length,
      conversationId,
    });
  } catch (error) {
    console.error("[Chat Migration] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
