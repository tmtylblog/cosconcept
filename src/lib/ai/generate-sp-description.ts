/**
 * Generate Specialist Profile Description
 *
 * Creates a 150-300 word description for a specialist profile based on:
 * - The specialist title (focus area)
 * - Three work examples (proof points)
 * - Expert's normalized bio (hidden context for tone/background)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface WorkExampleInput {
  title: string;
  subject: string;
  companyName: string;
  companyIndustry: string;
}

export async function generateSpDescription(params: {
  specialistTitle: string;
  examples: WorkExampleInput[];
  expertBio?: string;
  expertName?: string;
}): Promise<string> {
  const { specialistTitle, examples, expertBio, expertName } = params;

  const examplesText = examples
    .map(
      (ex, i) =>
        `${i + 1}. ${ex.title} at ${ex.companyName}${ex.companyIndustry ? ` (${ex.companyIndustry})` : ""}\n   ${ex.subject}`
    )
    .join("\n\n");

  const start = Date.now();

  try {
    const result = await generateText({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Write a specialist profile description for ${expertName ? `${expertName}, a ` : "a "}professional positioned as: "${specialistTitle}".

WORK EXAMPLES (proof points):
${examplesText}

${expertBio ? `BACKGROUND CONTEXT (use for tone and depth, but don't copy):
${expertBio}` : ""}

RULES:
- Write 150-300 words in THIRD PERSON
- Focus on the expertise described by "${specialistTitle}"
- Reference the work examples as evidence of expertise
- Professional tone, 2-3 short paragraphs maximum
- NO bullets, NO headers — flowing prose only
- Emphasize outcomes and impact, not just responsibilities
- Make it compelling for someone searching for this type of expert

DESCRIPTION:`,
      maxTokens: 600,
    });

    const duration = Date.now() - start;
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "expert",
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      durationMs: duration,
    });

    return result.text?.trim() ?? "";
  } catch (err) {
    console.error("[GenerateSpDescription] Failed:", err);
    return "";
  }
}
