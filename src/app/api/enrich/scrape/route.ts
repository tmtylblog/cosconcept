import { NextResponse } from "next/server";
import { scrapeFirmWebsite } from "@/lib/enrichment/jina-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich/scrape
 *
 * Stage 2 of progressive enrichment — Jina website scrape.
 * Scrapes homepage + subpages, extracts clients/services/team/case studies.
 * Returns ground truth evidence + extracted structured data.
 */
export async function POST(req: Request) {
  try {
    const { url, domain } = (await req.json()) as {
      url: string;
      domain: string;
    };

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    console.log(`[Enrich/Scrape] Starting scrape for: ${domain || url}`);
    const groundTruth = await scrapeFirmWebsite(url);

    const totalPagesScraped = 1 + groundTruth.evidence.length;

    // Build display content from Jina
    let groundTruthContent = "";
    const sections: string[] = [];

    if (groundTruth.homepage.content) {
      const homepageSnippet =
        groundTruth.homepage.content.length > 2000
          ? groundTruth.homepage.content.slice(0, 2000) + "..."
          : groundTruth.homepage.content;
      sections.push(`### Homepage\n${homepageSnippet}`);
    }

    const byCategory: Record<string, string[]> = {};
    for (const ev of groundTruth.evidence) {
      if (!byCategory[ev.category]) byCategory[ev.category] = [];
      const snippet =
        ev.page.content.length > 3000
          ? ev.page.content.slice(0, 3000) + "..."
          : ev.page.content;
      byCategory[ev.category].push(
        `**${ev.page.title || ev.page.url}**\n${snippet}`
      );
    }

    const categoryLabels: Record<string, string> = {
      case_studies: "Case Studies & Portfolio (GROUND TRUTH — highest value)",
      clients: "Clients & Testimonials (proof of relationships)",
      services: "Services & Capabilities",
      team: "Team & Leadership",
      industries: "Industries & Verticals",
    };

    for (const [cat, label] of Object.entries(categoryLabels)) {
      if (byCategory[cat]) {
        sections.push(`### ${label}\n${byCategory[cat].join("\n\n")}`);
      }
    }

    groundTruthContent = sections.join("\n\n---\n\n");
    if (groundTruthContent.length > 12000) {
      groundTruthContent =
        groundTruthContent.slice(0, 12000) + "\n\n[Content truncated]";
    }

    console.log(
      `[Enrich/Scrape] Done: ${totalPagesScraped} pages, ` +
        `${groundTruth.extracted.clients.length} clients, ` +
        `${groundTruth.extracted.services.length} services`
    );

    return NextResponse.json({
      groundTruth: groundTruthContent || null,
      extracted: {
        clients: groundTruth.extracted.clients,
        caseStudyUrls: groundTruth.extracted.caseStudyUrls,
        services: groundTruth.extracted.services,
        aboutPitch: groundTruth.extracted.aboutPitch,
        teamMembers: groundTruth.extracted.teamMembers,
      },
      pagesScraped: totalPagesScraped,
      evidenceCategories: groundTruth.evidence.map((e) => e.category),
      rawContent: groundTruth.rawContent,
    });
  } catch (error) {
    console.error("[Enrich/Scrape] Error:", error);
    return NextResponse.json(
      { error: "Website scrape failed" },
      { status: 500 }
    );
  }
}
