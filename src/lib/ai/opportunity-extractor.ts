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

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// The 30 firm categories — same list used in enrichment classification
const FIRM_CATEGORIES = [
  "Fractional & Embedded Leadership",
  "Training, Enablement & Professional Coaching",
  "Outsourcing & Managed Business Services",
  "Brand Strategy & Positioning",
  "Creative, Content & Production",
  "Customer Success & Retention",
  "Data, Analytics & Business Intelligence",
  "Market Research & Customer Intelligence",
  "Finance, Accounting & Tax",
  "Human Capital & Talent",
  "People Operations & HR",
  "Privacy, Risk & Compliance",
  "Legal",
  "Growth Marketing & Demand Generation",
  "Lifecycle, CRM & Marketing Operations",
  "Public Relations & Communications",
  "Operations & Process",
  "Change, Transformation & Reengineering",
  "Product Strategy & Innovation",
  "Product Management, UX & Design",
  "Sales Strategy & Enablement",
  "Revenue Operations & Go-To-Market",
  "Strategy & Management Consulting",
  "Technology Strategy & Digital Transformation",
  "Systems Integration & Enterprise Platforms",
  "Software Engineering & Custom Development",
  "AI, Automation & Intelligent Systems",
  "IT Infrastructure & Managed Services",
  "Cybersecurity & Information Security",
];

// Major markets — same vocabulary used in partner preferences
const MARKETS = [
  "Global",
  "North America",
  "United States",
  "Canada",
  "Europe",
  "United Kingdom",
  "DACH",
  "France",
  "Nordics",
  "Asia Pacific",
  "Australia",
  "Southeast Asia",
  "India",
  "MENA",
  "Latin America",
  "Remote / Virtual",
];

export interface ExtractedOpportunity {
  title: string;
  description: string;
  evidence: string; // The quote or paraphrase that triggered this extraction
  signalType: "direct" | "latent";
  priority: "high" | "medium" | "low";
  resolutionApproach: "self" | "network" | "hybrid";
  requiredCategories: string[]; // From FIRM_CATEGORIES list
  requiredSkills: string[]; // L2-level skill names
  requiredIndustries: string[]; // Industries the client operates in
  requiredMarkets: string[]; // From MARKETS list
  estimatedValue?: string; // e.g. "10k-25k", "50k-100k"
  timeline?: string; // "immediate", "1-3 months", "3-6 months", "exploratory"
  clientName?: string; // Company name if mentioned
  clientSizeBand?: string; // sizeBand enum value if determinable
  confidence: number; // 0–1
}

export async function extractOpportunities(
  text: string,
  context?: {
    firmName?: string;
    firmCategories?: string[]; // What the calling firm does — used for resolution_approach
    source?: string;
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

Extract every business opportunity you can identify — explicit and latent.

**Signal types:**
- direct: client explicitly asked for something ("we need help with X", "we're looking for someone to...")
- latent: implied by the situation ("our CEO is handling all marketing" = Fractional CMO signal, "we're launching in Europe next quarter" = market expansion signal)

**Priority signals:**
- high: urgent language, specific deadline, budget mentioned, CEO-level problem
- medium: clearly needed but no urgency
- low: exploratory mention, "we might need", future consideration

**Resolution approach** (if firm context provided):
- self: this firm's categories can cover it
- network: outside this firm's categories — needs a partner
- hybrid: partially in scope, partially needs a partner
- Default to "network" if no firm context provided.

**requiredCategories**: Pick 1–3 from the provided list that best match what's needed.
**requiredSkills**: Output 2–5 specific skill strings (e.g. "Paid Social", "Brand Identity", "Salesforce Implementation"). Use standard professional services terminology.
**requiredIndustries**: Industries the CLIENT operates in (not the vendor).
**requiredMarkets**: Geographic markets relevant to this opportunity. Use ONLY values from the provided list.
**evidence**: Quote or close paraphrase of the specific words that indicate this need.
**estimatedValue**: If budget or deal size is mentioned, output a range like "10k-25k", "50k-100k", "100k+". Otherwise omit.
**timeline**: "immediate", "1-3 months", "3-6 months", or "exploratory". Omit if unclear.
**clientName**: Company or person name if mentioned.
**clientSizeBand**: If company size is determinable, use one of: individual, micro_1_10, small_11_50, emerging_51_200, mid_201_500, upper_mid_501_1000, large_1001_5000, major_5001_10000, global_10000_plus. Otherwise omit.

**Rules:**
- Ignore: small talk, the firm's own pitch, generic pleasantries
- Focus: the client's language, their metrics, their constraints, their frustrations
- Be conservative — only flag genuine opportunities, not vague mentions
- A single call may have multiple distinct opportunities — extract all of them
- confidence: how certain you are this is a real, actionable opportunity (0–1)`,
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
            confidence: z.number().describe("0–1 confidence this is a real opportunity"),
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
