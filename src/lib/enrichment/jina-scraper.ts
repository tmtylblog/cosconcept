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
  const homeDomain = new URL(baseUrl).hostname;

  // 2. Find and rank subpages from homepage links
  const candidates: { url: string; category: string; priority: number }[] = [];
  for (const link of homepage.links ?? []) {
    try {
      const linkUrl = new URL(link, baseUrl);
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
        const linkUrl = new URL(link, baseUrl);
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

  // 5. Combine all content for the AI Classifier
  const allContent = [
    homepage.content,
    ...evidence.map((e) => e.page.content),
  ].join("\n\n");

  // Truncate to 15k chars max for AI context
  const rawContent =
    allContent.length > 15000 ? allContent.slice(0, 15000) : allContent;

  // 6. Extract structured data (non-taxonomy)
  const extracted: FirmGroundTruth["extracted"] = {
    clients: extractClients(
      evidence
        .filter((e) => e.category === "clients")
        .map((e) => e.page.content)
        .join("\n") || homepage.content
    ),
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

function extractClients(content: string): string[] {
  if (!content) return [];
  const clients = new Set<string>();
  const patterns = [
    // Bold company names (must be 2+ words to avoid nav items)
    /\*\*([A-Z][A-Za-z0-9\s&'.,-]{4,40})\*\*/g,
    // List items that look like company names (2+ capitalized words)
    /^[-*]\s+([A-Z][a-z]+(?:\s+[A-Z&][A-Za-z0-9'.,-]*){1,5})$/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (
        name.length > 4 &&
        name.length < 50 &&
        // Must contain at least one space — real company names are multi-word
        // Single words like "Brand", "Marketing", "Commerce" are divisions, not clients
        name.includes(" ") &&
        // Filter out navigation, UI, and generic web elements
        !name.match(
          /^(Read|Learn|View|See|Get|Our|The|About|Click|Download|Home|Menu|Contact|Blog|Login|Sign|Back|Next|Previous|Footer|Header|Navigation|Skip|Search|Close|Open|Show|Hide|Toggle|Submit|Cancel|Accept|Reject|Dismiss|Loading|Chapter|Section|Page|Slide)/i
        ) &&
        // Filter out generic section/category/business words
        !name.match(
          /^(Solutions?|Services?|Products?|Industries?|Resources?|Company|Capabilities|Insights?|Platform|Overview|Features?|Pricing|Careers?|News|Events?|Partners?|Support|Documentation|FAQ|Help|Legal|Privacy|Terms|Sitemap|Copyright|Descriptions?|Brand|Marketing|Experience|Commerce|Sales|Technology|Digital|Strategy|Creative|Design|Analytics|Consulting|Advisory|Management|Operations|Engineering|Data|Media|Content|Growth|Innovation|Transformation|Performance|Leadership|Culture|Talent|People|Finance|Sustainability|Healthcare|Education|Retail|Automotive|Energy|Real Estate|Government|Nonprofit)\b/i
        ) &&
        // Filter out image references
        !name.match(/^Image\b/i)
      ) {
        clients.add(name);
      }
    }
  }
  return [...clients].slice(0, 50);
}

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
