import { NextResponse } from "next/server";
import { scrapeFirmWebsite } from "@/lib/enrichment/jina-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich/website
 * Scrapes a firm's website using Jina Reader API and returns structured content.
 * Can be called from chat (guest or authenticated) when user provides their URL.
 */
export async function POST(req: Request) {
  try {
    const { url, organizationId } = (await req.json()) as {
      url: string;
      organizationId?: string;
    };

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate it looks like a real URL
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    try {
      new URL(normalized);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    console.log(`[Enrich] Scraping website: ${normalized}`);
    const result = await scrapeFirmWebsite(normalized);

    // Combine content for a summary
    const allContent = [
      result.homepage.content,
      ...result.subpages.map((s) => s.content),
    ].join("\n\n---\n\n");

    // Truncate to prevent extremely large payloads
    const truncatedContent =
      allContent.length > 15000
        ? allContent.slice(0, 15000) + "\n\n[Content truncated]"
        : allContent;

    console.log(
      `[Enrich] Scraped ${1 + result.subpages.length} pages, ` +
        `${truncatedContent.length} chars total`
    );

    return NextResponse.json({
      url: normalized,
      title: result.homepage.title,
      description: result.homepage.description,
      content: truncatedContent,
      pagesScraped: 1 + result.subpages.length,
      subpages: result.subpages.map((s) => ({
        url: s.url,
        title: s.title,
      })),
    });
  } catch (error) {
    console.error("[Enrich] Website scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape website. Please check the URL and try again." },
      { status: 500 }
    );
  }
}
