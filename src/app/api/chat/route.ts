import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getOssyPrompt } from "@/lib/ai/ossy-prompt";
import { FeatureGateError } from "@/lib/billing/gate";
import { getOrgPlan } from "@/lib/billing/usage-checker";
import { PLAN_LIMITS } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, organizationId, websiteContext } = (await req.json()) as {
      messages: UIMessage[];
      organizationId?: string;
      websiteContext?: string;
    };

    // Feature gate: check messaging limits
    if (organizationId) {
      const plan = await getOrgPlan(organizationId);
      const limits = PLAN_LIMITS[plan];

      if (!limits.unlimitedMessaging) {
        // Free plan: limited messaging — enforce a per-day soft cap
        // (Full implementation will use aiUsageLog counts)
        // For now, allow but flag for future enforcement
        // [ANALYTICS] trackEvent("chat_message_sent", { organizationId, plan })
      }
    }

    const systemPrompt = getOssyPrompt({
      isOnboarding: messages.length <= 2,
      websiteContext: websiteContext ?? undefined,
    });

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 1024,
      onFinish: async ({ usage }) => {
        // TODO: Persist messages + log AI usage to database with organizationId
        if (process.env.NODE_ENV === "development" && usage) {
          console.log(
            `[Ossy] ${usage.inputTokens}in / ${usage.outputTokens}out`
          );
        }
      },
    });

    return result.toUIMessageStreamResponse();
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
