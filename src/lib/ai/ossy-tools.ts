import { tool } from "ai";
import { z } from "zod/v4";
import { updateProfileField, ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";
import { logOnboardingEvent } from "@/lib/onboarding/event-logger";
import { syncAllPreferencesToGraph } from "@/lib/enrichment/preference-writer";

/** v2 interview fields (new 5-question flow) — used for funnel tracking */
const INTERVIEW_FIELDS_V2 = [
  "partnershipPhilosophy",
  "capabilityGaps",
  "preferredPartnerTypes",
  "dealBreaker",
  "geographyPreference",
];

/** @deprecated v1 legacy interview fields (old 9-question flow) — kept for backward compat */
const INTERVIEW_FIELDS_V1 = [
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

const profileFieldSchema = z.enum(ALL_PROFILE_FIELDS);

const toolInputSchema = z.object({
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
    "The confirmed value. Use a string for single-value fields (firmCategory, growthGoals, idealPartnerClientSize, idealProjectSize, typicalHourlyRates). " +
    "Use an array of strings for multi-value fields (services, skills, preferredPartnerTypes, etc.)."
  ),
});

type ToolInput = z.infer<typeof toolInputSchema>;

/**
 * Creates Ossy AI tools with DB access baked in.
 * Tools execute server-side and persist confirmed data.
 */
export function createOssyTools(organizationId: string, firmId: string) {
  return {
    navigate_section: tool({
      description:
        "Navigate the user to a different section of their firm profile. " +
        "Use when the user asks about something that belongs on a different page " +
        "(e.g., they're on Overview but ask about partner preferences). " +
        "The client will handle the actual navigation.",
      inputSchema: z.object({
        section: z.enum(["overview", "offering", "experts", "experience", "preferences"])
          .describe("The firm section to navigate to"),
        reason: z.string().describe("Brief explanation of why navigating (shown to user)"),
      }),
      execute: async ({ section, reason }) => {
        const routes: Record<string, string> = {
          overview: "/firm",
          offering: "/firm/offering",
          experts: "/firm/experts",
          experience: "/firm/experience",
          preferences: "/firm/preferences",
        };
        return { success: true, navigateTo: routes[section], section, reason };
      },
    }),

    update_profile: tool({
      description:
        "Update the user's firm profile or partner preferences when they confirm a data point. " +
        "Call this AFTER the user confirms information, not while still suggesting. " +
        "You can call this multiple times per response for different fields.",
      inputSchema: toolInputSchema,
      execute: async ({ field, value }: ToolInput) => {
        try {
          const result = await updateProfileField(firmId, field, value);

          // Log interview question completion for funnel tracking
          // Check both v2 and v1 field lists for backward compat
          const v2Index = INTERVIEW_FIELDS_V2.indexOf(field);
          const v1Index = INTERVIEW_FIELDS_V1.indexOf(field);
          const questionIndex = v2Index >= 0 ? v2Index : v1Index;
          const activeFields = v2Index >= 0 ? INTERVIEW_FIELDS_V2 : INTERVIEW_FIELDS_V1;
          const totalQuestions = activeFields.length;
          let nextAction: string | undefined;

          if (questionIndex >= 0) {
            logOnboardingEvent({
              organizationId,
              firmId,
              stage: "interview_answer",
              event: field,
              metadata: { questionNumber: questionIndex + 1, value },
            }).catch(() => {}); // fire-and-forget

            // Check if all interview questions are now answered
            if (questionIndex === activeFields.length - 1) {
              // Last question — emit onboarding_complete
              logOnboardingEvent({
                organizationId,
                firmId,
                stage: "onboarding_complete",
                event: "all_questions_done",
                metadata: { questionsAnswered: totalQuestions },
              }).catch(() => {});

              // Safety net: sync ALL preferences to Neo4j graph
              // Catches any per-field syncs that may have failed
              syncAllPreferencesToGraph(firmId).catch((err) =>
                console.error(`[Ossy Tools] Neo4j full sync failed:`, err)
              );

              nextAction = "All onboarding questions are complete! Congratulate the user and let them know their dashboard is unlocking.";
            } else {
              // More questions remain — tell the model to continue
              const nextField = activeFields[questionIndex + 1];
              nextAction = `Saved question ${questionIndex + 1} of ${totalQuestions}. Now immediately ask the user onboarding question ${questionIndex + 2} (${nextField}). Do NOT stop here — the next question must be in your response.`;
            }
          }

          return {
            success: true as const,
            field: result.field,
            value: result.value,
            ...(nextAction ? { nextAction } : {}),
          };
        } catch (err) {
          console.error(`[Ossy Tools] Failed to update ${field}:`, err);
          return { success: false as const, field, error: String(err) };
        }
      },
    }),
  };
}
