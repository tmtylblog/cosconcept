/**
 * POST /api/ai/condense-summary
 *
 * Condenses a PDL work experience summary into a clean <=500 char description.
 * No bullets, flowing prose, focused on outcomes.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { summary, roleTitle, companyName, specialistTitle } = await req.json();
  if (!summary || summary.length < 10) {
    return Response.json({ condensed: summary ?? "" });
  }

  try {
    const start = Date.now();
    const result = await generateText({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Rewrite this work experience description into 2-3 clean sentences (max 500 characters total).

Role: ${roleTitle} at ${companyName}
${specialistTitle ? `Specialist Focus: This description is for a specialist profile titled "${specialistTitle}" — emphasize aspects of this role that are relevant to that specialty. Downplay unrelated work.` : ""}

RULES:
- Max 500 characters total
- Remove ALL bullet points, dashes, and formatting
- Write in THIRD PERSON as a single flowing paragraph
- Focus on impact and outcomes, not responsibilities
- If a specialist title is provided, emphasize the parts of this role most relevant to that niche
${specialistTitle ? `- Do NOT include details that conflict with or dilute the "${specialistTitle}" focus` : ""}

Original:
${summary}

Rewritten:`,
      maxTokens: 200,
    });

    const duration = Date.now() - start;
    logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "enrichment",
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      durationMs: duration,
    }).catch(() => {}); // non-blocking

    let condensed = result.text?.trim() ?? summary;
    if (condensed.length > 500) condensed = condensed.slice(0, 497) + "...";

    return Response.json({ condensed });
  } catch (err) {
    console.error("[condense-summary] Error:", err);
    return Response.json({ condensed: summary.slice(0, 500) });
  }
}
