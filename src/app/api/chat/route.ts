import { headers } from "next/headers";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { eq, and, desc } from "drizzle-orm";
import { getOssyPrompt } from "@/lib/ai/ossy-prompt";
import { createOssyTools } from "@/lib/ai/ossy-tools";
import { FeatureGateError } from "@/lib/billing/gate";
import { getOrgPlan } from "@/lib/billing/usage-checker";
import { PLAN_LIMITS } from "@/lib/billing/plan-limits";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages as messagesTable, serviceFirms } from "@/lib/db/schema";
import { logUsage } from "@/lib/ai/gateway";
import { retrieveMemoryContext } from "@/lib/ai/memory-retriever";
import { extractMemoriesFromConversation } from "@/lib/ai/memory-extractor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/** Extract plain text from a UIMessage's parts array */
function getMessageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Generate a short unique ID */
function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    // Get auth session
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    const userName = session?.user?.name;

    const { messages, organizationId, websiteContext, conversationId: clientConvId } =
      (await req.json()) as {
        messages: UIMessage[];
        organizationId?: string;
        websiteContext?: string;
        conversationId?: string;
      };

    // Feature gate: check messaging limits
    if (organizationId) {
      const plan = await getOrgPlan(organizationId);
      const limits = PLAN_LIMITS[plan];

      if (!limits.unlimitedMessaging) {
        // Free plan: limited messaging — enforce a per-day soft cap
        // (Full implementation will use aiUsageLog counts)
      }
    }

    // ─── Resolve firm ID for tool context ──────────────────
    let firmId: string | undefined;
    if (organizationId) {
      try {
        const firmRow = await db
          .select({ id: serviceFirms.id })
          .from(serviceFirms)
          .where(eq(serviceFirms.organizationId, organizationId))
          .limit(1);
        firmId = firmRow[0]?.id;
      } catch {
        // Non-critical — tools will work without firmId
      }
    }

    // ─── Memory retrieval (authenticated users only) ────────
    let memoryBlock: string | undefined;
    if (userId) {
      try {
        const memory = await retrieveMemoryContext(userId);
        if (memory) {
          memoryBlock = memory.contextBlock;
          if (process.env.NODE_ENV === "development") {
            console.log(`[Ossy] Loaded ${memory.memoryCount} memories (${memory.themes.join(", ")})`);
          }
        }
      } catch (err) {
        console.error("[Ossy] Failed to retrieve memories:", err);
      }
    }

    const hasCompletedOnboarding = !!memoryBlock;
    // Tools are available for any authenticated user with a firm — not gated behind onboarding
    const hasToolAccess = !!firmId;

    const systemPrompt = getOssyPrompt({
      userName: userName ?? undefined,
      isOnboarding: !memoryBlock && messages.length <= 2,
      hasCompletedOnboarding,
      hasToolAccess,
      websiteContext: websiteContext ?? undefined,
      memoryContext: memoryBlock,
    });

    const modelMessages = await convertToModelMessages(messages);

    // ─── Persistence setup ─────────────────────────────────
    // Resolve or create conversation ID (only for authenticated users)
    let conversationId = clientConvId || null;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

    if (userId && lastUserMsg) {
      try {
        if (!conversationId) {
          // Find the user's most recent active conversation, or create one
          const existing = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.userId, userId),
                organizationId
                  ? eq(conversations.organizationId, organizationId)
                  : undefined
              )
            )
            .orderBy(desc(conversations.updatedAt))
            .limit(1);

          if (existing.length > 0) {
            conversationId = existing[0].id;
          } else {
            conversationId = uid("conv");
            await db.insert(conversations).values({
              id: conversationId,
              userId,
              organizationId: organizationId || null,
              title: getMessageText(lastUserMsg).slice(0, 100) || "New conversation",
              mode: !memoryBlock && messages.length <= 2 ? "onboarding" : "general",
            });
          }
        }

        // Persist the user message
        const userText = getMessageText(lastUserMsg);
        if (userText) {
          await db
            .insert(messagesTable)
            .values({
              id: uid("msg"),
              conversationId,
              role: "user",
              content: userText,
            })
            .onConflictDoNothing();
        }

        // Update conversation timestamp
        await db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      } catch (err) {
        console.error("[Ossy] Failed to persist user message:", err);
        // Don't block the chat — persistence is best-effort
      }
    }

    const startTime = Date.now();
    const capturedConvId = conversationId; // Capture for closure

    // Tools available for any authenticated user with a firm profile
    // (not gated behind onboarding — users can skip onboarding and ask directly)
    const tools = hasToolAccess && organizationId && firmId
      ? createOssyTools(organizationId, firmId)
      : undefined;

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      messages: modelMessages,
      ...(tools ? { tools, maxSteps: 5 } : {}),
      maxOutputTokens: 2048,
      onFinish: async ({ text, usage, toolCalls }) => {
        // ─── Persist assistant message ───────────────────────
        if (userId && capturedConvId && text) {
          try {
            await db.insert(messagesTable).values({
              id: uid("msg"),
              conversationId: capturedConvId,
              role: "assistant",
              content: text,
            });
          } catch (err) {
            console.error("[Ossy] Failed to persist assistant message:", err);
          }
        }

        // ─── Log AI usage ────────────────────────────────────
        if (usage) {
          const durationMs = Date.now() - startTime;
          try {
            await logUsage({
              organizationId,
              userId: userId ?? undefined,
              model: "anthropic/claude-sonnet-4",
              feature: "chat",
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              durationMs,
            });
          } catch (err) {
            console.error("[Ossy] Failed to log usage:", err);
          }
        }

        if (process.env.NODE_ENV === "development" && usage) {
          console.log(
            `[Ossy] ${usage.inputTokens}in / ${usage.outputTokens}out | conv=${capturedConvId}${toolCalls?.length ? ` | tools: ${toolCalls.map((t) => t.toolName).join(", ")}` : ""}`
          );
        }

        // ─── Log tool call usage ──────────────────────────────
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            logUsage({
              organizationId,
              userId: userId ?? undefined,
              model: `tool:${tc.toolName}`,
              feature: "chat_tool",
              inputTokens: 0,
              outputTokens: 0,
              durationMs: 0,
            }).catch(() => {});
          }
        }

        // ─── Extract memories (fire-and-forget) ─────────────
        if (userId && capturedConvId && messages.length >= 4) {
          extractMemoriesFromConversation({
            conversationId: capturedConvId,
            userId,
            organizationId: organizationId ?? undefined,
          }).catch((err) => {
            console.error("[Ossy] Memory extraction failed:", err);
          });
        }
      },
    });

    // Return stream with conversationId header
    const response = result.toUIMessageStreamResponse();
    if (capturedConvId) {
      response.headers.set("X-Conversation-Id", capturedConvId);
    }
    return response;
  } catch (error) {
    if (error instanceof FeatureGateError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
          requiredPlan: error.requiredPlan,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    console.error("[Ossy] Chat route error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
