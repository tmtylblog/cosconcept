/**
 * AI Opportunity Extractor
 *
 * Scans text (call transcripts, emails, chat messages) for
 * signals that indicate a business opportunity that could be
 * shared with a partner.
 *
 * Detects phrases like:
 * - "We need help with..."
 * - "Looking for a partner who..."
 * - "Our client needs..."
 * - "We don't do [service] but the client asked about..."
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface ExtractedOpportunity {
  title: string;
  description: string;
  requiredSkills: string[];
  requiredIndustries: string[];
  estimatedValue?: string;
  timeline?: string;
  clientType?: string;
  confidence: number;
}

/**
 * Extract potential business opportunities from text content.
 *
 * Returns zero or more opportunities with confidence scores.
 */
export async function extractOpportunities(
  text: string,
  context?: { firmName?: string; source?: string }
): Promise<ExtractedOpportunity[]> {
  if (text.length < 50) return [];

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Analyze this ${context?.source ?? "text"} and extract any business opportunities that could be shared with a partner firm.

## TEXT
${text.slice(0, 5000)}

## CONTEXT
${context?.firmName ? `This text involves ${context.firmName}.` : ""}

## INSTRUCTIONS
Look for signals that indicate a need for external help:
1. Explicit requests: "we need", "looking for", "help with"
2. Capability gaps: "we don't do", "not our expertise", "outside our scope"
3. Client needs: "the client wants", "they asked about", "they need"
4. Referral opportunities: "do you know anyone who", "can you recommend"

For each opportunity found, extract:
- A clear title summarizing the opportunity
- Description of what's needed
- Required skills/services
- Relevant industries
- Estimated value range if mentioned (e.g., "10k-25k")
- Timeline if mentioned (e.g., "immediate", "1-3 months")
- Client type indicators

If NO opportunities are detected, return an empty array.
Be conservative — only flag genuine opportunities, not vague mentions.`,
      schema: z.object({
        opportunities: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
            requiredSkills: z.array(z.string()),
            requiredIndustries: z.array(z.string()),
            estimatedValue: z.string().optional(),
            timeline: z.string().optional(),
            clientType: z.string().optional(),
            confidence: z
              .number()
              .describe("How confident we are this is a real opportunity (0-1)"),
          })
        ),
      }),
      maxOutputTokens: 1024,
    });

    // Filter by confidence threshold
    return result.object.opportunities.filter((o) => o.confidence >= 0.5);
  } catch (err) {
    console.error("[OpportunityExtractor] Error:", err);
    return [];
  }
}
