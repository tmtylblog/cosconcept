import { tool } from "ai";
import { z } from "zod/v4";
import { updateProfileField, ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";
import { logOnboardingEvent } from "@/lib/onboarding/event-logger";
import { syncAllPreferencesToGraph } from "@/lib/enrichment/preference-writer";
import { executeSearch } from "@/lib/matching/search";
import { lookupFirmDetail } from "@/lib/matching/firm-lookup";
import { searchExperts } from "@/lib/matching/expert-search";
import { searchCaseStudies } from "@/lib/matching/case-study-search";

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
export function createOssyTools(organizationId: string, firmId?: string) {
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

    discover_search: tool({
      description:
        "Search the Collective OS knowledge graph for firms, experts, or case studies. " +
        "Use when the user wants to find partners, experts, agencies, consultants, or see case study examples. " +
        "Always use this tool when the user asks to find, search, or discover anything in the network — never say you can't search.",
      inputSchema: z.object({
        query: z.string().describe("Natural language search query, e.g. 'Shopify agency in APAC' or 'fractional CMO for SaaS'"),
        entityType: z
          .enum(["firm", "expert", "case_study"])
          .optional()
          .describe("Restrict to a specific entity type. Omit to search all types."),
      }),
      execute: async ({ query, entityType }) => {
        try {
          const result = await executeSearch({
            rawQuery: query,
            searcherFirmId: firmId,
            explicitFilters: entityType ? { entityType } : undefined,
            skipLlmRanking: false,
          });

          const candidates = result.candidates.slice(0, 8).map((c) => ({
            entityType: c.entityType,
            entityId: c.entityId,
            firmId: c.firmId,
            displayName: c.displayName,
            firmName: c.firmName ?? c.preview.firmName ?? c.preview.subtitle ?? c.displayName,
            matchScore: Math.round(c.totalScore * 100),
            explanation: c.matchExplanation ?? "",
            categories: c.preview.categories.slice(0, 5),
            skills: c.preview.topSkills.slice(0, 8),
            industries: c.preview.industries.slice(0, 5),
            website: c.preview.website ?? undefined,
            caseStudyCount: c.preview.caseStudyCount ?? undefined,
          }));

          // Build a brief analysis hint for Ossy from the result data
          const allCategories = candidates.flatMap((c) => c.categories);
          const allSkills = candidates.flatMap((c) => c.skills);
          const allIndustries = candidates.flatMap((c) => c.industries);
          const topCategories = [...new Set(allCategories)].slice(0, 6);
          const topSkills = [...new Set(allSkills)].slice(0, 8);
          const topIndustries = [...new Set(allIndustries)].slice(0, 6);
          const withCaseStudies = candidates.filter((c) => (c.caseStudyCount ?? 0) > 0).length;

          return {
            success: true,
            query,
            totalFound: result.candidates.length,
            candidates,
            resultAnalysis: {
              categoriesRepresented: topCategories,
              skillsRepresented: topSkills,
              industriesRepresented: topIndustries,
              firmsWithCaseStudies: withCaseStudies,
              totalCandidates: candidates.length,
            },
            _instruction: "IMPORTANT: After presenting these results, you MUST ask a sharpening follow-up question based on what you see in the resultAnalysis. Look at the categories, skills, and industries across all matches — notice patterns, splits, or gaps, and ask ONE specific question that helps the user think deeper about what they need. Do NOT just say 'want me to narrow by X?' — instead tell them what you NOTICED and ask something specific.",
            stats: {
              durationMs: result.stats.totalDurationMs,
              layer1: result.stats.layer1Candidates,
            },
          };
        } catch (err) {
          console.error("[Ossy] discover_search failed:", err);
          return { success: false, error: String(err), candidates: [] };
        }
      },
    }),

    update_profile: tool({
      description:
        "Update the user's firm profile or partner preferences when they confirm a data point. " +
        "Call this AFTER the user confirms information, not while still suggesting. " +
        "You can call this multiple times per response for different fields.",
      inputSchema: toolInputSchema,
      execute: async ({ field, value }: ToolInput) => {
        if (!firmId) return { success: false as const, field, error: "No firm profile available in this context" };
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

    // ─── Search & Discovery Tools ────────────────────────────

    search_partners: tool({
      description:
        "Search for partner firms that complement the user's capabilities. " +
        "Use when the user asks to find agencies, consultancies, or firms " +
        "with specific skills, industries, or markets. " +
        "Returns ranked matches with scores and explanations.",
      inputSchema: z.object({
        query: z.string().describe(
          "Natural language search query describing what kind of partner the user needs. " +
          "Be specific: include skills, industries, markets, or firm types mentioned."
        ),
        skipDeepRanking: z.boolean().optional().describe(
          "Skip the LLM deep ranking layer for faster results. Default false."
        ),
      }),
      execute: async ({ query, skipDeepRanking }) => {
        try {
          const result = await executeSearch({
            rawQuery: query,
            searcherFirmId: firmId ?? undefined,
            skipLlmRanking: skipDeepRanking ?? false,
          });

          const candidates = result.candidates.slice(0, 10).map((c) => ({
            firmId: c.firmId,
            firmName: c.firmName,
            matchScore: Math.round(c.totalScore * 100),
            explanation: c.matchExplanation ?? "",
            categories: c.preview.categories,
            skills: c.preview.topSkills,
            industries: c.preview.industries,
            website: c.preview.website,
            employeeCount: c.preview.employeeCount,
          }));

          return {
            candidates,
            totalFound: result.candidates.length,
            stats: {
              searchDurationMs: result.stats.totalDurationMs,
              layersUsed: result.stats.layer3Ranked > 0 ? 3 : 2,
            },
          };
        } catch (err) {
          console.error("[Ossy Tools] search_partners failed:", err);
          return { candidates: [], totalFound: 0, error: String(err) };
        }
      },
    }),

    search_experts: tool({
      description:
        "Search for individual experts or professionals with specific skills or titles. " +
        "Use when the user asks to find a specific type of person " +
        "(e.g., 'fractional CMO', 'Shopify developer', 'brand strategist').",
      inputSchema: z.object({
        query: z.string().describe("What kind of expert the user is looking for"),
        skills: z.array(z.string()).optional().describe("Specific skill names to filter by"),
        limit: z.number().optional().describe("Max results, default 10"),
      }),
      execute: async ({ query, skills, limit }) => {
        try {
          const experts = await searchExperts({
            query,
            skills,
            limit: limit ?? 10,
          });
          return { experts, totalFound: experts.length };
        } catch (err) {
          console.error("[Ossy Tools] search_experts failed:", err);
          return { experts: [], totalFound: 0, error: String(err) };
        }
      },
    }),

    search_case_studies: tool({
      description:
        "Search for real project case studies demonstrating specific capabilities or industries. " +
        "Use when the user wants to see examples of work or proof of expertise.",
      inputSchema: z.object({
        query: z.string().describe("What kind of case study to find"),
        skills: z.array(z.string()).optional().describe("Skills demonstrated"),
        industries: z.array(z.string()).optional().describe("Industries served"),
        limit: z.number().optional().describe("Max results, default 10"),
      }),
      execute: async ({ query, skills, industries, limit }) => {
        try {
          const caseStudies = await searchCaseStudies({
            query,
            skills,
            industries,
            limit: limit ?? 10,
          });
          return { caseStudies, totalFound: caseStudies.length };
        } catch (err) {
          console.error("[Ossy Tools] search_case_studies failed:", err);
          return { caseStudies: [], totalFound: 0, error: String(err) };
        }
      },
    }),

    lookup_firm: tool({
      description:
        "Look up detailed information about a specific firm by name or domain. " +
        "Use when the user mentions a specific company and wants to know more about it.",
      inputSchema: z.object({
        nameOrDomain: z.string().describe("The firm name or website domain to look up"),
      }),
      execute: async ({ nameOrDomain }) => {
        try {
          return await lookupFirmDetail(nameOrDomain);
        } catch (err) {
          console.error("[Ossy Tools] lookup_firm failed:", err);
          return { found: false, message: "Failed to look up firm. Please try again." };
        }
      },
    }),

    get_my_profile: tool({
      description:
        "Get the user's own firm profile — what the platform knows about their capabilities, " +
        "industries, skills, and partnership preferences. " +
        "Use when the user asks 'what do you know about us?' or wants to review their profile.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!firmId) return { found: false, message: "No firm profile available in this context." };
        try {
          return await lookupFirmDetail(firmId, { byId: true });
        } catch (err) {
          console.error("[Ossy Tools] get_my_profile failed:", err);
          return { found: false, message: "Unable to load your firm profile." };
        }
      },
    }),
  };
}
