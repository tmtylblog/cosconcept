/**
 * Service Offering Extractor
 *
 * Uses AI to extract structured service offerings from services/capabilities pages.
 * Detects service names, descriptions, and sub-services.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface ExtractedService {
  name: string;
  description?: string;
  subServices: string[];
}

/**
 * Extract service offerings from a services/capabilities page.
 *
 * Returns structured service data including sub-services
 * which are valuable for L2/L3 skill taxonomy mapping.
 */
export async function extractServicesDeep(
  content: string,
  url: string,
  options?: { isHomepage?: boolean }
): Promise<ExtractedService[]> {
  if (!content || content.length < 50) return [];

  const homepageHint = options?.isHomepage
    ? `This is the company HOMEPAGE. Many firms list their services, practice areas, or capabilities on the homepage. Extract any services, practice areas, or solution categories mentioned even if this is not a dedicated services page.`
    : `If this is NOT a services page, return an empty array.`;

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Extract service offerings from this web page.

For each service, extract:
- Service name (e.g., "Brand Strategy", "Web Development", "Paid Media")
- Brief description (1-2 sentences)
- Sub-services or specific capabilities under this service

Only extract actual service offerings. Skip navigation, CTAs, or generic marketing copy.
${homepageHint}

PAGE URL: ${url}

CONTENT:
${content.slice(0, 8000)}`,
      schema: z.object({
        services: z.array(
          z.object({
            name: z.string().describe("Service name"),
            description: z
              .string()
              .optional()
              .describe("Brief description of the service"),
            subServices: z
              .array(z.string())
              .describe("Specific sub-services or capabilities"),
          })
        ),
      }),
      maxOutputTokens: 1024,
    });

    return result.object.services
      .filter((s) => s.name && s.name.length > 2 && s.name.length < 100)
      .slice(0, 20);
  } catch (err) {
    console.warn(`[ServiceExtractor] Extraction failed for ${url}:`, err);
    return [];
  }
}
