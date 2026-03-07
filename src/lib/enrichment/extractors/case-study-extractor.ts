/**
 * Case Study Deep Extractor
 *
 * Uses AI to extract structured case study data from web page content.
 * Handles both individual case study pages and portfolio listing pages.
 *
 * Extracts: title, client, challenge, solution, outcomes, services, skills, industries
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface ExtractedCaseStudy {
  title: string;
  clientName?: string;
  challenge?: string;
  solution?: string;
  outcomes: string[];
  servicesUsed: string[];
  skills: string[];
  industries: string[];
  sourceUrl: string;
}

/**
 * Extract case studies from a page.
 *
 * For a single case study page, returns 1 item.
 * For a portfolio/listing page, returns multiple items (summary-level).
 */
export async function extractCaseStudyDeep(
  pageTitle: string,
  content: string,
  url: string
): Promise<ExtractedCaseStudy[]> {
  if (!content || content.length < 100) return [];

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Extract case study data from this web page content.

If this is a SINGLE case study, extract one detailed entry.
If this is a PORTFOLIO or LISTING page, extract multiple entries with whatever detail is available.
If the content is NOT case studies or project work, return an empty array.

PAGE TITLE: ${pageTitle}
PAGE URL: ${url}

CONTENT:
${content.slice(0, 10000)}`,
      schema: z.object({
        caseStudies: z.array(
          z.object({
            title: z.string().describe("Case study or project title"),
            clientName: z
              .string()
              .optional()
              .describe("Client company name if mentioned"),
            challenge: z
              .string()
              .optional()
              .describe("The business problem or challenge"),
            solution: z
              .string()
              .optional()
              .describe("What was delivered or built"),
            outcomes: z
              .array(z.string())
              .describe("Key results, metrics, or achievements"),
            servicesUsed: z
              .array(z.string())
              .describe("Services or capabilities demonstrated (e.g., Brand Strategy, Web Development)"),
            skills: z
              .array(z.string())
              .describe("Specific tools/skills shown (e.g., Shopify, React, Google Ads)"),
            industries: z
              .array(z.string())
              .describe("Industries involved (e.g., Healthcare, SaaS, CPG)"),
          })
        ),
      }),
      maxOutputTokens: 2048,
    });

    return result.object.caseStudies.map((cs) => ({
      ...cs,
      sourceUrl: url,
    }));
  } catch (err) {
    console.warn(`[CaseStudyExtractor] Extraction failed for ${url}:`, err);
    return [];
  }
}
