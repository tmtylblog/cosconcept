import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getOssyPrompt } from "@/lib/ai/ossy-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Guest chat endpoint — no auth required, no billing check.
 * Hard-limited to prevent abuse (max 5 user messages per request).
 */
export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as {
      messages: UIMessage[];
    };

    // Hard limit: reject if too many user messages
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length > 6) {
      return new Response(
        JSON.stringify({ error: "Guest message limit reached. Please create an account to continue." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = getOssyPrompt({
      isOnboarding: true,
      isGuest: true,
    });

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 512,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Ossy Guest] Chat route error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
