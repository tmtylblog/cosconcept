/**
 * AI Opportunity Extractor
 *
 * Scans text (call transcripts, emails) for business opportunity signals.
 * Outputs using the same controlled vocabulary as the enrichment classification
 * pipeline — so extracted opportunities can be directly compared against
 * partner preferences and firm profiles without fuzzy matching.
 *
 * Signal types:
 *   direct — client explicitly asked for it ("we need help with X")
 *   latent — implied by the situation ("CEO is handling all marketing himself")
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { FIRM_CATEGORIES, MARKETS } from "./extraction-vocab";

// Re-export for convenience
export { FIRM_CATEGORIES, MARKETS };

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface ExtractedOpportunity {
  title: string;
  description: string;
  evidence: string;
  signalType: "direct" | "latent";
  priority: "high" | "medium" | "low";
  resolutionApproach: "self" | "network" | "hybrid";
  requiredCategories: string[];
  requiredSkills: string[];
  requiredIndustries: string[];
  requiredMarkets: string[];
  estimatedValue?: string;
  timeline?: string;
  clientName?: string;
  clientSizeBand?: string;
  platformMatchHint?: string;
  confidence: number;
}

/** The default extraction instructions — used when no custom prompt is saved. */
export const DEFAULT_EXTRACTION_INSTRUCTIONS = `Extract every business opportunity you can identify — explicit and latent.

**CRITICAL: Distinguish pitches from pain points.**
A consultant or salesperson describing THEIR OWN services ("we offer SEO", "our platform does X") is NOT an opportunity — ignore it entirely. An opportunity is when the CLIENT or PROSPECT reveals a genuine need, challenge, constraint, or gap. Focus exclusively on the client/prospect side of the conversation.

**Signal types:**
- direct: client explicitly asked for something ("we need help with X", "we're looking for someone to...", "can you recommend a...")
- latent: implied by the situation but NOT explicitly stated as a need. Examples:
  - Org structure gaps: "our CEO is handling all marketing himself" = Fractional CMO signal
  - Scaling pain: "we manually process 500 invoices a month" = automation/ops signal
  - Upcoming events: "IPO next year", "Series B closing Q3" = readiness/compliance signal
  - Team departures: "we just lost our VP Sales" = interim leadership signal
  - Market expansion: "we're launching in Europe next quarter" = market entry signal
  - Tech debt: "our CRM is a spreadsheet" = systems integration signal

**Priority signals:**
- high: urgent language, specific deadline, budget mentioned, CEO-level problem, revenue at risk
- medium: clearly needed but no urgency expressed
- low: exploratory mention, "we might need", future consideration, "someday we should"

**Resolution approach** (if firm context provided):
- self: this firm's categories can cover it
- network: outside this firm's categories — needs a partner
- hybrid: partially in scope, partially needs a partner
- Default to "network" if no firm context provided.

**requiredCategories**: Pick 1-3 from the provided list that best match what's needed.
**requiredSkills**: Output 2-5 specific skill strings using precise professional services terminology (e.g. "Fractional CMO", "Revenue Operations", "Salesforce Administration", "Paid Media Strategy", "Brand Identity Systems") — NOT casual shorthand like "ads" or "CRM stuff".
**requiredIndustries**: Industries the CLIENT operates in (not the vendor).
**requiredMarkets**: Geographic markets relevant to this opportunity. Use ONLY values from the provided list.
**evidence**: Quote or close paraphrase of the specific words that indicate this need. Must come from the CLIENT side of the conversation.
**estimatedValue**: If budget or deal size is mentioned, output a range like "10k-25k", "50k-100k", "100k+". Otherwise omit.
**timeline**: "immediate", "1-3 months", "3-6 months", or "exploratory". Omit if unclear.
**clientName**: Company or person name if mentioned.
**clientSizeBand**: If company size is determinable, use one of: individual, micro_1_10, small_11_50, emerging_51_200, mid_201_500, upper_mid_501_1000, large_1001_5000, major_5001_10000, global_10000_plus. Otherwise omit.
**platformMatchHint**: Describe the type of professional services firm that could solve this — e.g. "Fractional CMO firm", "Revenue Operations consultancy", "Data analytics & BI shop". This helps downstream matching.

**Rules:**
- Ignore: small talk, the firm's own pitch/capabilities, generic pleasantries, scheduling logistics
- Focus: the client's language, their metrics, their constraints, their frustrations, their gaps
- Be conservative — only flag genuine opportunities, not vague mentions or polite interest
- A single call may have multiple distinct opportunities — extract all of them
- Look for pain points the client may not even realize they have (latent signals are often the highest-value opportunities)
- confidence: how certain you are this is a real, actionable opportunity (0-1)`;

export async function extractOpportunities(
  text: string,
  context?: {
    firmName?: string;
    firmCategories?: string[];
    source?: string;
    customPrompt?: string;
  }
): Promise<ExtractedOpportunity[]> {
  if (text.length < 50) return [];

  const firmContext = context?.firmName
    ? `The firm analysing this transcript is: ${context.firmName}.`
    : "";

  const firmCapabilities =
    context?.firmCategories && context.firmCategories.length > 0
      ? `Their service categories: ${context.firmCategories.join(", ")}.`
      : "";

  const instructions = context?.customPrompt || DEFAULT_EXTRACTION_INSTRUCTIONS;

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are analysing a ${context?.source ?? "text"} to extract business opportunities — things the client needs that could potentially be solved by a professional services firm.

${firmContext} ${firmCapabilities}

## TEXT TO ANALYSE
${text.slice(0, 6000)}

## FIRM CATEGORIES (use ONLY these values for requiredCategories)
${FIRM_CATEGORIES.join("\n")}

## MARKETS (use ONLY these values for requiredMarkets)
${MARKETS.join(", ")}

## INSTRUCTIONS

${instructions}`,
      schema: z.object({
        opportunities: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
            evidence: z.string(),
            signalType: z.enum(["direct", "latent"]),
            priority: z.enum(["high", "medium", "low"]),
            resolutionApproach: z.enum(["self", "network", "hybrid"]),
            requiredCategories: z.array(z.string()),
            requiredSkills: z.array(z.string()),
            requiredIndustries: z.array(z.string()),
            requiredMarkets: z.array(z.string()),
            estimatedValue: z.string().optional(),
            timeline: z.string().optional(),
            clientName: z.string().optional(),
            clientSizeBand: z.string().optional(),
            platformMatchHint: z.string().optional().describe("Type of professional services firm that could solve this"),
            confidence: z.number().describe("0-1 confidence this is a real opportunity"),
          })
        ),
      }),
      maxOutputTokens: 2048,
    });

    return result.object.opportunities.filter((o) => o.confidence >= 0.5);
  } catch (err) {
    console.error("[OpportunityExtractor] Error:", err);
    return [];
  }
}
