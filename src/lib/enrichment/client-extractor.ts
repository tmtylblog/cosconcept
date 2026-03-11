/**
 * Smart Multi-Signal Client Extraction with Confidence Scoring.
 *
 * Instead of dumb regex on full page content, this module uses
 * multiple signal sources — each with a confidence weight — and
 * only returns clients that pass a confidence threshold.
 *
 * Signal sources (ranked by reliability):
 * 1. Case study AI extraction (0.9)  — AI reads case study content
 * 2. Client section headers (0.8)    — names under "Our Clients" / "Trusted By"
 * 3. Logo alt text (0.75)            — ![CompanyName](logo.png) in client sections
 * 4. Testimonial attribution (0.65)  — "— Name, VP at CompanyName"
 * 5. Case study title parsing (0.6)  — heuristic extraction from titles
 *
 * Cross-validation: same name from 2+ sources gets +0.1 boost per extra source.
 * Threshold: only return clients with confidence >= 0.5.
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
  | "testimonial";

export interface ClientSignal {
  name: string;
  confidence: number;
  source: ClientSource;
}

const CONFIDENCE_THRESHOLD = 0.5;
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
   * When provided, the duplicate AI call on case study pages is skipped —
   * these names are added directly as case_study_ai signals at 0.9 confidence.
   */
  preSeededClients?: string[];
}): Promise<{ clients: string[]; clientSignals: ClientSignal[] }> {
  const allSignals: ClientSignal[] = [];

  // Add pre-seeded signals from the case study extractor (no AI call needed)
  for (const name of params.preSeededClients ?? []) {
    if (name && !isBlocklisted(name)) {
      allSignals.push({ name: cleanName(name), confidence: 0.9, source: "case_study_ai" });
    }
  }

  // Combine all content sources for section-based extraction
  const allContent = [
    params.homepageContent,
    ...params.evidencePages.map((p) => p.content),
  ].join("\n\n");

  // Run extractors in parallel; skip the AI case-study call if pre-seeded names were provided
  const [aiClients, sectionClients, logoClients, testimonialClients, titleClients] =
    await Promise.all([
      params.preSeededClients?.length
        ? Promise.resolve([]) // already have these — skip duplicate AI call
        : extractFromCaseStudyContent(params.caseStudyPages),
      Promise.resolve(extractFromClientSections(allContent)),
      Promise.resolve(extractFromLogoAltText(allContent)),
      Promise.resolve(extractFromTestimonials(allContent)),
      Promise.resolve(extractFromCaseStudyTitles(params.caseStudyPages)),
    ]);

  allSignals.push(
    ...aiClients,
    ...sectionClients,
    ...logoClients,
    ...testimonialClients,
    ...titleClients
  );

  const merged = mergeAndScore(allSignals);

  return {
    clients: merged.map((s) => s.name),
    clientSignals: merged,
  };
}

// ─── Signal 1: AI Extraction from Case Study Content (0.9) ──

async function extractFromCaseStudyContent(
  pages: { content: string; url: string; title: string }[]
): Promise<ClientSignal[]> {
  if (pages.length === 0) return [];

  const signals: ClientSignal[] = [];

  const results = await Promise.allSettled(
    pages.map(async (page) => {
      try {
        const result = await generateObject({
          model: openrouter.chat("google/gemini-2.0-flash-001"),
          prompt: `Extract the CLIENT COMPANY NAME from this case study/project page. The client is the company that HIRED the agency/firm to do the work described.

TITLE: ${page.title}
URL: ${page.url}

CONTENT (first 4000 chars):
${page.content.slice(0, 4000)}

If this is NOT a case study or you cannot identify a specific client company, set clientName to null.
Do NOT return the name of the agency/firm that did the work — return their CLIENT.`,
          schema: z.object({
            clientName: z
              .string()
              .nullable()
              .describe(
                "The client company name, or null if not identifiable"
              ),
          }),
        });
        return result.object.clientName;
      } catch {
        return null;
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value && !isBlocklisted(r.value)) {
      signals.push({
        name: cleanName(r.value),
        confidence: 0.9,
        source: "case_study_ai",
      });
    }
  }

  return signals;
}

// ─── Signal 2: Section-Aware Client Extraction (0.8) ────────

// Headers that indicate a "clients" section
const CLIENT_SECTION_HEADERS =
  /(?:our\s*)?clients?|trusted\s*by|who\s*we\s*(?:work|serve)|brands?\s*we|work(?:ed)?\s*with|notable|featured\s*(?:clients?|brands?|partners?)|logos?|(?:some\s*of\s*)?(?:our|the)\s*(?:clients?|brands?|companies|partners?)|companies\s*we/i;

function extractFromClientSections(content: string): ClientSignal[] {
  if (!content) return [];

  const signals: ClientSignal[] = [];
  const sections = splitBySections(content);

  for (const section of sections) {
    if (!CLIENT_SECTION_HEADERS.test(section.header)) continue;

    // Within a client section, extract names from:
    // 1. Bold text
    const boldPattern = /\*\*([A-Z][A-Za-z0-9\s&'.,-]{2,40})\*\*/g;
    let match;
    while ((match = boldPattern.exec(section.body)) !== null) {
      const name = cleanName(match[1]);
      if (isValidClientName(name)) {
        signals.push({ name, confidence: 0.8, source: "client_section" });
      }
    }

    // 2. List items
    const listPattern =
      /^[-*]\s+\*?\*?([A-Z][A-Za-z0-9\s&'.,-]{2,50})\*?\*?\s*$/gm;
    while ((match = listPattern.exec(section.body)) !== null) {
      const name = cleanName(match[1]);
      if (isValidClientName(name)) {
        signals.push({ name, confidence: 0.8, source: "client_section" });
      }
    }

    // 3. Standalone capitalized lines (common in logo grids)
    const linePattern = /^([A-Z][A-Za-z0-9\s&'.,-]{2,40})$/gm;
    while ((match = linePattern.exec(section.body)) !== null) {
      const name = cleanName(match[1]);
      if (isValidClientName(name) && name.length > 2 && name.length < 40) {
        signals.push({ name, confidence: 0.75, source: "client_section" });
      }
    }
  }

  return signals;
}

// ─── Signal 3: Logo Alt Text in Client Sections (0.75) ──────

function extractFromLogoAltText(content: string): ClientSignal[] {
  if (!content) return [];

  const signals: ClientSignal[] = [];
  const sections = splitBySections(content);

  for (const section of sections) {
    // Only look at client sections for logo alt text
    if (!CLIENT_SECTION_HEADERS.test(section.header)) continue;

    const imgPattern = /!\[([^\]]{2,50})\]\([^)]+\)/g;
    let match;
    while ((match = imgPattern.exec(section.body)) !== null) {
      const alt = cleanName(match[1]);
      if (isValidClientName(alt)) {
        signals.push({ name: alt, confidence: 0.75, source: "logo_alt" });
      }
    }
  }

  // Also check the full content for logo-grid patterns outside headers
  // (some sites have logo sections without clear headers)
  const consecutiveImgPattern =
    /(?:!\[([^\]]{2,50})\]\([^)]+\)\s*){3,}/g;
  let gridMatch;
  while ((gridMatch = consecutiveImgPattern.exec(content)) !== null) {
    // Found 3+ consecutive images — likely a logo grid
    const gridContent = gridMatch[0];
    const singleImgPattern = /!\[([^\]]{2,50})\]\([^)]+\)/g;
    let imgMatch;
    while ((imgMatch = singleImgPattern.exec(gridContent)) !== null) {
      const alt = cleanName(imgMatch[1]);
      if (isValidClientName(alt)) {
        signals.push({ name: alt, confidence: 0.7, source: "logo_alt" });
      }
    }
  }

  return signals;
}

// ─── Signal 4: Testimonial Attribution (0.65) ───────────────

function extractFromTestimonials(content: string): ClientSignal[] {
  if (!content) return [];

  const signals: ClientSignal[] = [];
  const patterns = [
    // "— Name, Title at Company" or "— Name, Company"
    /[—–-]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:[^,\n]{2,30},?\s*)?(?:at|of|from|@)\s+\*?\*?([A-Z][A-Za-z0-9\s&'.,-]{2,40})\*?\*?/g,
    // "**Name**, Title at Company"
    /\*\*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\*\*,?\s*(?:[^,\n]{2,30},?\s*)?(?:at|of|from|@)\s+([A-Z][A-Za-z0-9\s&'.,-]{2,40})/g,
    // "Name | Title | Company" (common testimonial format)
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*\|\s*[^|\n]{2,30}\s*\|\s*([A-Z][A-Za-z0-9\s&'.,-]{2,40})/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = cleanName(match[1]);
      if (isValidClientName(name)) {
        signals.push({ name, confidence: 0.65, source: "testimonial" });
      }
    }
  }

  return signals;
}

// ─── Signal 5: Case Study Title Parsing (0.6) ───────────────

function extractFromCaseStudyTitles(
  pages: { title: string; url: string }[]
): ClientSignal[] {
  const signals: ClientSignal[] = [];

  for (const page of pages) {
    const title = page.title || "";

    // Pattern: "ClientName: How We Did X" or "ClientName | Project Description"
    const colonSplit = title.split(/\s*[:|]\s*/);
    if (colonSplit.length >= 2) {
      const candidate = cleanName(colonSplit[0]);
      if (
        isValidClientName(candidate) &&
        candidate.length >= 2 &&
        candidate.length <= 40
      ) {
        signals.push({
          name: candidate,
          confidence: 0.6,
          source: "case_study_title",
        });
      }
    }

    // Pattern: "How we helped ClientName" / "Working with ClientName"
    const helpedMatch = title.match(
      /(?:helped|work(?:ing|ed)?\s+with|partnered\s+with|for)\s+([A-Z][A-Za-z0-9\s&'.,-]{2,40})/i
    );
    if (helpedMatch) {
      const candidate = cleanName(helpedMatch[1]);
      if (isValidClientName(candidate)) {
        signals.push({
          name: candidate,
          confidence: 0.6,
          source: "case_study_title",
        });
      }
    }

    // Pattern: "ClientName Case Study" / "ClientName Success Story"
    const caseStudyMatch = title.match(
      /^([A-Z][A-Za-z0-9\s&'.,-]{2,40})\s+(?:case\s*study|success\s*story|project|rebrand|redesign|launch|campaign)/i
    );
    if (caseStudyMatch) {
      const candidate = cleanName(caseStudyMatch[1]);
      if (isValidClientName(candidate)) {
        signals.push({
          name: candidate,
          confidence: 0.6,
          source: "case_study_title",
        });
      }
    }
  }

  return signals;
}

// ─── Merge, Deduplicate, Score ───────────────────────────────

function mergeAndScore(signals: ClientSignal[]): ClientSignal[] {
  if (signals.length === 0) return [];

  // Group by normalized key
  const groups = new Map<string, ClientSignal[]>();
  for (const signal of signals) {
    const key = normalizeKey(signal.name);
    if (!key) continue;
    const existing = groups.get(key) || [];
    existing.push(signal);
    groups.set(key, existing);
  }

  // Score each group
  const scored: ClientSignal[] = [];
  for (const [, groupSignals] of groups) {
    // Pick the best display name (longest/most complete version)
    const bestName = groupSignals.reduce((best, s) =>
      s.name.length > best.name.length ? s : best
    ).name;

    // Count unique sources
    const uniqueSources = new Set(groupSignals.map((s) => s.source)).size;

    // Max confidence from any single signal
    const maxConfidence = Math.max(...groupSignals.map((s) => s.confidence));

    // Cross-validation boost: +0.1 per additional unique source
    const finalConfidence = Math.min(
      1.0,
      maxConfidence + 0.1 * (uniqueSources - 1)
    );

    // Pick best source label
    const bestSource = groupSignals.reduce((best, s) =>
      s.confidence > best.confidence ? s : best
    ).source;

    scored.push({
      name: bestName,
      confidence: finalConfidence,
      source: bestSource,
    });
  }

  // Filter by threshold, sort by confidence DESC, cap
  return scored
    .filter((s) => s.confidence >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CLIENTS);
}

// ─── Helpers ────────────────────────────────────────────────

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

/** Check if a name passes validation (not blocklisted, reasonable format) */
function isValidClientName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 50) return false;
  if (BLOCKLIST.test(name)) return false;
  // Must start with uppercase letter or digit
  if (!/^[A-Z0-9]/.test(name)) return false;
  // Should not be all lowercase (after the first letter)
  // This catches things like "about us" that somehow got capitalized
  return true;
}

/** Check if a raw string is blocklisted */
function isBlocklisted(name: string): boolean {
  return BLOCKLIST.test(name.trim());
}

/** Split markdown content into header+body sections */
function splitBySections(
  content: string
): { header: string; body: string }[] {
  const lines = content.split("\n");
  const sections: { header: string; body: string }[] = [];
  let currentHeader = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      // Save previous section
      if (currentHeader || currentBody.length > 0) {
        sections.push({
          header: currentHeader,
          body: currentBody.join("\n"),
        });
      }
      currentHeader = headerMatch[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentHeader || currentBody.length > 0) {
    sections.push({
      header: currentHeader,
      body: currentBody.join("\n"),
    });
  }

  return sections;
}
