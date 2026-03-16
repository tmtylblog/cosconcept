/**
 * AI-First Client Extraction.
 *
 * Combines all available website content and makes a single AI call
 * to extract client company names. Replaces the previous multi-signal
 * regex/heuristic approach that was brittle and missed many clients.
 *
 * Modeled after the case study extractor: hand content to AI, validate output.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ──────────────────────────────────────────────────

export type ClientSource =
  | "case_study_ai"
  | "case_study_title"
  | "client_section"
  | "logo_alt"
  | "testimonial"
  | "ai_extraction";

export interface ClientSignal {
  name: string;
  confidence: number;
  source: ClientSource;
}

const MAX_CLIENTS = 30;

// Words that are never real client names
const BLOCKLIST =
  /^(Read|Learn|View|See|Get|Our|The|About|Click|Download|Home|Menu|Contact|Blog|Login|Sign|Back|Next|Previous|Footer|Header|Navigation|Skip|Search|Close|Open|Show|Hide|Toggle|Submit|Cancel|Accept|Reject|Dismiss|Loading|Chapter|Section|Page|Slide|Solutions?|Services?|Products?|Industries?|Resources?|Company|Capabilities|Insights?|Platform|Overview|Features?|Pricing|Careers?|News|Events?|Partners?|Support|Documentation|FAQ|Help|Legal|Privacy|Terms|Sitemap|Copyright|Descriptions?|Brand|Marketing|Experience|Commerce|Sales|Technology|Digital|Strategy|Creative|Design|Analytics|Consulting|Advisory|Management|Operations|Engineering|Data|Media|Content|Growth|Innovation|Transformation|Performance|Leadership|Culture|Talent|People|Finance|Sustainability|Healthcare|Education|Retail|Automotive|Energy|Real Estate|Government|Nonprofit|Image|Logo|Banner|Icon|Arrow|Button|Link|Photo|Picture|Graphic|Illustration|Screenshot|Thumbnail)\b/i;

// ─── Main Entry Point ────────────────────────────────────────

export async function extractClientsWithConfidence(params: {
  homepageContent: string;
  evidencePages: {
    category: string;
    content: string;
    url: string;
    title: string;
  }[];
  caseStudyPages: {
    content: string;
    url: string;
    title: string;
  }[];
  /**
   * Client names already extracted by the case study extractor.
   * When provided, these are added directly at 0.9 confidence
   * without AI re-extraction.
   */
  preSeededClients?: string[];
}): Promise<{ clients: string[]; clientSignals: ClientSignal[] }> {
  const allSignals: ClientSignal[] = [];

  // Add pre-seeded signals from the case study extractor (no AI call needed)
  const preSeededSet = new Set<string>();
  for (const name of params.preSeededClients ?? []) {
    if (name && !isBlocklisted(name)) {
      const cleaned = cleanName(name);
      preSeededSet.add(cleaned.toLowerCase());
      allSignals.push({ name: cleaned, confidence: 0.9, source: "case_study_ai" });
    }
  }

  // Combine all available content for a single AI extraction call
  const contentParts: string[] = [];

  if (params.homepageContent) {
    contentParts.push(`=== HOMEPAGE ===\n${params.homepageContent.slice(0, 5000)}`);
  }

  for (const page of params.evidencePages) {
    contentParts.push(
      `=== ${page.category.toUpperCase()} PAGE: ${page.title} (${page.url}) ===\n${page.content.slice(0, 3000)}`
    );
  }

  for (const page of params.caseStudyPages) {
    contentParts.push(
      `=== CASE STUDY: ${page.title} (${page.url}) ===\n${page.content.slice(0, 3000)}`
    );
  }

  const combinedContent = contentParts.join("\n\n");

  // Only call AI if we have content to analyze
  if (combinedContent.length > 100) {
    const aiClients = await extractClientsWithAI(
      combinedContent.slice(0, 25000)
    );

    for (const client of aiClients) {
      const cleaned = cleanName(client.name);
      if (!cleaned || isBlocklisted(cleaned)) continue;
      if (cleaned.length < 2 || cleaned.length > 80) continue;

      // Skip if already covered by pre-seeded clients
      if (preSeededSet.has(cleaned.toLowerCase())) continue;

      allSignals.push({
        name: cleaned,
        confidence: 0.85,
        source: "ai_extraction",
      });
    }
  }

  // Deduplicate by normalized key, keeping the highest confidence version
  const deduped = deduplicateSignals(allSignals);

  // Sort by confidence DESC, cap at MAX_CLIENTS
  const final = deduped
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CLIENTS);

  return {
    clients: final.map((s) => s.name),
    clientSignals: final,
  };
}

// ─── AI Extraction ──────────────────────────────────────────

async function extractClientsWithAI(
  content: string
): Promise<{ name: string; evidence: string }[]> {
  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are extracting CLIENT COMPANY NAMES from a professional services firm's website.
Clients are companies that HIRED this firm to do work for them.

Look for:
- Companies mentioned in case studies as the client
- Logo sections ("Our Clients", "Trusted By", etc.)
- Testimonial attributions (e.g. "— Name, VP at CompanyName")
- "We worked with X" or "Featured client: X" patterns
- Any other context clues that identify a client relationship

Do NOT include:
- The firm itself
- Technology vendors/tools (AWS, Salesforce, HubSpot, WordPress, Shopify, etc.) unless they were clearly a CLIENT that hired this firm
- Generic industry terms
- Navigation items, page titles, or UI elements
- Partner companies or integration partners (unless they were also a client)

Return ONLY real company names. If unsure, omit rather than guess.

WEBSITE CONTENT:
${content}`,
      schema: z.object({
        clients: z.array(
          z.object({
            name: z.string().describe("The client company name"),
            evidence: z
              .string()
              .describe(
                "Brief note about where/how the name was found (e.g. 'logo section', 'case study', 'testimonial')"
              ),
          })
        ),
      }),
      maxOutputTokens: 2048,
    });

    return result.object.clients;
  } catch (err) {
    console.warn("[ClientExtractor] AI extraction failed:", err);
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────

/** Deduplicate signals by normalized key, keeping the highest confidence version */
function deduplicateSignals(signals: ClientSignal[]): ClientSignal[] {
  const groups = new Map<string, ClientSignal>();
  for (const signal of signals) {
    const key = normalizeKey(signal.name);
    if (!key) continue;
    const existing = groups.get(key);
    if (!existing || signal.confidence > existing.confidence) {
      // Keep the longer (more complete) name at the higher confidence
      const bestName =
        existing && existing.name.length > signal.name.length
          ? existing.name
          : signal.name;
      groups.set(key, {
        name: bestName,
        confidence: Math.max(signal.confidence, existing?.confidence ?? 0),
        source: signal.confidence >= (existing?.confidence ?? 0)
          ? signal.source
          : existing!.source,
      });
    }
  }
  return [...groups.values()];
}

/** Normalize a client name for deduplication */
function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/\s*(inc\.?|llc|ltd\.?|co\.?|corp\.?|company|group|plc)\s*$/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean up a raw extracted name */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/\*+/g, "") // Remove any remaining markdown bold
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/** Check if a raw string is blocklisted */
function isBlocklisted(name: string): boolean {
  return BLOCKLIST.test(name.trim());
}
