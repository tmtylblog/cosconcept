/**
 * Query Parser — Natural Language → Structured Search Filters
 *
 * Converts user search queries like "I need a Shopify partner in APAC"
 * into structured filters: { skills: ["Shopify"], markets: ["Asia Pacific"] }
 *
 * Uses Gemini Flash for fast, cheap parsing (~$0.0001 per query).
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import {
  getSkillL2Names,
  getFirmCategories,
  getMarkets,
} from "@/lib/taxonomy";
import type { SearchFilters } from "./types";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Parse a natural language search query into structured filters.
 *
 * The AI maps user intent to our taxonomy:
 * - Skills → L2 skill names (247 items)
 * - Categories → 30 firm categories
 * - Industries → free-form industry names
 * - Markets → country/region names
 */
export async function parseSearchQuery(
  rawQuery: string
): Promise<SearchFilters> {
  const skillNames = getSkillL2Names();
  const categories = getFirmCategories().map((c) => c.name);
  const markets = getMarkets().slice(0, 80); // Top markets for prompt context

  try {
    const parseStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Parse this search query into structured filters for a professional services partner search.

QUERY: "${rawQuery}"

## AVAILABLE TAXONOMY

### Firm Categories (select from these 30)
${categories.join(", ")}

### L2 Skills (select from these ~247)
${skillNames.slice(0, 100).join(", ")}...
(more available: ${skillNames.length} total)

### Markets (countries/regions)
${markets.join(", ")}...

## INSTRUCTIONS
Extract structured filters from the query. Map user intent to our taxonomy.
- For skills: map to the closest L2 skill names
- For categories: map to the closest firm categories
- For markets: map to specific countries or regions
- For industries: use standard industry names
- For services: extract 1-3 word service phrases (e.g. "brand strategy", "SEO", "content marketing", "web development"). These are partial-matched against service listings so keep them short and specific.
- For size: use "micro" (<10), "small" (10-50), "medium" (50-200), "large" (200+)
- For entityType: detect if the user is explicitly looking for a specific type:
  - "firm" — mentions agency, firm, company, consultancy, partner
  - "expert" — mentions expert, consultant, specialist, freelancer, fractional, person, individual
  - "case_study" — mentions case study, example, project, portfolio, proof, success story
  - null — no strong signal (search all types)

Only extract what the query explicitly or strongly implies. Don't over-extract.`,
      schema: z.object({
        skills: z
          .array(z.string())
          .describe("L2 skill names from taxonomy that match the query"),
        categories: z
          .array(z.string())
          .describe("Firm categories that match the query"),
        industries: z
          .array(z.string())
          .describe("Industry verticals mentioned or implied"),
        markets: z
          .array(z.string())
          .describe("Geographic markets or regions"),
        services: z
          .array(z.string())
          .describe("Specific service keywords the user is looking for (1-3 word phrases, e.g. 'brand strategy', 'SEO', 'content marketing', 'web development', 'digital transformation')"),
        sizeBand: z
          .string()
          .optional()
          .describe("Firm size: micro, small, medium, large"),
        entityType: z
          .enum(["firm", "expert", "case_study"])
          .optional()
          .describe("Entity type the user is looking for, if explicitly stated"),
      }),
      maxOutputTokens: 256,
    });

    const parseDuration = Date.now() - parseStart;

    // Log AI usage
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "matching",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: parseDuration,
    });

    // Validate against actual taxonomy
    const validSkills = new Set(skillNames.map((s) => s.toLowerCase()));
    const validCategories = new Set(categories.map((c) => c.toLowerCase()));
    const validMarkets = new Set(getMarkets().map((m) => m.toLowerCase()));

    return {
      skills: result.object.skills.filter((s) =>
        validSkills.has(s.toLowerCase())
      ),
      categories: result.object.categories.filter((c) =>
        validCategories.has(c.toLowerCase())
      ),
      industries: result.object.industries,
      markets: result.object.markets.filter((m) =>
        validMarkets.has(m.toLowerCase())
      ),
      // Services are free-form — no taxonomy validation, matched via CONTAINS in Neo4j
      services: result.object.services ?? [],
      sizeBand: result.object.sizeBand,
      entityType: result.object.entityType,
    };
  } catch (err) {
    console.error("[QueryParser] Parse failed:", err);
    // Return empty filters on failure — will match broadly
    return {};
  }
}
