/**
 * Phase 1: Firm Intelligence
 *
 * A single LLM call on the homepage that produces:
 * 1. Understanding of what the firm does and how they're organized
 * 2. Extraction of any offerings, evidence, clients visible on the homepage
 * 3. A prioritized scrape plan — which sub-pages to visit next and why
 *
 * This replaces hardcoded URL probing and per-page classification.
 * The LLM sees the firm's navigation, copy, and structure holistically.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import type { JinaScrapeResult } from "./jina-scraper";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ──────────────────────────────────────────────────

export const ServiceModelEnum = z.enum([
  "agency",
  "consultancy",
  "fractional",
  "training",
  "managed_services",
  "product_studio",
  "staffing",
  "hybrid",
  "unclear",
]);

export const ExpectedContentEnum = z.enum([
  "offerings",
  "evidence_of_work",
  "clients",
  "team",
  "about",
  "industries",
]);

const FirmIntelligenceSchema = z.object({
  understanding: z.object({
    summary: z.string().describe("1-2 sentence summary of what this firm does"),
    serviceModel: ServiceModelEnum.describe("Primary business model"),
    offeringTerminology: z
      .string()
      .describe("What they call their services: e.g., 'Practice Areas', 'Solutions', 'Capabilities'"),
    evidenceTerminology: z
      .string()
      .describe("What they call case studies: e.g., 'Our Work', 'Success Stories', 'Portfolio'"),
    targetMarket: z.string().optional().describe("Who they serve, if evident"),
  }),
  homepageExtractions: z.object({
    offerings: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        subItems: z.array(z.string()),
      })
    ),
    evidenceOfWork: z.array(
      z.object({
        title: z.string(),
        clientName: z.string().optional(),
        outcome: z.string().optional(),
        sourceUrl: z.string().optional(),
      })
    ),
    clientSignals: z.array(z.string()).describe("Company names mentioned as clients"),
    teamMentions: z.array(
      z.object({
        name: z.string(),
        role: z.string().optional(),
      })
    ),
  }),
  scrapePlan: z
    .array(
      z.object({
        url: z.string(),
        reason: z.string(),
        expectedContent: ExpectedContentEnum,
      })
    )
    .max(8),
});

export type FirmIntelligence = z.infer<typeof FirmIntelligenceSchema>;

// ─── Main Function ──────────────────────────────────────────

export async function analyzeFirmHomepage(
  homepage: JinaScrapeResult,
  firmName: string
): Promise<FirmIntelligence> {
  // Build internal links list for the LLM to pick from
  const internalLinks = (homepage.links ?? [])
    .filter((link) => {
      // Skip anchors, mailto, tel, external, and asset URLs
      if (link.startsWith("#") || link.startsWith("mailto:") || link.startsWith("tel:")) return false;
      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js|ico|woff|woff2|mp4|mp3)(\?|$)/i.test(link)) return false;
      return true;
    })
    .slice(0, 60); // Cap to avoid prompt bloat

  const linksText =
    internalLinks.length > 0
      ? internalLinks.map((l) => `- ${l}`).join("\n")
      : "(No internal links found)";

  const result = await generateObject({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    prompt: `You are analyzing a professional services firm's homepage to understand what they do and how their website is organized.

FIRM NAME: ${firmName}

HOMEPAGE CONTENT:
${homepage.content.slice(0, 6000)}

ALL INTERNAL LINKS FROM HOMEPAGE:
${linksText}

Analyze this firm and return:

## 1. FIRM UNDERSTANDING
- What this firm does (1-2 sentences)
- Their primary service model (agency, consultancy, fractional leadership, training, managed services, product studio, staffing, hybrid, or unclear)
- How they describe their offerings — what word do they use? (e.g., "Services", "Practice Areas", "Solutions", "Capabilities", "Programs", "What We Do", "Expertise")
- How they describe their work evidence (e.g., "Case Studies", "Our Work", "Portfolio", "Success Stories", "Results", "Projects")
- Who they target (if evident from the homepage)

## 2. HOMEPAGE EXTRACTIONS
Extract EVERYTHING visible on the homepage:
- **Offerings**: Any services, practice areas, solutions, capabilities, programs, engagement models, or specialized offerings listed. Include names, descriptions (2-3 sentences max, using the firm's own language), and any sub-items mentioned.
- **Evidence of work**: Any case study references, project mentions, client results, success metrics. Include URLs if linked.
- **Client signals**: Company names mentioned as clients, in "trusted by" sections, testimonials, or logo sections. Only extract company names that are clearly CLIENTS of this firm (not partners, tools, or the firm itself).
- **Team mentions**: Leadership or team member names visible on the homepage.

## 3. SCRAPE PLAN
From the internal links above, select the 5-8 most valuable URLs to scrape next.
Prioritize pages that will contain:
- Detailed offerings/services (whatever this firm calls them)
- Evidence of work (case studies, portfolio, projects)
- Client information (client lists, testimonials)
- About/team information
SKIP these URL types — do NOT include them in the scrape plan:
- Individual blog posts (URLs containing /blog/some-article, /news/, /insights/, /articles/)
- Blog listing pages (/blog/, /news/)
- Individual team member profiles (URLs that look like a person's name, e.g., /john-smith/)
- Careers, legal/privacy, contact, login/signup pages
- Image/asset URLs
For each URL, explain WHY you selected it and what content you expect to find.`,
    schema: FirmIntelligenceSchema,
    maxOutputTokens: 2048,
  });

  return result.object;
}

// ─── Fallback ───────────────────────────────────────────────

/** Default scrape plan when Phase 1 fails — mirrors old COMMON_PATHS behavior */
export function buildFallbackScrapePlan(baseUrl: string): FirmIntelligence["scrapePlan"] {
  const paths = [
    { path: "/services", reason: "Common services page", expected: "offerings" as const },
    { path: "/our-services", reason: "Alternative services page", expected: "offerings" as const },
    { path: "/what-we-do", reason: "Alternative offerings page", expected: "offerings" as const },
    { path: "/capabilities", reason: "Capabilities page", expected: "offerings" as const },
    { path: "/case-studies", reason: "Case studies page", expected: "evidence_of_work" as const },
    { path: "/work", reason: "Portfolio/work page", expected: "evidence_of_work" as const },
    { path: "/our-work", reason: "Portfolio page", expected: "evidence_of_work" as const },
    { path: "/about", reason: "About page", expected: "about" as const },
    { path: "/team", reason: "Team page", expected: "team" as const },
    { path: "/clients", reason: "Client list", expected: "clients" as const },
  ];
  return paths.map((p) => ({
    url: `${baseUrl}${p.path}`,
    reason: p.reason,
    expectedContent: p.expected,
  }));
}
