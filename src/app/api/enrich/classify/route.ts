import { NextResponse } from "next/server";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/enrich/classify
 *
 * AI classification microservice.
 * Takes raw content + context and classifies against the COS taxonomy:
 * - Firm categories (30 COS categories)
 * - Skills (L2 level from 247-item taxonomy)
 * - Industries (verticals)
 * - Markets (countries/regions)
 * - Languages (business languages)
 *
 * No auth required — called by the guest enrichment pipeline before login.
 * Only processes text content, no sensitive user data.
 */
export async function POST(req: Request) {

  try {
    const body = (await req.json()) as {
      rawContent: string;
      pdlSummary?: string;
      services?: string[];
      aboutPitch?: string;
    };

    if (!body.rawContent) {
      return NextResponse.json(
        { error: "rawContent is required" },
        { status: 400 }
      );
    }

    console.log(
      `[Classify] Starting firm classification (${body.rawContent.length} chars)`
    );

    const classification = await classifyFirm(body);

    console.log(
      `[Classify] Done: ${classification.categories.length} categories, ` +
        `${classification.skills.length} skills, ` +
        `${classification.industries.length} industries, ` +
        `${classification.markets.length} markets, ` +
        `${classification.languages.length} languages ` +
        `(confidence: ${classification.confidence.toFixed(2)})`
    );

    return NextResponse.json({ classification });
  } catch (error) {
    console.error("[Classify] Classification error:", error);
    return NextResponse.json(
      { error: "Classification failed" },
      { status: 500 }
    );
  }
}
