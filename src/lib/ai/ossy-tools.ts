import { tool } from "ai";
import { z } from "zod/v4";
import { updateProfileField, ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";
import { logOnboardingEvent } from "@/lib/onboarding/event-logger";

/** Interview questions in order — used for funnel tracking */
const INTERVIEW_FIELDS = [
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
          const questionIndex = INTERVIEW_FIELDS.indexOf(field);
          if (questionIndex >= 0) {
            logOnboardingEvent({
              organizationId,
              firmId,
              stage: "interview_answer",
              event: field,
              metadata: { questionNumber: questionIndex + 1, value },
            }).catch(() => {}); // fire-and-forget

            // Check if all 9 interview questions are now answered
            if (questionIndex === INTERVIEW_FIELDS.length - 1) {
              // Last question — emit onboarding_complete
              logOnboardingEvent({
                organizationId,
                firmId,
                stage: "onboarding_complete",
                event: "all_questions_done",
                metadata: { questionsAnswered: INTERVIEW_FIELDS.length },
              }).catch(() => {});
            }
          }

          return { success: true as const, field: result.field, value: result.value };
        } catch (err) {
          console.error(`[Ossy Tools] Failed to update ${field}:`, err);
          return { success: false as const, field, error: String(err) };
        }
      },
    }),
  };
}
