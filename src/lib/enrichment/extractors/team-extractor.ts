/**
 * Team Member Extractor
 *
 * Uses AI to extract team member information from team/people pages.
 * Detects names, roles, LinkedIn URLs, and short bios.
 *
 * Critical for the expert enrichment pipeline — discovered team members
 * get queued for PDL/LinkedIn enrichment.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface ExtractedTeamMember {
  name: string;
  role?: string;
  linkedinUrl?: string;
  bio?: string;
}

/**
 * Extract team member profiles from a team/people page.
 *
 * Uses AI to handle various page layouts:
 * - Grid layouts with name + title
 * - Detailed bios with paragraphs
 * - Leadership pages with headshots and descriptions
 */
export async function extractTeamMembers(
  content: string,
  url: string,
  firmName: string
): Promise<ExtractedTeamMember[]> {
  if (!content || content.length < 50) return [];

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Extract team member information from this ${firmName} page.

For each person, extract:
- Full name
- Job title/role
- LinkedIn URL (if present as a link)
- Short bio (1-2 sentences if available)

Only extract actual team members. Skip navigation links, author credits, or testimonial attributions.
If this is NOT a team page, return an empty array.

PAGE URL: ${url}

CONTENT:
${content.slice(0, 8000)}`,
      schema: z.object({
        teamMembers: z.array(
          z.object({
            name: z.string().describe("Full name (e.g., 'Sarah Chen')"),
            role: z
              .string()
              .optional()
              .describe("Job title (e.g., 'VP of Marketing')"),
            linkedinUrl: z
              .string()
              .optional()
              .describe("LinkedIn profile URL if found"),
            bio: z
              .string()
              .optional()
              .describe("Short bio or description (1-2 sentences)"),
          })
        ),
      }),
      maxOutputTokens: 2048,
    });

    // Validate and clean results
    return result.object.teamMembers
      .filter((m) => {
        // Must have a reasonable name
        if (!m.name || m.name.length < 3 || m.name.length > 60) return false;
        // Name should look like a person's name (at least two words)
        if (m.name.split(/\s+/).length < 2) return false;
        // Filter out common false positives
        if (
          /^(about|contact|team|meet|our|the|view|read)/i.test(m.name)
        ) {
          return false;
        }
        return true;
      })
      .map((m) => ({
        name: m.name.trim(),
        role: m.role?.trim(),
        linkedinUrl: m.linkedinUrl?.startsWith("http")
          ? m.linkedinUrl
          : undefined,
        bio: m.bio?.trim(),
      }))
      .slice(0, 50); // Cap at 50 team members per page
  } catch (err) {
    console.warn(`[TeamExtractor] Extraction failed for ${url}:`, err);
    return [];
  }
}
