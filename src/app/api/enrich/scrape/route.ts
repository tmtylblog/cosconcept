import { NextResponse } from "next/server";
import { scrapeFirmWebsite } from "@/lib/enrichment/jina-scraper";
import { extractServicesDeep } from "@/lib/enrichment/extractors/service-extractor";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { recordExtractionOutcome } from "@/lib/enrichment/extraction-learner";
import { getExtractionHints } from "@/lib/enrichment/extraction-learner";

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
  const startTime = Date.now();
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
    const servicesPageFound = groundTruth.evidence.some(e => e.category === "services");
    const caseStudiesPageFound = groundTruth.evidence.some(e => e.category === "case_studies");

    // ─── AI service extraction fallback if regex found < 3 services ───
    let usedAiExtractor = false;
    let servicesDetailed: { name: string; description?: string; subServices: string[] }[] = [];
    let finalServices = groundTruth.extracted.services;

    if (finalServices.length < 3) {
      try {
        // Get hints from previous failures + manual corrections
        const hints = await getExtractionHints(domain);

        // Use services page content, or homepage as fallback
        const servicesContent = groundTruth.evidence
          .filter(e => e.category === "services")
          .map(e => e.page.content)
          .join("\n") || groundTruth.homepage.content;

        let contentForAi = servicesContent;
        // Append hints from previous manual corrections
        if (hints.manuallyAddedServices.length > 0) {
          contentForAi += `\n\n[CONTEXT: Previous users manually added these services that auto-extraction missed: ${hints.manuallyAddedServices.join(", ")}. Look harder for similar items.]`;
        }

        const aiServices = await extractServicesDeep(
          contentForAi,
          url
        );
        usedAiExtractor = true;

        if (aiServices.length > 0) {
          servicesDetailed = aiServices;
          finalServices = aiServices.map(s => s.name);
          console.log(`[Enrich/Scrape] AI extractor found ${aiServices.length} services (regex had ${groundTruth.extracted.services.length})`);
        }
      } catch (err) {
        console.warn("[Enrich/Scrape] AI service extraction failed:", err);
      }
    }

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
        `${finalServices.length} services` +
        (usedAiExtractor ? " (AI extractor)" : "")
    );

    // ─── Audit logging (Change 8) ────────────────────────────
    await logEnrichmentStep({
      phase: "jina",
      source: url,
      rawInput: domain,
      extractedData: {
        servicesFound: finalServices.length,
        caseStudyUrlsFound: groundTruth.extracted.caseStudyUrls.length,
        clientsFound: groundTruth.extracted.clients.length,
        teamMembersFound: groundTruth.extracted.teamMembers.length,
        pagesScraped: totalPagesScraped,
        aiExtractorUsed: usedAiExtractor,
        servicesPageFound,
        caseStudiesPageFound,
      },
      status: finalServices.length === 0 && groundTruth.extracted.caseStudyUrls.length === 0
        ? "error" : "success",
      errorMessage: finalServices.length === 0
        ? `No services found for ${domain}. Pages scraped: ${totalPagesScraped}. Services page found: ${servicesPageFound}. AI extractor used: ${usedAiExtractor}`
        : undefined,
      durationMs: Date.now() - startTime,
    });

    // ─── Extraction outcome tracking (Change 9b) ─────────────
    if (finalServices.length === 0) {
      await recordExtractionOutcome({
        domain,
        extractionType: "services",
        autoExtractedCount: 0,
        failureReason: !servicesPageFound ? "no_services_page"
          : usedAiExtractor ? "ai_empty"
          : "regex_filtered",
      });
    }

    if (groundTruth.extracted.caseStudyUrls.length === 0) {
      await recordExtractionOutcome({
        domain,
        extractionType: "case_studies",
        autoExtractedCount: 0,
        failureReason: !caseStudiesPageFound ? "no_case_study_urls" : "blocked",
      });
    }

    return NextResponse.json({
      groundTruth: groundTruthContent || null,
      extracted: {
        clients: groundTruth.extracted.clients,
        caseStudyUrls: groundTruth.extracted.caseStudyUrls,
        services: finalServices,
        servicesDetailed: servicesDetailed.length > 0 ? servicesDetailed : undefined,
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
