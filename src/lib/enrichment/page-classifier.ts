/**
 * AI Page Type Classifier
 *
 * Uses Gemini Flash to classify what type of page a scraped URL is.
 * This is faster and more accurate than regex pattern matching alone.
 *
 * Classification is a simple task — ideal for a cheap, fast model.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export type PageType =
  | "homepage"
  | "about"
  | "services"
  | "case_study"
  | "portfolio"
  | "team"
  | "clients"
  | "blog_post"
  | "blog_listing"
  | "industries"
  | "contact"
  | "careers"
  | "pricing"
  | "other";

/**
 * Fast regex-based pre-classification.
 * Returns a likely type or null if unsure (falls through to AI).
 */
function regexPreClassify(url: string, title: string): PageType | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null; // Malformed URL — fall through to AI classification
  }
  const t = title.toLowerCase();

  // High-confidence regex patterns
  if (path === "/" || path === "") return "homepage";
  if (/\/contact/.test(path)) return "contact";
  if (/\/careers|\/jobs|\/hiring/.test(path)) return "careers";
  if (/\/pricing|\/plans/.test(path)) return "pricing";
  if (/\/blog\/?$|\/insights\/?$|\/news\/?$|\/resources\/?$/.test(path))
    return "blog_listing";

  // Medium confidence — use title as confirmation
  if (/\/about|\/who-we-are|\/our-story/.test(path) && /about|story|mission/i.test(t))
    return "about";
  if (/\/team|\/people|\/leadership/.test(path) && /team|people|leadership/i.test(t))
    return "team";
  if (/\/client|\/customer|\/brand/.test(path)) return "clients";

  // For services, case studies, and blog posts — AI does better
  return null;
}

/**
 * Classify a scraped page into a page type.
 *
 * Uses fast regex first, falls through to AI for ambiguous cases.
 * AI classification costs ~$0.0001 per page with Gemini Flash.
 */
export async function classifyPageType(
  title: string,
  content: string,
  url: string
): Promise<PageType> {
  // Try regex first (free, instant)
  const regexResult = regexPreClassify(url, title);
  if (regexResult) return regexResult;

  // Fall through to AI for ambiguous cases
  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Classify this web page into exactly one type.

URL: ${url}
TITLE: ${title}
CONTENT (first 1500 chars):
${content.slice(0, 1500)}

Page types:
- "about" — Company about/mission/story page
- "services" — Service offerings, capabilities, what-we-do
- "case_study" — Single detailed case study or project showcase
- "portfolio" — Listing of multiple case studies/projects/work samples
- "team" — Team members, leadership, people page
- "clients" — Client list, logos, testimonials
- "blog_post" — Single blog article or insight piece
- "blog_listing" — Blog index or article listing
- "industries" — Industry/vertical pages the company serves
- "contact" — Contact information or form
- "careers" — Job listings or career page
- "pricing" — Pricing or plans page
- "other" — None of the above`,
      schema: z.object({
        pageType: z.enum([
          "about",
          "services",
          "case_study",
          "portfolio",
          "team",
          "clients",
          "blog_post",
          "blog_listing",
          "industries",
          "contact",
          "careers",
          "pricing",
          "other",
        ]),
      }),
      maxOutputTokens: 64,
    });

    return result.object.pageType;
  } catch (err) {
    console.warn(`[PageClassifier] AI classification failed for ${url}:`, err);
    // Fallback: try basic heuristics
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (/service|capabilit|solution|offering/.test(path)) return "services";
      if (/case|stud|project/.test(path)) return "case_study";
      if (/work|portfolio/.test(path)) return "portfolio";
      if (/about/.test(path)) return "about";
      if (/team|people/.test(path)) return "team";
    } catch {
      // Malformed URL — can't apply heuristics
    }
    return "other";
  }
}
