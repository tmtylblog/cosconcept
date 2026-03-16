/**
 * Normalize Expert Bio
 *
 * Rewrites a LinkedIn/PDL bio into a clean third-person paragraph:
 * - Third person ("She leads..." not "I lead...")
 * - No bullets, no line breaks — single paragraph
 * - Professional tone, 100-250 words
 * - Preserves key facts and achievements
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function normalizeBio(params: {
  rawBio: string;
  fullName: string;
  title?: string;
}): Promise<string> {
  const { rawBio, fullName, title } = params;

  if (!rawBio || rawBio.trim().length < 20) {
    return rawBio?.trim() ?? "";
  }

  const start = Date.now();

  try {
    const result = await generateText({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Rewrite this professional bio for ${fullName}${title ? ` (${title})` : ""}.

RULES:
- Write in THIRD PERSON (use their name or "they/them" pronouns)
- Single flowing paragraph, NO bullets, NO line breaks
- Professional tone, 100-250 words
- Preserve all key facts, achievements, and expertise areas
- Do NOT add information that isn't in the original
- If the bio is already in third person and well-formatted, return it with minimal changes

ORIGINAL BIO:
${rawBio}

REWRITTEN BIO:`,
      maxTokens: 500,
    });

    const duration = Date.now() - start;
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "enrichment",
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      durationMs: duration,
    });

    const normalized = result.text?.trim();
    return normalized || rawBio.trim();
  } catch (err) {
    console.error("[NormalizeBio] Failed:", err);
    return rawBio.trim();
  }
}
