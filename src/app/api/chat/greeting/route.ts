import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { retrieveMemoryContext } from "@/lib/ai/memory-retriever";
import { logUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * GET /api/chat/greeting
 *
 * Generates a personalized returning-user greeting for Ossy.
 * Uses memory context + last conversation snippet to produce a warm,
 * contextual greeting that makes the user feel remembered.
 *
 * Returns:
 *   { isReturning: true, greeting: "Hey Freddie! Last time..." }
 *   { isReturning: false, greeting: null }
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ isReturning: false, greeting: null });
  }

  const userId = session.user.id;
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    // 1. Load memory context
    const memoryContext = await retrieveMemoryContext(userId, 15);

    // 2. Load last conversation's last 3 messages
    const conditions = [eq(conversations.userId, userId)];
    if (organizationId) {
      conditions.push(eq(conversations.organizationId, organizationId));
    }

    const convRows = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);

    let lastSnippet = "";
    if (convRows.length > 0) {
      const lastMsgs = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, convRows[0].id))
        .orderBy(desc(messages.createdAt))
        .limit(3);

      if (lastMsgs.length > 0) {
        lastSnippet = lastMsgs
          .reverse()
          .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
          .join("\n");
      }
    }

    // 3. If no memories AND no conversations → not a returning user
    if (!memoryContext && !lastSnippet) {
      return Response.json({ isReturning: false, greeting: null });
    }

    // 4. Generate personalized greeting
    const userName = session.user.name?.split(" ")[0] || "there";
    const prompt = `You are Ossy, an AI growth consultant for professional services firms on the Collective OS platform. Generate a warm, personal 2-3 sentence greeting for a returning user named ${userName}.

Rules:
- Be warm and friendly, like greeting a colleague you know well
- Reference something specific from what you know about them (their firm, preferences, or what you last discussed)
- End by suggesting ONE specific thing you can help with today — like searching for partners in a specific area, exploring case studies, or finding experts. Base the suggestion on their profile and past conversations.
- Keep it concise — no more than 3 sentences
- Don't mention "memory" or "I remember" — just demonstrate awareness naturally
- Don't use emojis

${memoryContext ? `What you know about this user:\n${memoryContext.contextBlock}` : ""}

${lastSnippet ? `Last conversation snippet:\n${lastSnippet}` : ""}`;

    const greetingStart = Date.now();
    const result = await generateText({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt,
    });

    logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "chat",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - greetingStart,
    }).catch(() => {});

    const greeting = result.text?.trim();

    if (!greeting) {
      return Response.json({ isReturning: false, greeting: null });
    }

    return Response.json({ isReturning: true, greeting });
  } catch (error) {
    console.error("[Greeting] Failed to generate greeting:", error);
    // Fall back gracefully — just use default welcome
    return Response.json({ isReturning: false, greeting: null });
  }
}
