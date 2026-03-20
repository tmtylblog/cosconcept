/**
 * Company Enrichment Orchestrator
 *
 * Provider chain: PDL (primary) → Jina+AI (fallback) → null
 *
 * PDL is tried first for structured firmographic data. Falls back to
 * Jina website scrape + Gemini Flash extraction when:
 * - PDL returns 404 (not found)
 * - PDL returns 402 (no credits)
 * - PDL_API_KEY is not configured
 */

import type { PdlCompany } from "./pdl";
import { enrichCompany as pdlEnrichCompany } from "./pdl";
import { scrapeFirmWebsite } from "./jina-scraper";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";

export interface CompanyEnrichmentResult {
  company: PdlCompany | null;
  provider: "pdl" | "jina+ai" | null;
  fallbackReason?: string;
}

/**
 * Enrich a company with automatic provider fallback.
 *
 * Chain: PDL → Jina scrape + Gemini Flash extraction → null
 */
export async function enrichCompanyWithFallback(params: {
  website?: string;
  name?: string;
  profile?: string;
}): Promise<CompanyEnrichmentResult> {
  // Try PDL first
  if (process.env.PDL_API_KEY) {
    try {
      const company = await pdlEnrichCompany(params);
      if (company) {
        console.log(`[CompanyEnrich] PDL hit: ${company.displayName}`);
        return { company, provider: "pdl" };
      }
      // 404 — not found in PDL, try Jina+AI
      console.log(`[CompanyEnrich] PDL miss, falling back to Jina+AI`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("402")) {
        console.warn(`[CompanyEnrich] PDL credits exhausted (402), falling back to Jina+AI`);
        return tryJinaAi(params, "pdl_no_credits");
      }
      console.error(`[CompanyEnrich] PDL error, falling back to Jina+AI:`, err);
    }

    return tryJinaAi(params, "pdl_not_found");
  }

  // PDL not configured — go straight to Jina+AI
  return tryJinaAi(params, "pdl_not_configured");
}

async function tryJinaAi(
  params: {
    website?: string;
    name?: string;
    profile?: string;
  },
  fallbackReason: string
): Promise<CompanyEnrichmentResult> {
  const website = params.website;
  if (!website) {
    // Jina needs a URL to scrape — can't work with just a name
    return { company: null, provider: null, fallbackReason };
  }

  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const jina = await scrapeFirmWebsite(url);

    if (!jina || !jina.rawContent) {
      return { company: null, provider: null, fallbackReason: "jina_scrape_empty" };
    }

    // Use Gemini Flash to extract structured company data from the scraped content
    const company = await extractCompanyFromContent(
      jina.rawContent,
      jina.extracted.aboutPitch ?? "",
      website
    );

    if (company) {
      console.log(`[CompanyEnrich] Jina+AI hit: ${company.displayName}`);
      return { company, provider: "jina+ai", fallbackReason };
    }

    return { company: null, provider: null, fallbackReason: "jina_ai_extraction_failed" };
  } catch (err) {
    console.error(`[CompanyEnrich] Jina+AI fallback failed:`, err);
    return { company: null, provider: null, fallbackReason: "jina_ai_error" };
  }
}

/**
 * Extract structured company data from scraped website content using Gemini Flash.
 * Returns a PdlCompany-shaped object with what can be determined from the content.
 */
async function extractCompanyFromContent(
  rawContent: string,
  aboutPitch: string,
  website: string
): Promise<PdlCompany | null> {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  try {
    const startMs = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Extract structured company information from this website content.

## WEBSITE: ${website}

## CONTENT (excerpts)
${rawContent.slice(0, 6000)}

${aboutPitch ? `## ABOUT\n${aboutPitch}` : ""}

Extract what you can determine. Set fields to null/empty if not found.`,
      schema: z.object({
        name: z.string().describe("Company name"),
        industry: z.string().describe("Primary industry").default(""),
        size: z.string().describe("Size range: '1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'").default(""),
        summary: z.string().describe("One-line company summary").default(""),
        headline: z.string().describe("Company tagline or headline").default(""),
        location: z.string().nullable().describe("HQ city/country").default(null),
        founded: z.number().nullable().describe("Year founded, if mentioned").default(null),
      }),
      maxOutputTokens: 512,
    });

    logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "enrichment",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    const data = result.object;

    // Construct a PdlCompany-compatible object
    // Many fields will be null/empty since Jina+AI can't determine them
    const domain = website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    return {
      id: `jina_${domain.replace(/\./g, "_")}`,
      name: data.name || domain,
      displayName: data.name || domain,
      website: domain,
      industry: data.industry,
      size: data.size,
      employeeCount: 0, // Can't determine from scrape
      employeeCountByCountry: {},
      founded: data.founded,
      summary: data.summary,
      headline: data.headline,
      tags: [],
      location: data.location
        ? {
            name: data.location,
            locality: "",
            region: "",
            country: "",
            continent: "",
          }
        : null,
      linkedinUrl: null,
      linkedinSlug: null,
      facebookUrl: null,
      twitterUrl: null,
      totalFundingRaised: null,
      latestFundingStage: null,
      lastFundingDate: null,
      numberOfFundingRounds: null,
      inferredRevenue: null,
      type: null,
      likelihood: 0,
    };
  } catch (err) {
    console.error("[CompanyEnrich] AI extraction failed:", err);
    return null;
  }
}
