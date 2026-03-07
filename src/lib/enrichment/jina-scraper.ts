/**
 * Jina Reader API — scrapes a website URL and returns clean markdown content.
 * Used during onboarding to pre-populate firm profiles from their website.
 */

const JINA_READER_BASE = "https://r.jina.ai";

export interface JinaScrapeResult {
  url: string;
  title: string;
  content: string;
  description?: string;
  links?: string[];
  scrapedAt: string;
}

/**
 * Scrape a URL using Jina Reader API.
 * Returns clean markdown content extracted from the page.
 */
export async function scrapeUrl(url: string): Promise<JinaScrapeResult> {
  const jinaApiKey = process.env.JINA_API_KEY;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Return-Format": "markdown",
  };

  if (jinaApiKey) {
    headers.Authorization = `Bearer ${jinaApiKey}`;
  }

  const response = await fetch(`${JINA_READER_BASE}/${url}`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Jina scrape failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return {
    url: data.data?.url ?? url,
    title: data.data?.title ?? "",
    content: data.data?.content ?? "",
    description: data.data?.description ?? "",
    links: data.data?.links ?? [],
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape a firm's website and key subpages (about, services, case studies).
 * Returns combined content for AI analysis.
 */
export async function scrapeFirmWebsite(
  websiteUrl: string
): Promise<{
  homepage: JinaScrapeResult;
  subpages: JinaScrapeResult[];
}> {
  // Normalize URL
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, "");

  // Scrape homepage first
  const homepage = await scrapeUrl(baseUrl);

  // Find interesting subpages from homepage links
  const subpagePatterns = [
    /\/about/i,
    /\/services/i,
    /\/what-we-do/i,
    /\/capabilities/i,
    /\/case-stud/i,
    /\/work\b/i,
    /\/portfolio/i,
    /\/clients/i,
    /\/team/i,
    /\/industries/i,
  ];

  const candidateLinks = (homepage.links ?? []).filter((link) => {
    try {
      const linkUrl = new URL(link, baseUrl);
      // Only scrape same-domain links matching patterns
      const homeDomain = new URL(baseUrl).hostname;
      if (linkUrl.hostname !== homeDomain) return false;
      return subpagePatterns.some((p) => p.test(linkUrl.pathname));
    } catch {
      return false;
    }
  });

  // Limit to max 3 subpages to control cost/time
  const subpageUrls = [...new Set(candidateLinks)].slice(0, 3);

  const subpages: JinaScrapeResult[] = [];
  for (const subUrl of subpageUrls) {
    try {
      const result = await scrapeUrl(subUrl);
      subpages.push(result);
    } catch (err) {
      console.warn(`[Jina] Failed to scrape subpage ${subUrl}:`, err);
    }
  }

  return { homepage, subpages };
}
