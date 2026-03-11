import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod/v4";
import { getOssyPrompt } from "@/lib/ai/ossy-prompt";
import { ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Guest Tools (client-side only — no DB writes) ──────────

const profileFieldSchema = z.enum(ALL_PROFILE_FIELDS);

/** v2 interview questions in order — used for completion detection */
const INTERVIEW_FIELDS_GUEST_V2 = [
  "partnershipPhilosophy",
  "capabilityGaps",
  "preferredPartnerTypes",
  "dealBreaker",
  "geographyPreference",
];

/** @deprecated v1 legacy interview fields — kept for backward-compat completion detection */
const INTERVIEW_FIELDS_GUEST_V1 = [
  "desiredPartnerServices",
  "requiredPartnerIndustries",
  "idealPartnerClientSize",
  "preferredPartnerLocations",
  "preferredPartnerTypes",
  "preferredPartnerSize",
  "idealProjectSize",
  "typicalHourlyRates",
  "partnershipRole",
];

/** Active interview fields for new onboarding — v2 */
const INTERVIEW_FIELDS_GUEST = INTERVIEW_FIELDS_GUEST_V2;

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
    "This saves the data so it can be persisted when the user signs in. " +
    "Always include your full text response (acknowledgment + next question) alongside this tool call.",
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
      "The confirmed value. Use an ARRAY for: desiredPartnerServices, requiredPartnerIndustries, idealPartnerClientSize, preferredPartnerLocations, preferredPartnerTypes, preferredPartnerSize, idealProjectSize. Use a STRING for: typicalHourlyRates, partnershipRole, firmCategory, growthGoals. Always use array even if only one item selected."
    ),
  }),
  execute: async ({ field, value }) => {
    // No DB write — just return the data for client-side caching
    // Generate contextual continuation hint based on question progress
    // Check both v2 and v1 field lists for backward compat
    const v2Index = INTERVIEW_FIELDS_GUEST_V2.indexOf(field);
    const v1Index = INTERVIEW_FIELDS_GUEST_V1.indexOf(field);
    const questionIndex = v2Index >= 0 ? v2Index : v1Index;
    const activeFields = v2Index >= 0 ? INTERVIEW_FIELDS_GUEST_V2 : INTERVIEW_FIELDS_GUEST_V1;
    const totalQuestions = activeFields.length;
    let nextAction: string;

    if (questionIndex === activeFields.length - 1) {
      // Last question — tell model to congratulate and call request_login
      nextAction = "All onboarding questions are complete! Congratulate the user and call request_login to show the sign-up button.";
    } else if (questionIndex >= 0) {
      const nextField = activeFields[questionIndex + 1];
      nextAction = `Saved question ${questionIndex + 1} of ${totalQuestions}. Now immediately ask question ${questionIndex + 2} (${nextField}). Do NOT stop here — the next question must be in your response.`;
    } else {
      nextAction = "Saved! Now respond with a brief acknowledgment AND the next onboarding question.";
    }

    return {
      success: true as const,
      field,
      value,
      source: "guest" as const,
      nextAction,
    };
  },
});

/**
 * Signals the client to show the login/signup modal.
 * Ossy calls this after completing all partner preference questions.
 */
const requestLoginTool = tool({
  description:
    "Call this AFTER you have completed all partner preference questions to prompt the user to sign in. " +
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
 * Supports full onboarding: enrichment confirmation + all preference questions (v2: 5, v1: 9 legacy).
 * Tools record data client-side; persisted to DB after sign-in.
 */
export async function POST(req: Request) {
  try {
    const { messages, websiteContext, collectedPreferences, isBrandDetected } = (await req.json()) as {
      messages: UIMessage[];
      websiteContext?: string;
      collectedPreferences?: Record<string, string | string[]>;
      isBrandDetected?: boolean;
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
      collectedPreferences: collectedPreferences ?? undefined,
      isBrandDetected: isBrandDetected ?? false,
    });

    console.log("[Ossy Guest] System prompt length:", systemPrompt.length);
    console.log("[Ossy Guest] Messages count:", messages.length, "User msgs:", userMessages.length);

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages);
      console.log("[Ossy Guest] Converted model messages:", modelMessages.length);
    } catch (convErr) {
      console.error("[Ossy Guest] Message conversion failed:", convErr);
      return new Response(
        JSON.stringify({ error: "Failed to process conversation history" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const guestTools = {
      update_profile: guestUpdateProfileTool,
      request_login: requestLoginTool,
    };

    const result = streamText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 2048,
      tools: guestTools,
      maxSteps: 5,
      onStepFinish: ({ text, toolCalls, finishReason }) => {
        console.log("[Ossy Guest] Step finished:", {
          finishReason,
          hasText: !!text,
          textLength: text?.length ?? 0,
          toolCallCount: toolCalls?.length ?? 0,
        });
      },
      onFinish: ({ text, finishReason, usage }) => {
        console.log("[Ossy Guest] Finished:", {
          finishReason,
          textLength: text?.length ?? 0,
          usage: JSON.stringify(usage),
        });
      },
      onError: ({ error }) => {
        console.error("[Ossy Guest] Stream error:", error);
      },
    } as Parameters<typeof streamText>[0]);

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Ossy Guest] Chat route error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
