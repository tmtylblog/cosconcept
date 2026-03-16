/**
 * Client Research — Two-phase company research pipeline.
 *
 * Phase 1: Data gathering (PDL + Jina + AI classification) — reuses existing pipeline
 * Phase 2: Strategic intelligence generation (AI-powered deep analysis)
 *
 * Results persist in three layers:
 * 1. company_research table (structured columns, CORE-syncable)
 * 2. enrichmentCache table (JSONB blob for fast cache hits)
 * 3. Neo4j Company node (taxonomy edges + research properties)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { companyResearch, enrichmentCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enrichCompany } from "./pdl";
import { scrapeFirmWebsite } from "./jina-scraper";
import { classifyFirm } from "./ai-classifier";
import { writeResearchedCompanyToGraph } from "./graph-writer";
import { neo4jRead } from "@/lib/neo4j";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ────────────────────────────────────────────────

export interface CompanyIntelligence {
  executiveSummary: string;
  interestingHighlights: { title: string; description: string }[];
  offeringSummary: string;
  industryInsight: string;
  stageInsight: string;
  customerInsight: string;
  buyingIntentInsight: string;
  growthChallenges: string;
  keyMarkets: string;
  competitorsInsight: string;
  industryTrends: string;
}

export interface ClientResearchData {
  name: string;
  domain: string;
  industry: string;
  size: string;
  employeeCount: number;
  location: string;
  inferredRevenue: string | null;
  tags: string[];
  services: string[];
  aboutPitch: string;
  classification: {
    categories: string[];
    skills: string[];
    industries: string[];
    markets: string[];
  };
  intelligence: CompanyIntelligence;
  fromCache: boolean;
  graphNodeId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Parse input into a domain. Returns null if input is a company name (no TLD).
 */
function domainFromInput(input: string): string | null {
  let d = input.trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//, "");
  // Strip www
  d = d.replace(/^www\./, "");
  // Strip trailing path
  d = d.split("/")[0];
  // If no TLD, it's a company name — return null so the caller can ask the user
  if (!d.includes(".")) {
    return null;
  }
  return d;
}

function normalizeName(name: string): string {
  return name
    .replace(/\s*(Inc\.?|LLC|Corp\.?|Ltd\.?|Co\.?|PLC|GmbH|S\.?A\.?|B\.?V\.?)\s*$/i, "")
    .trim();
}

function domainId(domain: string): string {
  return `cr_${domain.replace(/\./g, "_")}`;
}

// ─── Cache Lookups ────────────────────────────────────────

export async function checkCompanyResearchTable(domain: string): Promise<ClientResearchData | null> {
  try {
    const [row] = await db
      .select()
      .from(companyResearch)
      .where(eq(companyResearch.domain, domain))
      .limit(1);

    if (!row || !row.executiveSummary) return null;

    let highlights: { title: string; description: string }[] = [];
    try {
      highlights = row.interestingHighlights ? JSON.parse(row.interestingHighlights) : [];
    } catch { /* ignore */ }

    return {
      name: row.companyName,
      domain: row.domain,
      industry: "",
      size: "",
      employeeCount: 0,
      location: "",
      inferredRevenue: null,
      tags: [],
      services: [],
      aboutPitch: "",
      classification: { categories: [], skills: [], industries: [], markets: [] },
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
    };
  } catch {
    return null;
  }
}

export async function checkEnrichmentCache(domain: string): Promise<Record<string, unknown> | null> {
  try {
    const [row] = await db
      .select({ enrichmentData: enrichmentCache.enrichmentData })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);

    return (row?.enrichmentData as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function checkNeo4jCompany(domain: string): Promise<{ id: string; name: string } | null> {
  try {
    interface Row { id: string; name: string }
    const rows = await neo4jRead<Row>(
      `MATCH (c:Company {domain: $domain})
       WHERE c.enrichmentStatus = "researched"
       RETURN c.id AS id, c.name AS name
       LIMIT 1`,
      { domain }
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Phase 2: Strategic Intelligence ──────────────────────

async function generateIntelligence(
  rawContent: string,
  companyName: string,
  pdlSummary: string,
  services: string[],
  aboutPitch: string
): Promise<CompanyIntelligence> {
  const result = await generateObject({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    prompt: `You are a strategic company researcher. Generate insight-driven research about this company so a professional services firm can understand the prospect and craft compelling outreach.

## COMPANY: ${companyName}

## DATA GATHERED
${pdlSummary ? `### Firmographic Data\n${pdlSummary}\n` : ""}
${aboutPitch ? `### About / Pitch\n${aboutPitch}\n` : ""}
${services.length > 0 ? `### Services/Products\n${services.join(", ")}\n` : ""}
${rawContent ? `### Website Content (excerpts)\n${rawContent.slice(0, 8000)}\n` : ""}

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
}

// ─── Persistence ──────────────────────────────────────────

async function persistResearch(
  domain: string,
  name: string,
  intelligence: CompanyIntelligence,
  classification: { categories: string[]; skills: string[]; industries: string[]; markets: string[] },
  pdlData: { industry?: string; employeeCount?: number; location?: string } | null,
  graphNodeId: string | null
): Promise<void> {
  const id = domainId(domain);

  try {
    await db
      .insert(companyResearch)
      .values({
        id,
        domain,
        companyName: name,
        companyNameNormalized: normalizeName(name),
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
        graphNodeId,
        researchSource: "ossy",
      })
      .onConflictDoUpdate({
        target: companyResearch.domain,
        set: {
          companyName: name,
          companyNameNormalized: normalizeName(name),
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
          graphNodeId,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[ClientResearch] Failed to persist to company_research:", err);
  }
}

// ─── Main Research Function ───────────────────────────────

/**
 * Research any company. Cache-first with three-layer persistence.
 *
 * Lookup order: company_research table → enrichmentCache → Neo4j → fresh research
 * On cache miss: PDL + Jina + classify → AI intelligence → persist to all 3 layers
 */
export async function researchCompany(
  domainOrName: string
): Promise<ClientResearchData | { needsDomain: true; companyName: string }> {
  const domain = domainFromInput(domainOrName);

  if (!domain) {
    console.warn(`[ClientResearch] No domain detected for "${domainOrName}" — asking user to confirm`);
    return { needsDomain: true, companyName: domainOrName.trim() };
  }

  console.warn(`[ClientResearch] Starting research for: ${domainOrName} → domain: ${domain}`);

  // 1. Check company_research table (fastest, richest)
  const cached = await checkCompanyResearchTable(domain);
  if (cached) {
    console.warn(`[ClientResearch] Cache HIT in company_research table for ${domain}`);
    // Enrich with enrichmentCache data if available
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
    return cached;
  }

  // 2. Check enrichmentCache (has raw data but no intelligence)
  const enrichCacheData = await checkEnrichmentCache(domain);

  // 3. Check Neo4j
  const neo4jNode = await checkNeo4jCompany(domain);

  // 4. Gather raw data (cache or fresh)
  let companyData: Record<string, unknown> | null = null;
  let rawContent = "";
  let extracted: Record<string, unknown> = {};
  let classification: { categories: string[]; skills: string[]; industries: string[]; markets: string[] } = {
    categories: [], skills: [], industries: [], markets: [],
  };

  if (enrichCacheData) {
    console.warn(`[ClientResearch] Found raw data in enrichmentCache for ${domain}, skipping paid APIs`);
    // Use cached raw data, skip paid APIs
    companyData = (enrichCacheData.companyData as Record<string, unknown>) ?? null;
    rawContent = (enrichCacheData.groundTruth as string) ?? "";
    extracted = (enrichCacheData.extracted as Record<string, unknown>) ?? {};
    const cls = enrichCacheData.classification as Record<string, unknown> | undefined;
    classification = {
      categories: (cls?.categories as string[]) ?? [],
      skills: (cls?.skills as string[]) ?? [],
      industries: (cls?.industries as string[]) ?? [],
      markets: (cls?.markets as string[]) ?? [],
    };
  } else {
    // Phase 1: Fresh data gathering
    console.warn(`[ClientResearch] Cache MISS — running PDL + Jina for ${domain}`);
    const [pdlResult, jinaResult] = await Promise.allSettled([
      enrichCompany({ website: domain }),
      scrapeFirmWebsite(`https://${domain}`),
    ]);

    const pdl = pdlResult.status === "fulfilled" ? pdlResult.value : null;
    const jina = jinaResult.status === "fulfilled" ? jinaResult.value : null;

    if (pdl) {
      companyData = {
        name: pdl.displayName ?? pdl.name ?? domain,
        industry: pdl.industry ?? "",
        size: pdl.size ?? "",
        employeeCount: pdl.employeeCount ?? 0,
        location: pdl.location?.name ?? "",
        inferredRevenue: pdl.inferredRevenue ?? null,
        tags: pdl.tags ?? [],
      };
    }

    if (jina) {
      rawContent = jina.rawContent ?? "";
      extracted = {
        clients: jina.extracted.clients ?? [],
        services: jina.extracted.services ?? [],
        aboutPitch: jina.extracted.aboutPitch ?? "",
        teamMembers: jina.extracted.teamMembers ?? [],
      };
    }

    // Classification
    const contentForClassify = rawContent || (companyData ? JSON.stringify(companyData) : "");
    if (contentForClassify) {
      try {
        const cls = await classifyFirm({
          rawContent: contentForClassify.slice(0, 10000),
          pdlSummary: companyData ? `${(companyData.name as string) ?? ""} - ${(companyData.industry as string) ?? ""} - ${(companyData.size as string) ?? ""}` : undefined,
          services: (extracted.services as string[]) ?? [],
          aboutPitch: (extracted.aboutPitch as string) ?? "",
        });
        classification = {
          categories: cls.categories ?? [],
          skills: cls.skills ?? [],
          industries: cls.industries ?? [],
          markets: cls.markets ?? [],
        };
      } catch (err) {
        console.error("[ClientResearch] Classification failed:", err);
      }
    }

    // Cache the raw enrichment data
    try {
      const cacheBlob = {
        domain,
        companyData,
        groundTruth: rawContent,
        extracted,
        classification,
        success: true,
      };
      await db
        .insert(enrichmentCache)
        .values({
          id: domain,
          domain,
          firmName: (companyData?.name as string) ?? domain,
          enrichmentData: cacheBlob,
          hasPdl: !!pdl,
          hasScrape: !!jina,
          hasClassify: classification.categories.length > 0,
        })
        .onConflictDoUpdate({
          target: enrichmentCache.domain,
          set: {
            enrichmentData: cacheBlob,
            hasPdl: !!pdl,
            hasScrape: !!jina,
            hasClassify: classification.categories.length > 0,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error("[ClientResearch] Failed to cache enrichment:", err);
    }
  }

  // Phase 2: Generate strategic intelligence
  console.warn(`[ClientResearch] Phase 2: Generating intelligence for ${domain}`);
  const companyName = (companyData?.name as string) ?? domain;
  const pdlSummary = companyData
    ? `Name: ${companyName}\nIndustry: ${(companyData.industry as string) ?? "N/A"}\nSize: ${(companyData.size as string) ?? "N/A"}\nEmployees: ${(companyData.employeeCount as number) ?? "N/A"}\nLocation: ${(companyData.location as string) ?? "N/A"}\nRevenue: ${(companyData.inferredRevenue as string) ?? "N/A"}`
    : "";

  const intelligence = await generateIntelligence(
    rawContent,
    companyName,
    pdlSummary,
    (extracted.services as string[]) ?? [],
    (extracted.aboutPitch as string) ?? ""
  );

  // Persist to Neo4j + company_research table (fire-and-forget — don't block response)
  const graphNodeId = neo4jNode?.id ?? domainId(domain);
  const persistPromise = (async () => {
    try {
      await writeResearchedCompanyToGraph({
        id: domainId(domain),
        name: companyName,
        domain,
        entityType: "prospect",
        industry: (companyData?.industry as string) ?? undefined,
        employeeCount: (companyData?.employeeCount as number) ?? undefined,
        location: (companyData?.location as string) ?? undefined,
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
    } catch (err) {
      console.error("[ClientResearch] Graph write failed:", err);
    }
    await persistResearch(
      domain,
      companyName,
      intelligence,
      classification,
      companyData ? {
        industry: (companyData.industry as string) ?? undefined,
        employeeCount: (companyData.employeeCount as number) ?? undefined,
        location: (companyData.location as string) ?? undefined,
      } : null,
      graphNodeId
    );
  })();
  // Don't await — let it finish in background
  persistPromise.catch((err) => console.error("[ClientResearch] Background persist failed:", err));

  return {
    name: companyName,
    domain,
    industry: (companyData?.industry as string) ?? "",
    size: (companyData?.size as string) ?? "",
    employeeCount: (companyData?.employeeCount as number) ?? 0,
    location: (companyData?.location as string) ?? "",
    inferredRevenue: (companyData?.inferredRevenue as string) ?? null,
    tags: (companyData?.tags as string[]) ?? [],
    services: (extracted.services as string[]) ?? [],
    aboutPitch: (extracted.aboutPitch as string) ?? "",
    classification,
    intelligence,
    fromCache: false,
    graphNodeId,
  };
}
