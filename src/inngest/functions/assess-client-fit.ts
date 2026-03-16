/**
 * Inngest: research/assess-fit — Client Fit Assessment
 *
 * Runs after research/company completes. Scores how well the user's firm
 * fits a researched prospect, generates talking points, and finds gap-filling partners.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { companyResearch, enrichmentCache, serviceFirms, firmCaseStudies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assessClientFit } from "@/lib/matching/fit-assessment";
import { loadAbstractionProfile } from "@/lib/matching/abstraction-generator";
import { executeSearch } from "@/lib/matching/search";
import type { ClientResearchData } from "@/lib/enrichment/client-research";

export const assessFit = inngest.createFunction(
  {
    id: "assess-client-fit",
    concurrency: [{ limit: 5 }],
    retries: 1,
  },
  { event: "research/assess-fit" },
  async ({ event, step }) => {
    const { domain, firmId, pitchContext } = event.data;

    // Step 1: Load research data
    const clientData = await step.run("load-research", async () => {
      const [row] = await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.domain, domain))
        .limit(1);

      if (!row?.executiveSummary) return null;

      let highlights: { title: string; description: string }[] = [];
      try {
        highlights = row.interestingHighlights ? JSON.parse(row.interestingHighlights) : [];
      } catch { /* ignore */ }

      // Enrich with cache data
      const [cacheRow] = await db
        .select({ enrichmentData: enrichmentCache.enrichmentData })
        .from(enrichmentCache)
        .where(eq(enrichmentCache.domain, domain))
        .limit(1);

      const cacheData = (cacheRow?.enrichmentData as Record<string, unknown>) ?? null;
      const cd = cacheData?.companyData as Record<string, unknown> | undefined;
      const cls = cacheData?.classification as Record<string, unknown> | undefined;

      return {
        name: row.companyName,
        domain: row.domain,
        industry: (cd?.industry as string) ?? "",
        size: (cd?.size as string) ?? "",
        employeeCount: (cd?.employeeCount as number) ?? 0,
        location: (cd?.location as string) ?? "",
        inferredRevenue: (cd?.inferredRevenue as string) ?? null,
        tags: (cd?.tags as string[]) ?? [],
        services: ((cacheData?.extracted as Record<string, unknown>)?.services as string[]) ?? [],
        aboutPitch: ((cacheData?.extracted as Record<string, unknown>)?.aboutPitch as string) ?? "",
        classification: {
          categories: (cls?.categories as string[]) ?? [],
          skills: (cls?.skills as string[]) ?? [],
          industries: (cls?.industries as string[]) ?? [],
          markets: (cls?.markets as string[]) ?? [],
        },
        intelligence: {
          executiveSummary: row.executiveSummary ?? "",
          interestingHighlights: highlights,
          offeringSummary: row.offeringSummary ?? "",
          industryInsight: row.industryInsight ?? "",
          stageInsight: row.stageInsight ?? "",
          customerInsight: row.customerInsight ?? "",
          buyingIntentInsight: row.buyingIntentInsight ?? "",
          growthChallenges: row.growthChallenges ?? "",
          keyMarkets: row.keyMarkets ?? "",
          competitorsInsight: row.competitorsInsight ?? "",
          industryTrends: row.industryTrends ?? "",
        },
        fromCache: true,
        graphNodeId: row.graphNodeId,
      } satisfies ClientResearchData;
    });

    if (!clientData) {
      return { status: "skipped", reason: "no-research-data" };
    }

    // Step 2: Load firm data
    const firmData = await step.run("load-firm", async () => {
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

      return { firmEnrichment, firmAbstraction, caseStudies };
    });

    // Step 3: Score fit
    const fitResult = await step.run("score-fit", async () => {
      return await assessClientFit({
        clientData,
        firmEnrichmentData: firmData.firmEnrichment,
        firmAbstraction: firmData.firmAbstraction,
        firmCaseStudies: firmData.caseStudies,
        pitchContext,
      });
    });

    // Step 4: Find gap-filling partners
    const partners = await step.run("find-partners", async () => {
      if (fitResult.gaps.length === 0) return [];

      try {
        const gapIndustries = clientData.classification.industries.slice(0, 3);
        const gapQuery = `${gapIndustries.join(" ")} ${clientData.intelligence.offeringSummary?.slice(0, 100) ?? ""}`.trim();
        if (!gapQuery) return [];

        const searchResult = await executeSearch({
          rawQuery: gapQuery,
          searcherFirmId: firmId,
          skipLlmRanking: true,
        });

        return searchResult.candidates.slice(0, 5).map((c) => ({
          firmName: c.displayName,
          matchScore: Math.round(c.totalScore * 100),
          relevance: c.matchExplanation ?? `Relevant for ${clientData.name}'s industry`,
          categories: c.preview.categories.slice(0, 3),
          skills: c.preview.topSkills.slice(0, 5),
        }));
      } catch (err) {
        console.error("[assess-fit] Partner search failed:", err);
        return [];
      }
    });

    // Step 5: Persist fit result to company_research row
    await step.run("persist-result", async () => {
      try {
        await db
          .update(companyResearch)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(companyResearch.domain, domain));
      } catch (err) {
        console.error("[assess-fit] Persist failed:", err);
      }
    });

    return {
      status: "completed",
      domain,
      overallScore: fitResult.overallScore,
      strengths: fitResult.strengths.length,
      gaps: fitResult.gaps.length,
      partners: partners.length,
    };
  }
);
