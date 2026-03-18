import { tool } from "ai";
import { z } from "zod/v4";
import { updateProfileField, ALL_PROFILE_FIELDS } from "@/lib/profile/update-profile-field";
import { logOnboardingEvent } from "@/lib/onboarding/event-logger";
import { executeSearch } from "@/lib/matching/search";
import { lookupFirmDetail } from "@/lib/matching/firm-lookup";
import { searchExperts } from "@/lib/matching/expert-search";
import { searchCaseStudies } from "@/lib/matching/case-study-search";
import { checkCompanyResearchTable, checkEnrichmentCache } from "@/lib/enrichment/client-research";
import { assessClientFit } from "@/lib/matching/fit-assessment";
import { analyzeClientOverlap } from "@/lib/matching/client-overlap";
import { loadAbstractionProfile } from "@/lib/matching/abstraction-generator";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { serviceFirms, firmCaseStudies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

          // Filter out searcher's own firm from results
          const filtered = result.candidates.filter(c => c.firmId !== firmId);

          const searchIntent = result.searchIntent ?? "partner";

          const candidates = filtered.slice(0, 8).map((c) => ({
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
            // Expert-specific fields
            specialistTitle: c.preview.primarySpecialistTitle ?? undefined,
            specialistProfileCount: c.preview.specialistProfileCount ?? undefined,
            subtitle: c.preview.subtitle ?? undefined,
            // Case study-specific fields
            contributorCount: c.preview.contributorCount ?? undefined,
            summary: c.preview.summary ?? undefined,
            sourceUrl: c.preview.sourceUrl ?? undefined,
            clientName: c.preview.clientName ?? undefined,
          }));

          // Build a brief analysis hint for Ossy from the result data
          const allCategories = candidates.flatMap((c) => c.categories);
          const allSkills = candidates.flatMap((c) => c.skills);
          const allIndustries = candidates.flatMap((c) => c.industries);
          const topCategories = [...new Set(allCategories)].slice(0, 6);
          const topSkills = [...new Set(allSkills)].slice(0, 8);
          const topIndustries = [...new Set(allIndustries)].slice(0, 6);
          const withCaseStudies = candidates.filter((c) => (c.caseStudyCount ?? 0) > 0).length;

          // Build specific sharpening hints from result data
          const sharpeningHints: string[] = [];
          if (topCategories.length >= 2) {
            sharpeningHints.push(`Category split: results span ${topCategories.slice(0, 3).join(", ")} — ask which direction fits their model better`);
          }
          if (withCaseStudies > 0 && withCaseStudies < candidates.length) {
            sharpeningHints.push(`Evidence gap: ${withCaseStudies} of ${candidates.length} firms have case studies — ask if proven track record matters`);
          }
          if (topIndustries.length >= 2) {
            sharpeningHints.push(`Industry variety: results cover ${topIndustries.slice(0, 3).join(", ")} — ask which segment they're targeting`);
          }
          if (topSkills.length >= 3) {
            sharpeningHints.push(`Skill clusters: dominant skills are ${topSkills.slice(0, 4).join(", ")} — ask if any specific capability is must-have`);
          }

          // Load searcher's abstraction profile for self-assessment context
          let _searcherProfile: Record<string, unknown> | undefined;
          if (firmId) {
            try {
              const abs = await loadAbstractionProfile(firmId);
              if (abs) {
                _searcherProfile = {
                  topServices: abs.topServices,
                  topSkills: abs.topSkills,
                  topIndustries: abs.topIndustries,
                  caseStudyCount: abs.evidenceSources?.caseStudyCount ?? 0,
                  expertCount: abs.evidenceSources?.expertCount ?? 0,
                };
              }
            } catch {
              // Non-critical — proceed without profile
            }
          }

          return {
            success: true,
            query,
            searchIntent,
            totalFound: filtered.length,
            candidates,
            ...(_searcherProfile ? { _searcherProfile } : {}),
            resultAnalysis: {
              categoriesRepresented: topCategories,
              skillsRepresented: topSkills,
              industriesRepresented: topIndustries,
              firmsWithCaseStudies: withCaseStudies,
              totalCandidates: candidates.length,
            },
            _sharpeningHints: sharpeningHints,
            _instruction: "CRITICAL: Your response MUST have two parts: (1) A 2-3 sentence insight about what you found — mention specific patterns, splits, or notable observations from the resultAnalysis. Do NOT just say 'Found N matches'. (2) ONE specific sharpening follow-up question using the _sharpeningHints above. Tell the user what you NOTICED and ask a question that would meaningfully change the results. Example: 'Interesting — half these firms are full-service agencies and the other half are specialist boutiques. The specialists have deeper case study portfolios. Are you looking for a focused expert or a broader partner who can handle more?' NEVER just say 'want me to narrow by X?' — always lead with an observation.",
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

              // Safety net: sync ALL preferences to Neo4j graph via Inngest
              // Catches any per-field syncs that may have failed
              inngest.send({
                name: "preferences/sync-graph",
                data: { firmId },
              }).catch((err) =>
                console.error(`[Ossy Tools] Failed to queue preference sync:`, err)
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
          if (experts.length === 0) {
            return {
              experts: [],
              totalFound: 0,
              _instruction: `No experts found for "${query}". Don't just say "no results" — suggest alternative searches, broader terms, or ask the user if they'd like to try a different angle. Be helpful and conversational.`,
            };
          }
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
          if (caseStudies.length === 0) {
            return {
              caseStudies: [],
              totalFound: 0,
              _instruction: `No case studies found for "${query}". Don't just say "no results" — suggest alternative searches or related areas where case studies might exist. Be helpful and conversational.`,
            };
          }
          return { caseStudies, totalFound: caseStudies.length };
        } catch (err) {
          console.error("[Ossy Tools] search_case_studies failed:", err);
          return { caseStudies: [], totalFound: 0, error: String(err) };
        }
      },
    }),

    lookup_firm: tool({
      description:
        "Look up a service provider firm that is already registered on the Collective OS platform. " +
        "Only use this for firms that are platform members — NOT for external companies, clients, or prospects. " +
        "For researching external companies (clients, prospects, brands), use research_client instead.",
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

    research_client: tool({
      description:
        "Research ANY external company — a client, prospect, brand, or any company not on the platform. " +
        "Use this whenever a user asks to 'research', 'look into', 'tell me about', or 'analyze' a company, " +
        "or when they mention pitching or preparing for a client meeting. " +
        "Gathers firmographics, scrapes their website, generates strategic intelligence " +
        "(executive summary, offering analysis, customer insight, growth challenges, competitors), " +
        "assesses how well the user's firm fits, and suggests partners that could help win the deal.",
      parameters: z.object({
        clientDomainOrName: z.string().describe("Client company domain (e.g., 'nike.com') or name (e.g., 'Nike')"),
        context: z.string().optional().describe("Optional pitch context, e.g., 'digital transformation project' or 'e-commerce replatforming'"),
      }),
      execute: async ({ clientDomainOrName, context }) => {
        if (!firmId) {
          return { success: false, error: "I need your firm profile to assess fit. Complete onboarding first." };
        }

        try {
          // Parse domain from input
          let domain = clientDomainOrName.trim().toLowerCase();
          domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

          // If no TLD, it's a company name — ask the user to confirm domain
          if (!domain.includes(".")) {
            const companyName = clientDomainOrName.trim();
            return {
              success: false,
              needsDomain: true,
              companyName,
              _instruction: `The user said "${companyName}" but I need a website domain to research them properly. Ask the user to confirm the domain — e.g., "I'd love to research ${companyName} for you! What's their website domain? For example, is it ${companyName.toLowerCase().replace(/\s+/g, "")}.com?"`,
            };
          }

          // Check if research already exists (instant cache check)
          const cached = await checkCompanyResearchTable(domain);

          if (cached) {
            // Enrich cached data from enrichmentCache
            const cacheData = await checkEnrichmentCache(domain);
            if (cacheData) {
              const cd = cacheData.companyData as Record<string, unknown> | undefined;
              const ext = cacheData.extracted as Record<string, unknown> | undefined;
              const cls = cacheData.classification as Record<string, unknown> | undefined;
              cached.industry = (cd?.industry as string) ?? "";
              cached.size = (cd?.size as string) ?? "";
              cached.employeeCount = (cd?.employeeCount as number) ?? 0;
              cached.location = (cd?.location as string) ?? "";
              cached.inferredRevenue = (cd?.inferredRevenue as string) ?? null;
              cached.tags = (cd?.tags as string[]) ?? [];
              cached.services = (ext?.services as string[]) ?? [];
              cached.aboutPitch = (ext?.aboutPitch as string) ?? "";
              cached.classification = {
                categories: (cls?.categories as string[]) ?? [],
                skills: (cls?.skills as string[]) ?? [],
                industries: (cls?.industries as string[]) ?? [],
                markets: (cls?.markets as string[]) ?? [],
              };
            }

            // Cache HIT — run fit assessment inline (fast: just scoring + 1 AI call)
            const [firmRow] = await db
              .select({ enrichmentData: serviceFirms.enrichmentData, name: serviceFirms.name })
              .from(serviceFirms)
              .where(eq(serviceFirms.id, firmId))
              .limit(1);

            const firmEnrichment = (firmRow?.enrichmentData as Record<string, unknown>) ?? {};
            const firmAbstraction = await loadAbstractionProfile(firmId);

            const caseStudyRows = await db
              .select({ autoTags: firmCaseStudies.autoTags })
              .from(firmCaseStudies)
              .where(eq(firmCaseStudies.firmId, firmId));

            const caseStudies = caseStudyRows.map((r) => ({
              autoTags: (r.autoTags as Record<string, unknown>) ?? {},
            }));

            const fitResult = await assessClientFit({
              clientData: cached,
              firmEnrichmentData: firmEnrichment,
              firmAbstraction,
              firmCaseStudies: caseStudies,
              pitchContext: context,
            });

            // Find gap-filling partners
            let suggestedPartners: { firmName: string; matchScore: number; relevance: string; categories: string[]; skills: string[] }[] = [];
            if (fitResult.gaps.length > 0) {
              try {
                const gapIndustries = cached.classification.industries.slice(0, 3);
                const gapQuery = `${gapIndustries.join(" ")} ${cached.intelligence.offeringSummary?.slice(0, 100) ?? ""}`.trim();
                if (gapQuery) {
                  const searchResult = await executeSearch({
                    rawQuery: gapQuery,
                    searcherFirmId: firmId,
                    skipLlmRanking: true,
                  });
                  suggestedPartners = searchResult.candidates.slice(0, 5).map((c) => ({
                    firmName: c.displayName,
                    matchScore: Math.round(c.totalScore * 100),
                    relevance: c.matchExplanation ?? `Relevant for ${cached.name}'s industry`,
                    categories: c.preview.categories.slice(0, 3),
                    skills: c.preview.topSkills.slice(0, 5),
                  }));
                }
              } catch (err) {
                console.error("[Ossy] Partner search for gaps failed:", err);
              }
            }

            return {
              success: true,
              client: {
                name: cached.name,
                domain: cached.domain,
                industry: cached.industry,
                size: cached.size,
                employeeCount: cached.employeeCount,
                location: cached.location,
                executiveSummary: cached.intelligence.executiveSummary,
                stageInsight: cached.intelligence.stageInsight,
                customerInsight: cached.intelligence.customerInsight,
                offeringSummary: cached.intelligence.offeringSummary,
                interestingHighlights: cached.intelligence.interestingHighlights,
              },
              fitAssessment: {
                overallScore: fitResult.overallScore,
                dimensions: fitResult.dimensions,
                strengths: fitResult.strengths,
                gaps: fitResult.gaps,
                talkingPoints: fitResult.talkingPoints,
              },
              suggestedPartners,
              _instruction: "Present results conversationally. Lead with the fit score and what makes the firm strong for this client. If there are gaps, frame partner suggestions as \"here's how you can strengthen your pitch.\" Use the talking points as specific advice. Don't dump all data — be selective and insightful. (Research was cached — instant lookup)",
            };
          }

          // Cache MISS — queue background research via Inngest
          await inngest.send({
            name: "research/company",
            data: { domain, firmId, userId: organizationId /* orgId used as userId fallback */, pitchContext: context },
          });

          return {
            success: true,
            queued: true,
            domain,
            _instruction: `Tell the user: I don't have research on this company yet. I've started a deep analysis on ${domain} — this takes about a minute. I'll gather firmographics, scrape their website, classify their business, and generate strategic intelligence. When it's ready, just ask me again and I'll have the full research with your fit assessment. In the meantime, is there anything specific you want to know about them?`,
          };
        } catch (err) {
          console.error("[Ossy] research_client failed:", err);
          return { success: false, error: `Research failed: ${String(err)}` };
        }
      },
    }),

    analyze_client_overlap: tool({
      description:
        "Analyze which of the user's clients would benefit from a specific partner's capabilities. " +
        "Generates concrete collaboration ideas for partner meetings. " +
        "Use this when a user mentions meeting a partner and wants to discuss their clients.",
      parameters: z.object({
        partnerNameOrDomain: z.string().describe("The partner firm's name or domain to analyze overlap with"),
      }),
      execute: async ({ partnerNameOrDomain }) => {
        if (!firmId) {
          return { success: false, error: "I need your firm profile first. Complete onboarding." };
        }

        try {
          // 1. Look up the partner
          const partnerDetail = await lookupFirmDetail(partnerNameOrDomain);
          if (!partnerDetail.found) {
            return {
              success: false,
              error: `I couldn't find "${partnerNameOrDomain}" on the platform. Can you provide their domain (e.g., acme.com)?`,
            };
          }

          // Load partner abstraction for richer data
          // We need to find the partner's firmId first
          const [partnerFirm] = await db
            .select({ id: serviceFirms.id })
            .from(serviceFirms)
            .where(eq(serviceFirms.name, partnerDetail.name ?? ""))
            .limit(1);

          const partnerAbstraction = partnerFirm
            ? await loadAbstractionProfile(partnerFirm.id)
            : null;

          // Get firm name
          const [myFirm] = await db
            .select({ name: serviceFirms.name })
            .from(serviceFirms)
            .where(eq(serviceFirms.id, firmId))
            .limit(1);

          // 2. Run overlap analysis
          const result = await analyzeClientOverlap({
            firmId,
            firmName: myFirm?.name ?? "Your firm",
            partnerName: partnerDetail.name ?? partnerNameOrDomain,
            partnerCategories: partnerDetail.categories ?? [],
            partnerSkills: partnerDetail.skills ?? [],
            partnerIndustries: partnerDetail.industries ?? [],
            partnerTopServices: partnerAbstraction?.topServices ?? [],
            partnerCaseStudyCount: partnerDetail.caseStudyCount ?? 0,
          });

          if (result.totalClients === 0) {
            return {
              success: false,
              error: "I don't see any clients in your profile yet. Add clients on your firm overview page, or I can research your website to find them.",
            };
          }

          return {
            success: true,
            partner: {
              name: partnerDetail.name,
              website: partnerDetail.website,
              categories: partnerDetail.categories,
              skills: partnerDetail.skills,
              industries: partnerDetail.industries,
              caseStudyCount: partnerDetail.caseStudyCount,
            },
            clientAnalysis: {
              totalClients: result.totalClients,
              analyzedClients: result.analyzedClients,
              relevantClients: result.relevantClients,
            },
            meetingTalkingPoints: result.meetingTalkingPoints,
            _instruction: "Present this as meeting prep. Lead with the strongest collaboration opportunity. List 3-5 clients with specific ideas. End with the talking points as conversation starters. Be practical and specific — this should feel like a consultant briefing before a meeting.",
          };
        } catch (err) {
          console.error("[Ossy] analyze_client_overlap failed:", err);
          return { success: false, error: `Analysis failed: ${String(err)}` };
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
