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
import { conversations, messages as messagesTable, serviceFirms, partnerPreferences, members } from "@/lib/db/schema";
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

    const { messages, organizationId: clientOrgId, websiteContext, conversationId: clientConvId } =
      (await req.json()) as {
        messages: UIMessage[];
        organizationId?: string;
        websiteContext?: string;
        conversationId?: string;
      };

    // ─── Server-side org resolution fallback ────────────────
    // If the client didn't send organizationId (e.g., activeOrg not yet
    // resolved after hard refresh), look it up from the user's membership.
    let organizationId = clientOrgId;
    if (!organizationId && userId) {
      try {
        const [membership] = await db
          .select({ orgId: members.organizationId })
          .from(members)
          .where(eq(members.userId, userId))
          .limit(1);
        if (membership) {
          organizationId = membership.orgId;
          console.log(`[Ossy] Resolved org from membership: ${organizationId}`);
        }
      } catch {
        // Non-critical
      }
    }

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

    // Tools are available for any authenticated user with a firm — not gated behind onboarding
    const hasToolAccess = !!firmId;

    // ─── Check for existing partner preferences (from guest migration or previous onboarding) ───
    // This prevents re-onboarding users who completed preferences as a guest and then signed up.
    let collectedPreferences: Record<string, string | string[]> | undefined;
    let hasPartnerPrefs = false;
    if (firmId) {
      try {
        const [prefRow] = await db
          .select({
            preferredFirmTypes: partnerPreferences.preferredFirmTypes,
            preferredSizeBands: partnerPreferences.preferredSizeBands,
            preferredIndustries: partnerPreferences.preferredIndustries,
            preferredMarkets: partnerPreferences.preferredMarkets,
            rawOnboardingData: partnerPreferences.rawOnboardingData,
          })
          .from(partnerPreferences)
          .where(eq(partnerPreferences.firmId, firmId))
          .limit(1);

        if (prefRow) {
          const prefs: Record<string, string | string[]> = {};
          // Dedicated columns → preference field names
          if (prefRow.preferredFirmTypes?.length) prefs.preferredPartnerTypes = prefRow.preferredFirmTypes;
          if (prefRow.preferredSizeBands?.length) prefs.preferredPartnerSize = prefRow.preferredSizeBands;
          if (prefRow.preferredIndustries?.length) prefs.requiredPartnerIndustries = prefRow.preferredIndustries;
          if (prefRow.preferredMarkets?.length) prefs.preferredPartnerLocations = prefRow.preferredMarkets;
          // Raw onboarding data (JSONB) → individual fields
          const raw = prefRow.rawOnboardingData as Record<string, string | string[]> | null;
          if (raw) {
            for (const key of ["desiredPartnerServices", "idealPartnerClientSize", "idealProjectSize", "typicalHourlyRates", "partnershipRole"]) {
              if (raw[key] != null) {
                const v = raw[key];
                if (Array.isArray(v) ? v.length > 0 : v !== "") {
                  prefs[key] = v;
                }
              }
            }
          }
          if (Object.keys(prefs).length > 0) {
            collectedPreferences = prefs;
            hasPartnerPrefs = true;
            console.log(`[Ossy] Found ${Object.keys(prefs).length} existing partner preferences for ${firmId}`);
          }
        }
      } catch (err) {
        console.warn("[Ossy] Failed to load partner preferences:", err);
      }
    }

    // Onboarding is "complete" only when ALL 9 partner preferences are stored
    const allPrefsCount = collectedPreferences ? Object.keys(collectedPreferences).length : 0;
    const allPrefsComplete = allPrefsCount >= 9;
    const hasCompletedOnboarding = allPrefsComplete;

    const systemPrompt = getOssyPrompt({
      userName: userName ?? undefined,
      // Always onboarding until all 9 prefs are confirmed — regardless of message count
      isOnboarding: !allPrefsComplete,
      hasCompletedOnboarding,
      hasToolAccess,
      websiteContext: websiteContext ?? undefined,
      memoryContext: memoryBlock,
      collectedPreferences,
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
