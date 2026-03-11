/**
 * Jina Reader API — targeted website scraping for Ground Truth data.
 *
 * Jina extracts the RAW EVIDENCE of what a firm has actually done.
 * It does NOT do taxonomy matching — that's the AI Classifier's job.
 *
 * Jina extracts:
 * 1. CLIENTS — names/logos from clients/testimonials pages
 * 2. CASE STUDY URLS — links queued for deep ingestion later
 * 3. SERVICES — what they offer
 * 4. ABOUT / PITCH — who they are, what they do
 * 5. TEAM MEMBERS — names for PDL person enrichment
 * 6. RAW CONTENT — all page text, fed to AI Classifier for taxonomy tagging
 *
 * Ground Truth Principle: what firms have DONE > what they SAY they can do.
 */

import { extractClientsWithConfidence } from "./client-extractor";

const JINA_READER_BASE = "https://r.jina.ai";

// ─── Block / CF detection ─────────────────────────────────

const CF_BLOCK_PATTERNS = [
  /just a moment/i,
  /checking your browser/i,
  /enable javascript and cookies/i,
  /ddos protection/i,
  /verify you are human/i,
  /access denied/i,
];

/**
 * Returns true if scraped content looks like a bot-protection page
 * (Cloudflare challenge, access denied, or suspiciously empty).
 * Exported so deep-crawler can reuse the same check.
 */
export function isBlockedContent(content: string): boolean {
  if (!content || content.length < 200) return true;
  return CF_BLOCK_PATTERNS.some((p) => p.test(content));
}

export interface JinaScrapeResult {
  url: string;
  title: string;
  content: string;
  description?: string;
  links?: string[];
  scrapedAt: string;
}

/**
 * Pages we target, ranked by data value.
 */
const TARGET_PAGES: {
  category: string;
  dataTarget: string;
  patterns: RegExp[];
  priority: number;
}[] = [
  {
    category: "case_studies",
    dataTarget: "Case study URLs for later deep ingestion",
    patterns: [
      /\/case.?stud/i,
      /\/success.?stor/i,
      /\/results/i,
      /\/our-work/i,
      /\/work\b/i,
      /\/portfolio/i,
      /\/projects/i,
    ],
    priority: 1,
  },
  {
    category: "clients",
    dataTarget: "Client names/logos for clients DB",
    patterns: [
      /\/clients/i,
      /\/customers/i,
      /\/brands/i,
      /\/who-we-work/i,
      /\/trusted.?by/i,
      /\/testimonial/i,
    ],
    priority: 2,
  },
  {
    category: "services",
    dataTarget: "Services/solutions list for firm profile",
    patterns: [
      /\/services/i,
      /\/what-we-do/i,
      /\/capabilities/i,
      /\/solutions/i,
      /\/offerings/i,
      /\/expertise/i,
      /\/how-we-help/i,
    ],
    priority: 3,
  },
  {
    category: "about",
    dataTarget: "About/pitch for general analysis",
    patterns: [
      /\/about/i,
      /\/who-we-are/i,
      /\/our-story/i,
      /\/mission/i,
      /\/company/i,
    ],
    priority: 4,
  },
  {
    category: "industries",
    dataTarget: "Industries/verticals the firm serves",
    patterns: [
      /\/industr/i,
      /\/sectors/i,
      /\/verticals/i,
      /\/markets/i,
    ],
    priority: 5,
  },
  {
    category: "team",
    dataTarget: "Team members for PDL person enrichment",
    patterns: [
      /\/team/i,
      /\/people/i,
      /\/leadership/i,
    ],
    priority: 6,
  },
];

/** Scrape a single URL using Jina Reader API. */
export async function scrapeUrl(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<JinaScrapeResult> {
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
    signal: options?.signal,
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

// ─── Structured extraction results ─────────────────────────

export interface FirmGroundTruth {
  homepage: JinaScrapeResult;
  evidence: { category: string; page: JinaScrapeResult }[];
  /** Raw structured data extracted from page content */
  extracted: {
    /** Client names from clients/testimonials pages */
    clients: string[];
    /** Case study URLs queued for later deep ingestion */
    caseStudyUrls: string[];
    /** Services/solutions the firm offers */
    services: string[];
    /** About/pitch — concise firm description */
    aboutPitch: string;
    /** Team member names for PDL person lookup */
    teamMembers: string[];
  };
  /** ALL scraped content combined — fed to AI Classifier for taxonomy tagging */
  rawContent: string;
  /** Page titles for context */
  pageTitles: string[];
}

/**
 * Scrape a firm's website and extract structured Ground Truth data.
 *
 * This extracts RAW content and structured data (clients, case studies, etc.)
 * Taxonomy classification (skills, categories, markets, languages, industries)
 * is handled separately by the AI Classifier service.
 */
export async function scrapeFirmWebsite(
  websiteUrl: string
): Promise<FirmGroundTruth> {
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
  baseUrl = baseUrl.replace(/\/$/, "");

  // 1. Scrape homepage
  const homepage = await scrapeUrl(baseUrl);

  // Detect redirect: if Jina followed a redirect, the actual URL will differ
  // from our input. Use the actual URL's domain for link filtering so subpage
  // links from the redirected domain aren't incorrectly filtered out.
  const actualUrl = homepage.url || baseUrl;
  const homeDomain = new URL(actualUrl).hostname;
  const inputDomain = new URL(baseUrl).hostname;
  if (homeDomain !== inputDomain) {
    console.log(`[Jina] Redirect detected: ${inputDomain} → ${homeDomain}`);
  }

  // 2. Find and rank subpages from homepage links
  const candidates: { url: string; category: string; priority: number }[] = [];
  for (const link of homepage.links ?? []) {
    try {
      const linkUrl = new URL(link, actualUrl);
      if (linkUrl.hostname !== homeDomain) continue;
      for (const target of TARGET_PAGES) {
        if (target.patterns.some((p) => p.test(linkUrl.pathname))) {
          candidates.push({
            url: linkUrl.href,
            category: target.category,
            priority: target.priority,
          });
          break;
        }
      }
    } catch {
      /* skip invalid URLs */
    }
  }

  // Deduplicate and sort by priority
  const seen = new Set<string>();
  const unique = candidates
    .sort((a, b) => a.priority - b.priority)
    .filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });

  // 3. Scrape top 5 priority subpages
  const evidence: FirmGroundTruth["evidence"] = [];
  for (const candidate of unique.slice(0, 5)) {
    try {
      const page = await scrapeUrl(candidate.url);
      evidence.push({ category: candidate.category, page });
    } catch (err) {
      console.warn(
        `[Jina] Failed: ${candidate.category} ${candidate.url}:`,
        err
      );
    }
  }

  // 4. Collect ALL case study URLs (even unscraped) for later ingestion
  const caseStudyUrls = unique
    .filter((c) => c.category === "case_studies")
    .map((c) => c.url);

  for (const ev of evidence.filter((e) => e.category === "case_studies")) {
    for (const link of ev.page.links ?? []) {
      try {
        const linkUrl = new URL(link, actualUrl);
        if (
          linkUrl.hostname === homeDomain &&
          /case|stud|project|work|portfolio/i.test(linkUrl.pathname) &&
          !caseStudyUrls.includes(linkUrl.href)
        ) {
          caseStudyUrls.push(linkUrl.href);
        }
      } catch {
        /* skip */
      }
    }
  }

  // 5. Scrape top 3 case study URLs for smart client extraction
  // Sequential with jitter delay to avoid CF bot-pattern detection
  const caseStudyPages: { content: string; url: string; title: string }[] = [];
  const csUrlsToScrape = [...new Set(caseStudyUrls)].slice(0, 3);
  for (const csUrl of csUrlsToScrape) {
    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const result = await scrapeUrl(csUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!isBlockedContent(result.content)) {
        caseStudyPages.push({
          content: result.content,
          url: csUrl,
          title: result.title,
        });
      } else {
        console.warn(`[Jina] Block detected at ${csUrl}`);
      }
    } catch {
      /* skip — timeout or scrape error */
    }
  }

  // 6. Combine all content for the AI Classifier
  const allContent = [
    homepage.content,
    ...evidence.map((e) => e.page.content),
  ].join("\n\n");

  // Truncate to 15k chars max for AI context
  const rawContent =
    allContent.length > 15000 ? allContent.slice(0, 15000) : allContent;

  // 7. Extract structured data (non-taxonomy)
  // Client extraction uses multi-signal confidence scoring
  const clientResult = await extractClientsWithConfidence({
    homepageContent: homepage.content,
    evidencePages: evidence.map((e) => ({
      category: e.category,
      content: e.page.content,
      url: e.page.url,
      title: e.page.title,
    })),
    caseStudyPages,
  });

  const extracted: FirmGroundTruth["extracted"] = {
    clients: clientResult.clients,
    caseStudyUrls: [...new Set(caseStudyUrls)].slice(0, 50),
    services: extractListItems(
      evidence
        .filter((e) => e.category === "services")
        .map((e) => e.page.content)
        .join("\n")
    ),
    aboutPitch: extractAboutPitch(
      evidence
        .filter((e) => e.category === "about")
        .map((e) => e.page.content)
        .join("\n") ||
        homepage.description ||
        homepage.content
    ),
    teamMembers: extractTeamNames(
      evidence
        .filter((e) => e.category === "team")
        .map((e) => e.page.content)
        .join("\n")
    ),
  };

  const pageTitles = [
    homepage.title,
    ...evidence.map((e) => e.page.title),
  ].filter(Boolean);

  return { homepage, evidence, extracted, rawContent, pageTitles };
}

// ─── Extraction helpers ───────────────────────────────────
// These extract STRUCTURED data from page content.
// NO taxonomy matching — that's handled by the AI Classifier.
// Client extraction moved to client-extractor.ts (multi-signal confidence scoring).


function extractListItems(content: string): string[] {
  if (!content) return [];
  const items = new Set<string>();
  const patterns = [
    /^[-*]\s+\*?\*?([^*\n]{3,80})\*?\*?\s*$/gm,
    /^#{1,3}\s+([^#\n]{3,80})$/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const item = match[1].trim();
      if (
        item.length > 3 &&
        !item.match(
          /^(Home|Menu|Contact|About|Blog|Login|Sign|Back|Next|Previous|Footer|Header|Navigation|Skip|Search|Close|Chapter|Slide|Read|Learn|View|See|Get|Our|The|Click|Download)/i
        ) &&
        // Filter out generic nav/web/business terms
        !item.match(
          /^(Solutions?|Products?|Industries?|Resources?|Company|Insights?|Platform|Overview|Pricing|Careers?|News|Events?|Partners?|Support|Documentation|FAQ|Help|Legal|Privacy|Terms|Sitemap|Copyright|Descriptions?|Brand|Marketing|Experience|Commerce|Sales|Technology|Digital|Strategy|Creative|Design|Analytics|Consulting|Advisory|Management|Operations|Engineering|Data|Media|Content|Growth|Innovation|Transformation|Performance|Leadership|Culture|Talent|People|Finance|Sustainability)\s*$/i
        ) &&
        // Filter out image references
        !item.match(/^Image\b/i)
      ) {
        items.add(item);
      }
    }
  }
  return [...items].slice(0, 30);
}

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

function extractTeamNames(content: string): string[] {
  if (!content) return [];
  const names = new Set<string>();
  const patterns = [
    /^#{1,3}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*$/gm,
    /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\*\*/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (
        name.length > 4 &&
        name.length < 40 &&
        !name.match(
          /^(Our |The |About |Meet |Contact |Read |Learn |View |Get |See )/i
        )
      ) {
        names.add(name);
      }
    }
  }
  return [...names].slice(0, 20);
}
