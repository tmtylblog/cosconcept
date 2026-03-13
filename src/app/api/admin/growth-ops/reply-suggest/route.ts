import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { replyKnowledgeBase } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * POST /api/admin/growth-ops/reply-suggest
 *
 * Generate AI reply suggestions for a LinkedIn conversation.
 * Returns an array of short messages that mimic natural LinkedIn typing.
 */
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    participantName,
    participantHeadline,
    recentMessages, // { text: string, is_sender: boolean }[]
    accountName, // which LinkedIn account we're replying as
  } = body;

  if (!recentMessages?.length) {
    return NextResponse.json({ error: "No messages to reply to" }, { status: 400 });
  }

  // Load active knowledge base entries
  const kbEntries = await db
    .select()
    .from(replyKnowledgeBase)
    .where(eq(replyKnowledgeBase.isActive, true))
    .orderBy(replyKnowledgeBase.displayOrder);

  // Build knowledge base context
  const kbContext = kbEntries
    .map((e) => `[${e.category.toUpperCase()}] ${e.title}:\n${e.content}`)
    .join("\n\n");

  // Build conversation history (last 15 messages for context)
  const conversationHistory = recentMessages
    .slice(-15)
    .map((m: { text: string; is_sender: boolean }) =>
      `${m.is_sender ? "You" : participantName || "Them"}: ${m.text}`
    )
    .join("\n");

  // The last inbound message is what we're replying to
  const lastInbound = [...recentMessages]
    .reverse()
    .find((m: { is_sender: boolean }) => !m.is_sender);

  const prompt = `You are a LinkedIn reply assistant for ${accountName || "a growth professional"}.

## YOUR KNOWLEDGE BASE
${kbContext || "No knowledge base entries configured."}

## CONVERSATION WITH: ${participantName || "Unknown"}${participantHeadline ? ` (${participantHeadline})` : ""}

${conversationHistory}

## TASK
Generate a natural reply to ${participantName || "this person"}'s latest message${lastInbound ? `: "${lastInbound.text}"` : ""}.

## CRITICAL RULES FOR NATURAL LINKEDIN MESSAGING
1. Break your reply into MULTIPLE short messages (2-4 messages), each 1-2 sentences max
2. Each message should feel like a natural "send" — like how people actually type on LinkedIn
3. First message is often a quick acknowledgment or reaction
4. Following messages complete the thought, add detail, or ask a question
5. The last message often ends with a question or call to action
6. NEVER write a long paragraph as a single message
7. Be warm, genuine, conversational — NOT salesy or corporate
8. Match the tone and energy of the person you're replying to
9. Use their first name naturally (not in every message)
10. Keep total reply under 150 words across all messages

## EXAMPLE OF GOOD MULTI-MESSAGE STYLE
Message 1: "Hey that's awesome to hear!"
Message 2: "We've actually been working with a few firms in that exact space"
Message 3: "Would you be open to a quick 15 min call this week? I think there could be some real synergies"

## EXAMPLE OF BAD STYLE (DO NOT DO THIS)
Message 1: "Hey that's awesome to hear! We've actually been working with a few firms in that exact space and I think there could be some real synergies between what you're doing and our platform. Would you be open to a quick 15 min call this week to discuss?"`;

  const startTime = Date.now();

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt,
      schema: z.object({
        messages: z
          .array(
            z.object({
              text: z.string().describe("A single short LinkedIn message (1-2 sentences)"),
            })
          )
          .min(2)
          .max(5)
          .describe("Array of short messages to send sequentially"),
        reasoning: z
          .string()
          .optional()
          .describe("Brief internal reasoning about the reply strategy"),
      }),
      maxOutputTokens: 512,
    });

    const durationMs = Date.now() - startTime;

    // Log AI usage
    await logUsage({
      userId: session.user.id,
      model: "google/gemini-2.0-flash-001",
      feature: "classification",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs,
    }).catch(() => {});

    return NextResponse.json({
      messages: result.object.messages.map((m) => m.text),
      model: "gemini-2.0-flash",
      durationMs,
    });
  } catch (error) {
    console.error("[reply-suggest] AI generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate reply suggestion" },
      { status: 500 }
    );
  }
}
