/**
 * AI Firm Classifier — classifies firms against the actual COS taxonomy.
 *
 * Takes raw scraped content (from Jina) + firmographic data (from PDL)
 * and classifies the firm against:
 *
 * 1. FIRM CATEGORIES — which of the 30 COS categories this firm belongs to
 * 2. SKILLS — L2-level skills from the 247-item taxonomy
 * 3. INDUSTRIES — vertical markets the firm serves
 * 4. MARKETS — countries/regions they operate in
 * 5. LANGUAGES — business languages they work in
 *
 * Uses a lightweight model (Gemini Flash) for cost efficiency.
 * This is a classification task, not a reasoning task.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import {
  getFirmCategories,
  getSkillL2Names,
  getMarkets,
  getLanguages,
} from "@/lib/taxonomy";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Classification result ──────────────────────────────

export interface FirmClassification {
  /** Primary firm categories (from 30 COS categories) */
  categories: string[];
  /** L2-level skills matched from 247-item taxonomy */
  skills: string[];
  /** Industries/verticals the firm serves */
  industries: string[];
  /** Countries/regions the firm operates in */
  markets: string[];
  /** Business languages */
  languages: string[];
  /** AI confidence score (0-1) */
  confidence: number;
}

// ─── Classifier ─────────────────────────────────────────

/**
 * Classify a firm against the COS taxonomy using AI.
 *
 * @param rawContent - Combined scraped website content from Jina
 * @param pdlSummary - PDL firmographic summary (if available)
 * @param services - Extracted services list
 * @param aboutPitch - Extracted about/pitch text
 */
export async function classifyFirm(params: {
  rawContent: string;
  pdlSummary?: string;
  services?: string[];
  aboutPitch?: string;
}): Promise<FirmClassification> {
  const categories = getFirmCategories();
  const skillL2Names = getSkillL2Names();
  const markets = getMarkets();
  const languages = getLanguages();

  // Build the category reference (name + definition)
  const categoryRef = categories
    .map((c) => `- ${c.name}: ${c.definition}`)
    .join("\n");

  // Use a subset of L2 skills in the prompt to stay within context limits
  // The full list of 247 L2 skills is manageable
  const skillRef = skillL2Names.join(", ");

  // Truncate raw content to prevent token overflow
  const content = params.rawContent.slice(0, 10000);

  const prompt = `You are a firm classification AI for Collective OS, a partnership platform for professional services firms.

Analyze the following firm data and classify it precisely.

## FIRM DATA

### Website Content
${content}

${params.aboutPitch ? `### About / Pitch\n${params.aboutPitch}\n` : ""}
${params.services?.length ? `### Services\n${params.services.join(", ")}\n` : ""}
${params.pdlSummary ? `### Firmographic Data (PDL)\n${params.pdlSummary}\n` : ""}

## CLASSIFICATION TASKS

### 1. Firm Categories
Select ALL that apply from these 30 categories. Most firms fit 1-3 categories.
${categoryRef}

### 2. Skills (L2 Level)
Select the most relevant L2 skills from this taxonomy. Pick 5-15 that best describe the firm's capabilities.
Available L2 skills: ${skillRef}

### 3. Industries
List the specific industries/verticals this firm serves (e.g., "Healthcare", "Financial Services", "E-commerce", "SaaS", "Manufacturing"). Use standard industry names.

### 4. Markets
Select countries and regions where this firm operates or serves clients.
Only select from: ${markets.slice(0, 50).join(", ")}... (all UN countries + regions available)

### 5. Languages
Select business languages this firm works in.
Available: ${languages.slice(0, 30).join(", ")}...

Be precise. Only tag what the evidence supports. Don't guess.`;

  try {
    const classifyStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt,
      schema: z.object({
        categories: z
          .array(z.string())
          .describe("Firm categories from the 30 COS categories"),
        skills: z
          .array(z.string())
          .describe("L2-level skills from the taxonomy"),
        industries: z
          .array(z.string())
          .describe("Industries/verticals the firm serves"),
        markets: z
          .array(z.string())
          .describe("Countries/regions the firm operates in"),
        languages: z
          .array(z.string())
          .describe("Business languages the firm works in"),
        confidence: z
          .number()
          .describe("Confidence score 0-1 based on evidence quality"),
      }),
      maxOutputTokens: 1024,
    });
    const classifyDuration = Date.now() - classifyStart;

    // Log AI usage
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "classification",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: classifyDuration,
    });

    // Validate against our actual taxonomy
    const validCategories = new Set(categories.map((c) => c.name));
    const validSkills = new Set(skillL2Names.map((s) => s.toLowerCase()));
    const validMarkets = new Set(markets.map((m) => m.toLowerCase()));
    const validLanguages = new Set(languages.map((l) => l.toLowerCase()));

    return {
      categories: result.object.categories.filter((c) =>
        validCategories.has(c)
      ),
      skills: result.object.skills.filter((s) =>
        validSkills.has(s.toLowerCase())
      ),
      industries: result.object.industries,
      markets: result.object.markets.filter((m) =>
        validMarkets.has(m.toLowerCase())
      ),
      languages: result.object.languages.filter((l) =>
        validLanguages.has(l.toLowerCase())
      ),
      confidence: Math.min(1, Math.max(0, result.object.confidence)),
    };
  } catch (error) {
    console.error("[AI Classifier] Classification failed:", error);
    // Return empty classification on failure — don't block the pipeline
    return {
      categories: [],
      skills: [],
      industries: [],
      markets: [],
      languages: [],
      confidence: 0,
    };
  }
}
