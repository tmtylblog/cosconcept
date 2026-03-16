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

  const { summary, roleTitle, companyName } = await req.json();
  if (!summary || summary.length < 10) {
    return Response.json({ condensed: summary ?? "" });
  }

  // If already short enough, just clean up
  if (summary.length <= 500 && !summary.includes("\n") && !summary.includes("•") && !summary.includes("-  ")) {
    return Response.json({ condensed: summary });
  }

  try {
    const start = Date.now();
    const result = await generateText({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Condense this work experience description into 2-3 sentences (max 500 characters). Remove all bullet points and formatting. Write in third person, focusing on impact and outcomes. Keep it as a single flowing paragraph.

Role: ${roleTitle} at ${companyName}

Original:
${summary}

Condensed (max 500 chars, no bullets, third person):`,
      maxTokens: 200,
    });

    const duration = Date.now() - start;
    await logUsage({
      model: "google/gemini-2.0-flash-001",
      feature: "enrichment",
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      durationMs: duration,
    });

    let condensed = result.text?.trim() ?? summary;
    if (condensed.length > 500) condensed = condensed.slice(0, 497) + "...";

    return Response.json({ condensed });
  } catch {
    return Response.json({ condensed: summary.slice(0, 500) });
  }
}
