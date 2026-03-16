/**
 * Inngest: research/company — Client/Prospect Research Pipeline
 *
 * Runs the full research pipeline (PDL + Jina + classify + intelligence)
 * as a background job, avoiding Vercel's 60s timeout.
 *
 * On completion, auto-triggers "research/assess-fit" if firmId is provided.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { companyResearch, enrichmentCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enrichCompany } from "@/lib/enrichment/pdl";
import { scrapeFirmWebsite } from "@/lib/enrichment/jina-scraper";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";
import { writeResearchedCompanyToGraph } from "@/lib/enrichment/graph-writer";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function domainId(domain: string): string {
  return `cr_${domain.replace(/\./g, "_")}`;
}

function normalizeName(name: string): string {
  return name
    .replace(/\s*(Inc\.?|LLC|Corp\.?|Ltd\.?|Co\.?|PLC|GmbH|S\.?A\.?|B\.?V\.?)\s*$/i, "")
    .trim();
}

export const researchCompany = inngest.createFunction(
  {
    id: "research-company",
    concurrency: [{ limit: 3 }],
    retries: 2,
  },
  { event: "research/company" },
  async ({ event, step }) => {
    const { domain, firmId, userId, pitchContext, conversationId } = event.data;

    // Step 1: Check cache
    const cached = await step.run("check-cache", async () => {
      const [row] = await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.domain, domain))
        .limit(1);

      if (row?.executiveSummary) {
        return { hit: true as const };
      }

      // Check enrichmentCache for raw data
      const [cacheRow] = await db
        .select({ enrichmentData: enrichmentCache.enrichmentData })
        .from(enrichmentCache)
        .where(eq(enrichmentCache.domain, domain))
        .limit(1);

      return {
        hit: false as const,
        enrichCacheData: (cacheRow?.enrichmentData as Record<string, unknown>) ?? null,
      };
    });

    if (cached.hit) {
      // Already researched — trigger fit assessment directly
      await step.sendEvent("trigger-fit-assessment", {
        name: "research/assess-fit",
        data: { domain, firmId, userId, pitchContext, conversationId },
      });
      return { status: "cache-hit", domain };
    }

    // Step 2: Enrich with PDL (if no cached raw data)
    const pdlResult = await step.run("enrich-pdl", async () => {
      if (cached.enrichCacheData) {
        return { data: (cached.enrichCacheData.companyData as Record<string, unknown>) ?? null, skipped: true };
      }
      try {
        const pdl = await enrichCompany({ website: domain });
        if (!pdl) return { data: null, skipped: false };
        return {
          data: {
            name: pdl.displayName ?? pdl.name ?? domain,
            industry: pdl.industry ?? "",
            size: pdl.size ?? "",
            employeeCount: pdl.employeeCount ?? 0,
            location: pdl.location?.name ?? "",
            inferredRevenue: pdl.inferredRevenue ?? null,
            tags: pdl.tags ?? [],
          },
          skipped: false,
        };
      } catch (err) {
        console.error("[research/company] PDL failed:", err);
        return { data: null, skipped: false };
      }
    });

    // Step 3: Scrape website (if no cached raw data)
    const scrapeResult = await step.run("scrape-website", async () => {
      if (cached.enrichCacheData) {
        return {
          rawContent: (cached.enrichCacheData.groundTruth as string) ?? "",
          extracted: (cached.enrichCacheData.extracted as Record<string, unknown>) ?? {},
          skipped: true,
        };
      }
      try {
        const jina = await scrapeFirmWebsite(`https://${domain}`);
        if (!jina) return { rawContent: "", extracted: {}, skipped: false };
        return {
          rawContent: jina.rawContent ?? "",
          extracted: {
            clients: jina.extracted.clients ?? [],
            services: jina.extracted.services ?? [],
            aboutPitch: jina.extracted.aboutPitch ?? "",
            teamMembers: jina.extracted.teamMembers ?? [],
          },
          skipped: false,
        };
      } catch (err) {
        console.error("[research/company] Jina scrape failed:", err);
        return { rawContent: "", extracted: {}, skipped: false };
      }
    });

    // Step 4: Classify
    const classification = await step.run("classify", async () => {
      if (cached.enrichCacheData?.classification) {
        const cls = cached.enrichCacheData.classification as Record<string, unknown>;
        return {
          categories: (cls.categories as string[]) ?? [],
          skills: (cls.skills as string[]) ?? [],
          industries: (cls.industries as string[]) ?? [],
          markets: (cls.markets as string[]) ?? [],
        };
      }

      const contentForClassify = scrapeResult.rawContent || (pdlResult.data ? JSON.stringify(pdlResult.data) : "");
      if (!contentForClassify) {
        return { categories: [], skills: [], industries: [], markets: [] };
      }

      try {
        const cls = await classifyFirm({
          rawContent: contentForClassify.slice(0, 10000),
          pdlSummary: pdlResult.data
            ? `${(pdlResult.data.name as string) ?? ""} - ${(pdlResult.data.industry as string) ?? ""} - ${(pdlResult.data.size as string) ?? ""}`
            : undefined,
          services: (scrapeResult.extracted.services as string[]) ?? [],
          aboutPitch: (scrapeResult.extracted.aboutPitch as string) ?? "",
        });
        return {
          categories: cls.categories ?? [],
          skills: cls.skills ?? [],
          industries: cls.industries ?? [],
          markets: cls.markets ?? [],
        };
      } catch (err) {
        console.error("[research/company] Classification failed:", err);
        return { categories: [], skills: [], industries: [], markets: [] };
      }
    });

    // Step 5: Generate strategic intelligence
    const intelligence = await step.run("generate-intelligence", async () => {
      const companyName = (pdlResult.data?.name as string) ?? domain;
      const pdlSummary = pdlResult.data
        ? `Name: ${companyName}\nIndustry: ${(pdlResult.data.industry as string) ?? "N/A"}\nSize: ${(pdlResult.data.size as string) ?? "N/A"}\nEmployees: ${(pdlResult.data.employeeCount as number) ?? "N/A"}\nLocation: ${(pdlResult.data.location as string) ?? "N/A"}\nRevenue: ${(pdlResult.data.inferredRevenue as string) ?? "N/A"}`
        : "";

      const result = await generateObject({
        model: openrouter.chat("google/gemini-2.0-flash-001"),
        prompt: `You are a strategic company researcher. Generate insight-driven research about this company so a professional services firm can understand the prospect and craft compelling outreach.

## COMPANY: ${companyName}

## DATA GATHERED
${pdlSummary ? `### Firmographic Data\n${pdlSummary}\n` : ""}
${(scrapeResult.extracted.aboutPitch as string) ? `### About / Pitch\n${scrapeResult.extracted.aboutPitch as string}\n` : ""}
${(scrapeResult.extracted.services as string[])?.length > 0 ? `### Services/Products\n${(scrapeResult.extracted.services as string[]).join(", ")}\n` : ""}
${scrapeResult.rawContent ? `### Website Content (excerpts)\n${scrapeResult.rawContent.slice(0, 8000)}\n` : ""}

## INSTRUCTIONS
Generate all 11 fields below. Be specific and insight-driven — not generic summaries.
Ground your analysis in the data above. If data is thin, be honest about confidence.`,
        schema: z.object({
          executiveSummary: z.string().describe("2 short paragraphs: what they do, why they exist, strategic priorities"),
          interestingHighlights: z.array(z.object({
            title: z.string(),
            description: z.string(),
          })).describe("2-3 unique or notable facts that stand out"),
          offeringSummary: z.string().describe("What they sell and how they position it"),
          industryInsight: z.string().describe("Industry trends and how they fit in"),
          stageInsight: z.string().describe("One of: Startup/Early | Growth | Expansion | Mature | Decline — based on team size + age"),
          customerInsight: z.string().describe("Target buyer personas or customer types"),
          buyingIntentInsight: z.string().describe("Likely reasons people buy from them, key needs they solve"),
          growthChallenges: z.string().describe("What is likely holding them back"),
          keyMarkets: z.string().describe("Geographic focus or expansion ambitions"),
          competitorsInsight: z.string().describe("Main competitors or substitutes"),
          industryTrends: z.string().describe("One paragraph weaving their strategic context into market-wide patterns"),
        }),
        maxOutputTokens: 2048,
      });

      return result.object;
    });

    // Step 6: Persist to DB + enrichmentCache
    await step.run("persist-research", async () => {
      const companyName = (pdlResult.data?.name as string) ?? domain;
      const id = domainId(domain);

      // Persist to company_research table
      await db
        .insert(companyResearch)
        .values({
          id,
          domain,
          companyName,
          companyNameNormalized: normalizeName(companyName),
          executiveSummary: intelligence.executiveSummary,
          interestingHighlights: JSON.stringify(intelligence.interestingHighlights),
          offeringSummary: intelligence.offeringSummary,
          industryInsight: intelligence.industryInsight,
          stageInsight: intelligence.stageInsight,
          customerInsight: intelligence.customerInsight,
          buyingIntentInsight: intelligence.buyingIntentInsight,
          growthChallenges: intelligence.growthChallenges,
          keyMarkets: intelligence.keyMarkets,
          competitorsInsight: intelligence.competitorsInsight,
          industryTrends: intelligence.industryTrends,
          graphNodeId: domainId(domain),
          researchSource: "ossy",
        })
        .onConflictDoUpdate({
          target: companyResearch.domain,
          set: {
            companyName,
            companyNameNormalized: normalizeName(companyName),
            executiveSummary: intelligence.executiveSummary,
            interestingHighlights: JSON.stringify(intelligence.interestingHighlights),
            offeringSummary: intelligence.offeringSummary,
            industryInsight: intelligence.industryInsight,
            stageInsight: intelligence.stageInsight,
            customerInsight: intelligence.customerInsight,
            buyingIntentInsight: intelligence.buyingIntentInsight,
            growthChallenges: intelligence.growthChallenges,
            keyMarkets: intelligence.keyMarkets,
            competitorsInsight: intelligence.competitorsInsight,
            industryTrends: intelligence.industryTrends,
            graphNodeId: domainId(domain),
            updatedAt: new Date(),
          },
        });

      // Cache raw enrichment data (if not already cached)
      if (!cached.enrichCacheData) {
        const cacheBlob = {
          domain,
          companyData: pdlResult.data,
          groundTruth: scrapeResult.rawContent,
          extracted: scrapeResult.extracted,
          classification,
          success: true,
        };
        await db
          .insert(enrichmentCache)
          .values({
            id: domain,
            domain,
            firmName: companyName,
            enrichmentData: cacheBlob,
            hasPdl: !!pdlResult.data && !pdlResult.skipped,
            hasScrape: !!scrapeResult.rawContent && !scrapeResult.skipped,
            hasClassify: classification.categories.length > 0,
          })
          .onConflictDoUpdate({
            target: enrichmentCache.domain,
            set: {
              enrichmentData: cacheBlob,
              hasPdl: !!pdlResult.data && !pdlResult.skipped,
              hasScrape: !!scrapeResult.rawContent && !scrapeResult.skipped,
              hasClassify: classification.categories.length > 0,
              updatedAt: new Date(),
            },
          });
      }
    });

    // Step 7: Write to Neo4j graph
    await step.run("write-graph", async () => {
      const companyName = (pdlResult.data?.name as string) ?? domain;
      await writeResearchedCompanyToGraph({
        id: domainId(domain),
        name: companyName,
        domain,
        entityType: "prospect",
        industry: (pdlResult.data?.industry as string) ?? undefined,
        employeeCount: (pdlResult.data?.employeeCount as number) ?? undefined,
        location: (pdlResult.data?.location as string) ?? undefined,
        categories: classification.categories,
        skills: classification.skills,
        industries: classification.industries,
        markets: classification.markets,
        executiveSummary: intelligence.executiveSummary,
        offeringSummary: intelligence.offeringSummary,
        customerInsight: intelligence.customerInsight,
        stageInsight: intelligence.stageInsight,
        competitorsInsight: intelligence.competitorsInsight,
        keyMarkets: intelligence.keyMarkets,
      });
    });

    // Auto-trigger fit assessment
    if (firmId) {
      await step.sendEvent("trigger-fit-assessment", {
        name: "research/assess-fit",
        data: { domain, firmId, userId, pitchContext, conversationId },
      });
    }

    return { status: "completed", domain };
  }
);
