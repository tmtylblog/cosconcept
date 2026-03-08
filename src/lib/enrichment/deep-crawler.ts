/**
 * Deep Crawler — Enhanced multi-page website crawl orchestrator.
 *
 * Goes beyond the basic Jina scraper by:
 * 1. Probing sitemap.xml for page discovery
 * 2. Trying common URL patterns (e.g., /about, /services) even if not linked
 * 3. Following internal links from discovered pages
 * 4. AI-classifying each page type for targeted extraction
 * 5. Using AI-powered extractors per page type
 *
 * The basic jina-scraper does homepage + 5 subpages.
 * The deep crawler discovers 10-20+ pages and extracts richer data.
 */

import { scrapeUrl, type JinaScrapeResult } from "./jina-scraper";
import { classifyPageType, type PageType } from "./page-classifier";
import { extractCaseStudyDeep } from "./extractors/case-study-extractor";
import { extractTeamMembers } from "./extractors/team-extractor";
import { extractServicesDeep } from "./extractors/service-extractor";
import { extractClientsWithConfidence } from "./client-extractor";
import { logEnrichmentStep } from "./audit-logger";

// ─── Types ─────────────────────────────────────────────────

export interface CrawledPage {
  url: string;
  scraped: JinaScrapeResult;
  pageType: PageType;
  /** How the page was discovered */
  discoveredVia: "homepage_link" | "sitemap" | "common_probe" | "subpage_link";
}

export interface DeepCrawlResult {
  firmId: string;
  domain: string;
  /** All successfully crawled pages */
  pages: CrawledPage[];
  /** Extracted structured data from AI extractors */
  extracted: {
    caseStudies: ExtractedCaseStudy[];
    teamMembers: ExtractedTeamMember[];
    services: ExtractedService[];
    clients: string[];
    aboutPitch: string;
    caseStudyUrls: string[];
  };
  /** Combined raw content for the AI classifier */
  rawContent: string;
  stats: {
    urlsDiscovered: number;
    pagesCrawled: number;
    pagesClassified: number;
    durationMs: number;
  };
}

export interface ExtractedCaseStudy {
  title: string;
  clientName?: string;
  challenge?: string;
  solution?: string;
  outcomes: string[];
  servicesUsed: string[];
  skills: string[];
  industries: string[];
  sourceUrl: string;
}

export interface ExtractedTeamMember {
  name: string;
  role?: string;
  linkedinUrl?: string;
  bio?: string;
}

export interface ExtractedService {
  name: string;
  description?: string;
  subServices: string[];
}

// ─── Common URL patterns to probe ──────────────────────────

const COMMON_PATHS = [
  "/about",
  "/about-us",
  "/services",
  "/what-we-do",
  "/capabilities",
  "/work",
  "/our-work",
  "/case-studies",
  "/portfolio",
  "/projects",
  "/clients",
  "/team",
  "/people",
  "/leadership",
  "/industries",
  "/contact",
  "/blog",
];

const MAX_PAGES = 30;
const SCRAPE_TIMEOUT_MS = 10000;

// ─── Main orchestrator ─────────────────────────────────────

/**
 * Perform a deep crawl of a firm's website.
 *
 * Discovery strategy:
 * 1. Scrape homepage and extract all internal links
 * 2. Probe sitemap.xml for additional URLs
 * 3. Probe common URL patterns not found via links/sitemap
 * 4. Classify each page type with AI
 * 5. Run targeted extractors per page type
 */
export async function deepCrawlWebsite(params: {
  firmId: string;
  website: string;
  firmName: string;
}): Promise<DeepCrawlResult> {
  const start = Date.now();
  const { firmId, website, firmName } = params;

  let baseUrl = website.trim();
  if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
  baseUrl = baseUrl.replace(/\/$/, "");
  const domain = new URL(baseUrl).hostname;

  // Track all discovered URLs and their sources
  const urlMap = new Map<string, "homepage_link" | "sitemap" | "common_probe" | "subpage_link">();
  urlMap.set(baseUrl, "homepage_link");

  // ── Step 1: Scrape homepage ────────────────────────────
  const homepage = await scrapeWithTimeout(baseUrl);
  if (!homepage) {
    return emptyResult(firmId, domain, Date.now() - start);
  }

  // Extract internal links from homepage
  for (const link of homepage.links ?? []) {
    addInternalUrl(urlMap, link, baseUrl, domain, "homepage_link");
  }

  // ── Step 2: Check sitemap.xml ──────────────────────────
  const sitemapUrls = await discoverFromSitemap(baseUrl);
  for (const url of sitemapUrls) {
    addInternalUrl(urlMap, url, baseUrl, domain, "sitemap");
  }

  // ── Step 3: Probe common paths ─────────────────────────
  for (const path of COMMON_PATHS) {
    const probeUrl = `${baseUrl}${path}`;
    if (!urlMap.has(probeUrl)) {
      urlMap.set(probeUrl, "common_probe");
    }
  }

  // ── Step 4: Prioritize and scrape pages ────────────────
  const prioritized = prioritizeUrls([...urlMap.entries()], baseUrl);
  const pages: CrawledPage[] = [
    {
      url: baseUrl,
      scraped: homepage,
      pageType: "homepage",
      discoveredVia: "homepage_link",
    },
  ];

  // Scrape top pages (skip homepage which we already have)
  const toScrape = prioritized
    .filter(([url]) => url !== baseUrl)
    .slice(0, MAX_PAGES - 1);

  for (const [url, source] of toScrape) {
    const scraped = await scrapeWithTimeout(url);
    if (!scraped || scraped.content.length < 50) continue;

    // AI classify page type
    const pageType = await classifyPageType(scraped.title, scraped.content, url);
    pages.push({ url, scraped, pageType, discoveredVia: source });

    // Discover more links from this page (limited)
    if (pages.length < MAX_PAGES) {
      for (const link of scraped.links ?? []) {
        addInternalUrl(urlMap, link, baseUrl, domain, "subpage_link");
      }
    }
  }

  // ── Step 5: Run targeted extractors ────────────────────
  const caseStudyPages = pages.filter(
    (p) => p.pageType === "case_study" || p.pageType === "portfolio"
  );
  const teamPages = pages.filter((p) => p.pageType === "team");
  const servicePages = pages.filter((p) => p.pageType === "services");
  const clientPages = pages.filter((p) => p.pageType === "clients");
  const aboutPages = pages.filter((p) => p.pageType === "about");

  // Extract case studies with AI
  const caseStudies: ExtractedCaseStudy[] = [];
  for (const page of caseStudyPages) {
    const extracted = await extractCaseStudyDeep(
      page.scraped.title,
      page.scraped.content,
      page.url
    );
    if (extracted) caseStudies.push(...extracted);
  }

  // Extract team members with AI
  let teamMembers: ExtractedTeamMember[] = [];
  for (const page of teamPages) {
    const members = await extractTeamMembers(
      page.scraped.content,
      page.url,
      firmName
    );
    teamMembers.push(...members);
  }
  // Dedupe team members by name
  const seenNames = new Set<string>();
  teamMembers = teamMembers.filter((m) => {
    const key = m.name.toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  // Extract services with AI
  const services: ExtractedService[] = [];
  for (const page of servicePages) {
    const extracted = await extractServicesDeep(
      page.scraped.content,
      page.url
    );
    services.push(...extracted);
  }

  // Extract clients with multi-signal confidence scoring
  const clientResult = await extractClientsWithConfidence({
    homepageContent: homepage.content,
    evidencePages: pages.map((p) => ({
      category: p.pageType,
      content: p.scraped.content,
      url: p.url,
      title: p.scraped.title,
    })),
    caseStudyPages: caseStudyPages.map((p) => ({
      content: p.scraped.content,
      url: p.url,
      title: p.scraped.title,
    })),
  });
  const clients = clientResult.clients;

  // Extract about pitch
  const aboutContent =
    aboutPages.map((p) => p.scraped.content).join("\n") ||
    homepage.description ||
    homepage.content;
  const aboutPitch = extractAboutPitch(aboutContent);

  // Collect all case study URLs (for further deep ingestion)
  const caseStudyUrls = collectCaseStudyUrls(pages, domain);

  // Combine raw content for AI classifier
  const rawContent = pages
    .map((p) => p.scraped.content)
    .join("\n\n")
    .slice(0, 20000);

  // Audit log
  await logEnrichmentStep({
    firmId,
    phase: "deep_crawl",
    source: website,
    rawInput: `Deep crawl: ${domain} (${pages.length} pages)`,
    extractedData: {
      pagesFound: pages.length,
      caseStudies: caseStudies.length,
      teamMembers: teamMembers.length,
      services: services.length,
      clients: clients.length,
    },
    durationMs: Date.now() - start,
    status: "success",
  });

  return {
    firmId,
    domain,
    pages,
    extracted: {
      caseStudies,
      teamMembers,
      services,
      clients,
      aboutPitch,
      caseStudyUrls,
    },
    rawContent,
    stats: {
      urlsDiscovered: urlMap.size,
      pagesCrawled: pages.length,
      pagesClassified: pages.filter((p) => p.pageType !== "other").length,
      durationMs: Date.now() - start,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────

async function scrapeWithTimeout(
  url: string
): Promise<JinaScrapeResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const result = await scrapeUrl(url, { signal: controller.signal });
    clearTimeout(timeout);
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[DeepCrawl] Timeout scraping ${url}`);
    } else {
      console.warn(`[DeepCrawl] Failed to scrape ${url}:`, err);
    }
    return null;
  }
}

/**
 * Discover URLs from sitemap.xml.
 * Handles both plain sitemap.xml and sitemap index files.
 */
async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const response = await fetch(`${baseUrl}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return urls;
    const text = await response.text();

    // Extract URLs from <loc> tags
    const locMatches = text.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
    for (const match of locMatches) {
      const url = match[1].trim();
      if (url && !url.endsWith(".xml")) {
        urls.push(url);
      }
    }

    // Cap at 200 URLs from sitemap
    return urls.slice(0, 200);
  } catch {
    return urls;
  }
}

function addInternalUrl(
  map: Map<string, CrawledPage["discoveredVia"]>,
  rawUrl: string,
  baseUrl: string,
  domain: string,
  source: CrawledPage["discoveredVia"]
) {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    if (parsed.hostname !== domain) return;
    // Skip fragments, query-heavy URLs, and file downloads
    const clean = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
    if (
      clean.match(/\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip|mp4|mp3)$/i) ||
      parsed.search.length > 50
    ) {
      return;
    }
    if (!map.has(clean)) {
      map.set(clean, source);
    }
  } catch {
    /* skip invalid URLs */
  }
}

/**
 * Prioritize URLs by likely data value.
 * Case studies > clients > services > about > team > industries > blog > other
 */
function prioritizeUrls(
  entries: [string, CrawledPage["discoveredVia"]][],
  baseUrl: string
): [string, CrawledPage["discoveredVia"]][] {
  const scored = entries.map(([url, source]) => {
    const path = url.replace(baseUrl, "").toLowerCase();
    let score = 0;

    if (/case|stud|project|work|portfolio|results|success/.test(path))
      score = 100;
    else if (/client|customer|brand|trusted|testimonial/.test(path))
      score = 90;
    else if (/service|capabilit|solution|offering|what-we-do|expertise/.test(path))
      score = 80;
    else if (/about|who-we-are|our-story|mission|company/.test(path))
      score = 70;
    else if (/team|people|leadership/.test(path)) score = 60;
    else if (/industr|sector|vertical|market/.test(path)) score = 50;
    else if (/blog|insight|news|resource/.test(path)) score = 20;
    else score = 10;

    // Boost sitemap discoveries slightly
    if (source === "sitemap") score += 5;

    return { url, source, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => [s.url, s.source]);
}

// Client extraction moved to client-extractor.ts (multi-signal confidence scoring)

function extractAboutPitch(content: string): string {
  if (!content) return "";
  const lines = content
    .split("\n")
    .filter(
      (l) =>
        l.trim().length > 30 &&
        !l.startsWith("#") &&
        !l.startsWith("[") &&
        !l.startsWith("!")
    );
  return lines.slice(0, 5).join("\n").slice(0, 1000);
}

function collectCaseStudyUrls(pages: CrawledPage[], domain: string): string[] {
  const urls = new Set<string>();

  // From classified case study/portfolio pages
  for (const page of pages) {
    if (page.pageType === "case_study" || page.pageType === "portfolio") {
      urls.add(page.url);
    }
  }

  // From links on case study listing pages
  for (const page of pages) {
    if (page.pageType === "portfolio") {
      for (const link of page.scraped.links ?? []) {
        try {
          const parsed = new URL(link, page.url);
          if (
            parsed.hostname === domain &&
            /case|stud|project|work/i.test(parsed.pathname)
          ) {
            urls.add(`${parsed.origin}${parsed.pathname}`);
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  return [...urls].slice(0, 200);
}

function emptyResult(
  firmId: string,
  domain: string,
  durationMs: number
): DeepCrawlResult {
  return {
    firmId,
    domain,
    pages: [],
    extracted: {
      caseStudies: [],
      teamMembers: [],
      services: [],
      clients: [],
      aboutPitch: "",
      caseStudyUrls: [],
    },
    rawContent: "",
    stats: {
      urlsDiscovered: 0,
      pagesCrawled: 0,
      pagesClassified: 0,
      durationMs,
    },
  };
}
