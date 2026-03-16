/**
 * Intelligent Crawler — replaces deepCrawlWebsite with a context-aware,
 * LLM-guided approach.
 *
 * Three phases:
 * 1. Firm Intelligence — LLM reads homepage, understands the firm, picks URLs
 * 2. Targeted Extraction — unified extractor on each selected page
 * 3. Synthesis — merge all extractions into DeepCrawlResult
 *
 * Returns the same DeepCrawlResult interface as deepCrawlWebsite for
 * backward compatibility with all downstream consumers.
 */

import { scrapeUrl, isBlockedContent, type JinaScrapeResult } from "./jina-scraper";
import { analyzeFirmHomepage, buildFallbackScrapePlan, type FirmIntelligence } from "./firm-intelligence";
import { extractPageUnified, type UnifiedPageExtraction } from "./targeted-extractor";
import { synthesizeExtractions } from "./extraction-synthesizer";
import { logEnrichmentStep } from "./audit-logger";
import type { DeepCrawlResult, CrawledPage } from "./deep-crawler";

const SCRAPE_TIMEOUT_MS = 15000;

/** Extract links from markdown content when Jina doesn't return a links array */
function extractLinksFromMarkdown(content: string, domain: string): string[] {
  const linkRegex = /\[([^\]]*?)\]\((https?:\/\/[^)]+)\)/g;
  const links = new Set<string>();
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2];
    try {
      const parsed = new URL(url);
      const linkDomain = parsed.hostname.replace(/^www\./, "");
      // Only internal links, skip assets
      if (linkDomain === domain && !/\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js|ico|woff|mp4)/i.test(url)) {
        links.add(url);
      }
    } catch {
      // skip invalid URLs
    }
  }
  return [...links];
}

// Jitter delay between scrapes to avoid rate limiting (3-6 seconds)
function sleep(): Promise<void> {
  const ms = 3000 + Math.random() * 3000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeWithTimeout(url: string): Promise<JinaScrapeResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const result = await scrapeUrl(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (isBlockedContent(result.content)) {
      console.warn(`[IntelligentCrawl] Block detected at ${url}`);
      return null;
    }
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[IntelligentCrawl] Timeout scraping ${url}`);
    } else {
      console.warn(`[IntelligentCrawl] Failed to scrape ${url}:`, err);
    }
    return null;
  }
}

function emptyResult(firmId: string, domain: string, durationMs: number): DeepCrawlResult {
  return {
    firmId,
    domain,
    pages: [],
    extracted: {
      caseStudies: [],
      teamMembers: [],
      services: [],
      clients: [],
      clientSignals: [],
      aboutPitch: "",
      caseStudyUrls: [],
      clientsNdaProtected: false,
    },
    rawContent: "",
    stats: { urlsDiscovered: 0, pagesCrawled: 0, pagesClassified: 0, durationMs },
  };
}

// ─── Main Orchestrator ──────────────────────────────────────

export async function intelligentCrawlWebsite(params: {
  firmId: string;
  website: string;
  firmName: string;
}): Promise<DeepCrawlResult> {
  const start = Date.now();
  const { firmId, website, firmName } = params;

  let baseUrl = website.trim();
  if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
  baseUrl = baseUrl.replace(/\/$/, "");
  const domain = new URL(baseUrl).hostname.replace(/^www\./, "");

  console.log(`[IntelligentCrawl] Starting for ${firmName} (${baseUrl})`);

  // ── Step 1: Scrape homepage ─────────────────────────────
  const homepage = await scrapeWithTimeout(baseUrl);
  if (!homepage) {
    console.warn(`[IntelligentCrawl] Homepage unreachable for ${baseUrl}`);
    await logEnrichmentStep({
      firmId,
      phase: "deep_crawl",
      source: website,
      rawInput: `Intelligent crawl: homepage unreachable`,
      status: "error",
      errorMessage: "Homepage unreachable or blocked",
      durationMs: Date.now() - start,
    });
    return emptyResult(firmId, domain, Date.now() - start);
  }

  // Ensure homepage has links — extract from markdown if Jina didn't return them
  if (!homepage.links || homepage.links.length === 0) {
    homepage.links = extractLinksFromMarkdown(homepage.content, domain);
  }

  const pages: CrawledPage[] = [
    { url: baseUrl, scraped: homepage, pageType: "homepage", discoveredVia: "homepage_link" },
  ];

  // ── Step 2: Phase 1 — Firm Intelligence ─────────────────
  let intelligence: FirmIntelligence;
  let scrapePlan: FirmIntelligence["scrapePlan"];

  try {
    intelligence = await analyzeFirmHomepage(homepage, firmName);
    scrapePlan = intelligence.scrapePlan;
    console.log(
      `[IntelligentCrawl] Phase 1 complete: ${intelligence.understanding.serviceModel} firm, ` +
      `${intelligence.homepageExtractions.offerings.length} homepage offerings, ` +
      `${scrapePlan.length} pages to scrape`
    );
  } catch (err) {
    console.warn(`[IntelligentCrawl] Phase 1 failed, using fallback:`, err);
    // Build a minimal intelligence from what we have
    intelligence = {
      understanding: {
        summary: `${firmName} is a professional services firm.`,
        serviceModel: "unclear",
        offeringTerminology: "Services",
        evidenceTerminology: "Case Studies",
      },
      homepageExtractions: {
        offerings: [],
        evidenceOfWork: [],
        clientSignals: [],
        teamMentions: [],
      },
      scrapePlan: buildFallbackScrapePlan(baseUrl),
    };
    scrapePlan = intelligence.scrapePlan;
  }

  // ── Step 3: Phase 2 — Scrape & Extract sub-pages ────────
  const pageExtractions: Array<{ url: string; extraction: UnifiedPageExtraction }> = [];

  // Resolve relative URLs and deduplicate
  const urlsToScrape = new Set<string>();
  for (const item of scrapePlan) {
    let url = item.url;
    if (url.startsWith("/")) {
      url = `${baseUrl}${url}`;
    } else if (!url.startsWith("http")) {
      url = `${baseUrl}/${url}`;
    }
    // Skip the homepage (already scraped) and external URLs
    if (url === baseUrl || url === `${baseUrl}/`) continue;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.replace(/^www\./, "") !== domain) continue;
      urlsToScrape.add(url);
    } catch {
      continue;
    }
  }

  console.log(`[IntelligentCrawl] Phase 2: scraping ${urlsToScrape.size} pages`);

  for (const url of urlsToScrape) {
    await sleep(); // Rate limit
    const scraped = await scrapeWithTimeout(url);
    if (!scraped || scraped.content.length < 100) continue;

    pages.push({
      url,
      scraped,
      pageType: "other", // Not classifying — the unified extractor handles everything
      discoveredVia: "homepage_link",
    });

    try {
      const extraction = await extractPageUnified(scraped.content, url, intelligence);
      pageExtractions.push({ url, extraction });
      console.log(
        `[IntelligentCrawl] Extracted ${url}: ` +
        `${extraction.offerings.length} offerings, ` +
        `${extraction.evidenceOfWork.length} evidence, ` +
        `${extraction.clientSignals.length} clients, ` +
        `${extraction.teamMembers.length} team`
      );
    } catch (err) {
      console.warn(`[IntelligentCrawl] Extraction failed for ${url}:`, err);
    }
  }

  // ── Step 4: Phase 3 — Synthesis ─────────────────────────
  const rawContent = pages
    .map((p) => p.scraped.content)
    .join("\n\n")
    .slice(0, 20000);

  const result = synthesizeExtractions({
    firmId,
    domain,
    intelligence,
    pageExtractions,
    pages,
    rawContent,
    startTime: start,
  });

  // ── Audit log ───────────────────────────────────────────
  await logEnrichmentStep({
    firmId,
    phase: "deep_crawl",
    source: website,
    rawInput: `Intelligent crawl: ${domain} (${pages.length} pages, ${scrapePlan.length} planned)`,
    extractedData: {
      pagesFound: pages.length,
      serviceModel: intelligence.understanding.serviceModel,
      offeringTerminology: intelligence.understanding.offeringTerminology,
      evidenceTerminology: intelligence.understanding.evidenceTerminology,
      services: result.extracted.services.length,
      caseStudies: result.extracted.caseStudies.length,
      clients: result.extracted.clients.length,
      teamMembers: result.extracted.teamMembers.length,
      caseStudyUrls: result.extracted.caseStudyUrls.length,
    },
    durationMs: Date.now() - start,
    status: "success",
  });

  console.log(
    `[IntelligentCrawl] Done for ${firmName}: ` +
    `${result.extracted.services.length} services, ` +
    `${result.extracted.caseStudies.length} case studies, ` +
    `${result.extracted.clients.length} clients, ` +
    `${result.extracted.teamMembers.length} team — ` +
    `${((Date.now() - start) / 1000).toFixed(1)}s`
  );

  return result;
}
