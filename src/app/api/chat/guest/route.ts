import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod/v4";
import { getOssyPrompt } from "@/lib/ai/ossy-prompt";
import { ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Guest Tools (client-side only — no DB writes) ──────────

const profileFieldSchema = z.enum(ALL_PROFILE_FIELDS);

/**
 * Guest version of update_profile — does NOT write to DB.
 * Returns structured data so the client can cache it in sessionStorage
 * and migrate it to the DB after authentication.
 */
const guestUpdateProfileTool = tool({
  description:
    "Record a confirmed data point from the user's profile or partner preferences. " +
    "Call this AFTER the user confirms information, not while still suggesting. " +
    "You can call this multiple times per response for different fields. " +
    "This saves the data so it can be persisted when the user signs in.",
  inputSchema: z.object({
    field: profileFieldSchema.describe(
      "The profile field to update. " +
      "Firm fields: firmCategory, services, clients, skills, markets, languages, industries. " +
      "Partner preferences: preferredPartnerTypes, preferredPartnerSize, requiredPartnerIndustries, preferredPartnerLocations, partnershipModels, dealBreakers, growthGoals. " +
      "Partner criteria: desiredPartnerServices, idealPartnerClientSize, idealProjectSize, typicalHourlyRates."
    ),
    value: z.union([
      z.string(),
      z.array(z.string()),
    ]).describe(
      "The confirmed value. Use a string for single-value fields, an array for multi-value fields."
    ),
  }),
  execute: async ({ field, value }) => {
    // No DB write — just return the data for client-side caching
    return { success: true as const, field, value, source: "guest" as const };
  },
});

/**
 * Signals the client to show the login/signup modal.
 * Ossy calls this after completing all 8 partner preference questions.
 */
const requestLoginTool = tool({
  description:
    "Call this AFTER you have completed all 8 partner preference questions to prompt the user to sign in. " +
    "This will show a login/signup form in the chat. Only call this once per conversation. " +
    "Your message should frame sign-in around VALUE — what you can do for them now that you know their preferences.",
  inputSchema: z.object({
    reason: z.string().describe("Brief message explaining why sign-in will help them, e.g. 'save your partner profile and start finding matches'"),
  }),
  execute: async ({ reason }) => {
    return { action: "show_login" as const, reason };
  },
});

/**
 * Guest chat endpoint — no auth required, no billing check.
 * Supports full onboarding: enrichment confirmation + all 8 preference questions.
 * Tools record data client-side; persisted to DB after sign-in.
 */
export async function POST(req: Request) {
  try {
    const { messages, websiteContext } = (await req.json()) as {
      messages: UIMessage[];
      websiteContext?: string;
    };

    // Safety limit: reject if conversation is extremely long (abuse prevention)
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length > 35) {
      return new Response(
        JSON.stringify({ error: "Guest message limit reached. Please create an account to continue." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = getOssyPrompt({
      isOnboarding: true,
      isGuest: true,
      websiteContext: websiteContext ?? undefined,
    });

    const modelMessages = await convertToModelMessages(messages);

    const guestTools = {
      update_profile: guestUpdateProfileTool,
      request_login: requestLoginTool,
    };

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 2048,
      ...{ tools: guestTools, maxSteps: 3 },
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
