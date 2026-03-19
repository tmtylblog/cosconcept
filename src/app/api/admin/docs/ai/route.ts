/**
 * POST /api/admin/docs/ai
 *
 * AI-assisted documentation editing. Sends the current doc content +
 * user instruction to Claude Sonnet, returns updated markdown.
 * Auth: superadmin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { logUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export async function POST(req: NextRequest) {
  // Auth: superadmin only
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { instruction, currentContent, filePath } = body;

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }
    if (!currentContent || typeof currentContent !== "string") {
      return NextResponse.json({ error: "Missing currentContent" }, { status: 400 });
    }

    const systemPrompt = `You are a technical documentation writer for Collective OS (COS), a partnership-driven growth platform for professional services firms.

Your job is to edit markdown documentation files based on user instructions. You have deep knowledge of the COS platform:
- Built with Next.js 15, TypeScript, Tailwind CSS 4, Neo4j, Neon PostgreSQL, Drizzle ORM
- AI: Claude Sonnet (chat), Gemini Flash (classification), OpenAI (embeddings) via OpenRouter
- Features: Ossy AI consultant, Discover & Matching, Enrichment, Partnerships, Call Intelligence, Email Agent
- Auth: Better Auth with org/role plugins
- Background jobs: Inngest
- Deployment: Vercel

Rules:
- Return ONLY the complete updated markdown document — no explanations, no code fences around it
- Preserve existing content unless the instruction asks to change it
- Use proper markdown formatting (headings, lists, code blocks, tables)
- Be accurate and specific — don't make up feature details
- Keep the same writing style and tone as the existing content
- If adding new sections, place them logically within the document structure`;

    const userPrompt = `File: ${filePath || "unknown"}

Current content:
---
${currentContent}
---

Instruction: ${instruction}

Return the complete updated markdown document:`;

    const startMs = Date.now();
    const result = await generateText({
      model: openrouter.chat("anthropic/claude-sonnet-4"),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 8192,
    });
    const durationMs = Date.now() - startMs;

    await logUsage({
      model: "anthropic/claude-sonnet-4",
      feature: "classification", // reuse existing feature type
      inputTokens: result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.completionTokens ?? 0,
      durationMs,
    });

    // Clean up: remove any wrapping code fences the model might add
    let updatedContent = result.text.trim();
    if (updatedContent.startsWith("```markdown")) {
      updatedContent = updatedContent.slice("```markdown".length);
    } else if (updatedContent.startsWith("```md")) {
      updatedContent = updatedContent.slice("```md".length);
    } else if (updatedContent.startsWith("```")) {
      updatedContent = updatedContent.slice(3);
    }
    if (updatedContent.endsWith("```")) {
      updatedContent = updatedContent.slice(0, -3);
    }
    updatedContent = updatedContent.trim();

    return NextResponse.json({
      updatedContent,
      summary: `AI edited ${filePath || "document"} (${result.usage?.completionTokens ?? 0} tokens, ${(durationMs / 1000).toFixed(1)}s)`,
    });
  } catch (error) {
    console.error("[Docs AI] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
