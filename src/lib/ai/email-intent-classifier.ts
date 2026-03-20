/**
 * Email Intent Classifier
 *
 * Uses AI to classify inbound emails by intent and extract
 * structured entities (skills, industries, firm names, values).
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const emailClassificationSchema = z.object({
  intent: z
    .enum(["opportunity", "follow_up", "context", "question", "intro_response", "unrelated"])
    .describe("Primary intent of the email"),
  confidence: z.number().min(0).max(1).describe("Confidence in the classification"),
  summary: z.string().describe("One-sentence summary of the email"),
  entities: z.object({
    firmNames: z.array(z.string()).optional().describe("Company/firm names mentioned"),
    personNames: z.array(z.string()).optional().describe("People mentioned by name"),
    skills: z.array(z.string()).optional().describe("Skills or services mentioned"),
    industries: z.array(z.string()).optional().describe("Industries mentioned"),
    values: z.array(z.string()).optional().describe("Dollar values or deal sizes mentioned"),
  }),
  opportunitySignals: z
    .object({
      title: z.string().optional().describe("Brief title for the opportunity"),
      requiredSkills: z.array(z.string()).optional(),
      estimatedValue: z.string().optional(),
      urgency: z.enum(["immediate", "soon", "exploratory"]).optional(),
    })
    .optional()
    .describe("If intent=opportunity, extracted opportunity details"),
  followUpNeeded: z
    .object({
      reason: z.string().describe("Why follow-up is needed"),
      suggestedDate: z.string().optional().describe("Suggested follow-up date (ISO)"),
      action: z.string().describe("What action to take"),
    })
    .optional()
    .describe("If follow-up is needed, details about it"),
});

export type EmailClassification = z.infer<typeof emailClassificationSchema>;

/**
 * Classify an inbound email and extract structured data.
 */
export async function classifyEmail(opts: {
  from: string;
  subject: string;
  bodyText: string;
  threadContext?: string;
}): Promise<EmailClassification> {
  const { from, subject, bodyText, threadContext } = opts;

  try {
    const classifyStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      schema: emailClassificationSchema,
      maxOutputTokens: 1000,
      system: `You are an AI email classifier for Collective OS, a partnership platform for professional services firms.

Classify inbound emails sent to or CC'd to ossy@joincollectiveos.com.

Intent definitions:
- "opportunity": Email mentions a client need, project, or business opportunity that could be shared with partners
- "follow_up": Email requires a follow-up action or response
- "context": Email provides useful context about a firm, client, or relationship (no action needed)
- "question": Email asks a question that Ossy should answer
- "intro_response": Email is a reply to a three-way intro Ossy sent
- "unrelated": Spam, marketing, or irrelevant content

Extract entities carefully — only include what's explicitly mentioned.
For opportunity signals, only populate if the email genuinely describes a business opportunity.`,
      prompt: `Classify this email:

From: ${from}
Subject: ${subject}

Body:
${bodyText.slice(0, 3000)}

${threadContext ? `Previous thread context:\n${threadContext}` : ""}`,
    });

    logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "classification",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - classifyStart,
    }).catch(() => {});

    return result.object;
  } catch (err) {
    console.error("[EmailClassifier] Classification failed:", err);
    return {
      intent: "unrelated",
      confidence: 0,
      summary: "Classification failed — could not process email",
      entities: {},
    };
  }
}

/**
 * Extract actionable context from an email for memory storage.
 */
export async function extractEmailContext(opts: {
  from: string;
  subject: string;
  bodyText: string;
  classification: EmailClassification;
}): Promise<{ themes: string[]; keyFacts: string[] }> {
  const { from, subject, bodyText, classification } = opts;

  try {
    const extractStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      schema: z.object({
        themes: z
          .array(z.string())
          .describe("Key themes from this email (e.g., 'SEO services', 'fintech clients')"),
        keyFacts: z
          .array(z.string())
          .describe(
            "Important facts to remember (e.g., 'Firm X is looking for a Shopify partner', 'Client Y needs SEO audit by March')"
          ),
      }),
      maxOutputTokens: 500,
      prompt: `Extract key themes and facts from this email for future reference.

From: ${from}
Subject: ${subject}
Intent: ${classification.intent}
Summary: ${classification.summary}

Body:
${bodyText.slice(0, 2000)}`,
    });

    logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "classification",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      durationMs: Date.now() - extractStart,
    }).catch(() => {});

    return result.object;
  } catch (err) {
    console.error("[EmailClassifier] Context extraction failed:", err);
    return { themes: [], keyFacts: [] };
  }
}
