/**
 * Slides Ingestor — ingests content from Google Slides and PowerPoint Online.
 *
 * Google Slides: uses the public /export/txt endpoint (no API key needed for
 * publicly shared presentations). Falls back to Jina scrape of /pub URL.
 *
 * PowerPoint Online (OneDrive / SharePoint): Jina scrape of the viewer URL.
 */

import { scrapeUrl } from "./jina-scraper";

export interface SlidesIngestResult {
  rawText: string;
  thumbnailUrl: null;
  sourceMetadata: {
    slideCount?: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract the Google Slides presentation ID from a docs.google.com URL.
 * Example: https://docs.google.com/presentation/d/PRESENTATION_ID/edit
 */
function extractGoogleSlidesId(url: string): string | null {
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

/**
 * Estimate slide count from exported text by counting page-break-like
 * patterns (blank lines between sections).
 */
function estimateSlideCount(text: string): number {
  // Heuristic: double newlines in exported text roughly correspond to slide boundaries
  const separators = (text.match(/\n{2,}/g) ?? []).length;
  return Math.max(1, Math.ceil(separators / 2));
}

// ─── Google Slides ──────────────────────────────────────────

/**
 * Ingest a Google Slides presentation.
 *
 * Strategy:
 * 1. Try the /export/txt endpoint (works for publicly shared presentations).
 * 2. If that fails (private/restricted): Jina scrape the /pub URL.
 */
export async function ingestGoogleSlides(url: string): Promise<SlidesIngestResult> {
  const presentationId = extractGoogleSlidesId(url);
  if (!presentationId) {
    throw new Error(`[SlidesIngestor] Could not extract presentation ID from URL: ${url}`);
  }

  // Attempt 1: Export as plain text (works for publicly shared slides)
  try {
    const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/txt`;
    const res = await fetch(exportUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; COS-CaseStudyIngestor/1.0)",
      },
    });

    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.length >= 100) {
        return {
          rawText: text.slice(0, 50000),
          thumbnailUrl: null,
          sourceMetadata: { slideCount: estimateSlideCount(text) },
        };
      }
    }
  } catch (err) {
    console.warn(
      "[SlidesIngestor] Google Slides export/txt failed — trying /pub fallback:",
      err instanceof Error ? err.message : err
    );
  }

  // Attempt 2: Jina scrape the /pub URL
  const pubUrl = `https://docs.google.com/presentation/d/${presentationId}/pub`;
  try {
    const scraped = await scrapeUrl(pubUrl);
    const text = scraped.content.trim();
    return {
      rawText: text.slice(0, 50000),
      thumbnailUrl: null,
      sourceMetadata: { slideCount: estimateSlideCount(text) },
    };
  } catch (err) {
    console.error("[SlidesIngestor] Google Slides /pub Jina scrape failed:", err);
    throw new Error(
      `[SlidesIngestor] Could not extract content from Google Slides presentation: ${url}`
    );
  }
}

// ─── PowerPoint Online ──────────────────────────────────────

/**
 * Ingest a PowerPoint Online (OneDrive / SharePoint) presentation.
 *
 * Strategy: Jina scrape the viewer URL for best-effort HTML render.
 * This is a best-effort approach — rendering fidelity depends on the
 * specific SharePoint / OneDrive viewer behaviour.
 */
export async function ingestPowerPointOnline(url: string): Promise<SlidesIngestResult> {
  try {
    const scraped = await scrapeUrl(url);
    const text = scraped.content.trim();
    return {
      rawText: text.slice(0, 50000),
      thumbnailUrl: null,
      sourceMetadata: {},
    };
  } catch (err) {
    console.error("[SlidesIngestor] PowerPoint Online Jina scrape failed:", err);
    throw new Error(
      `[SlidesIngestor] Could not extract content from PowerPoint Online URL: ${url}`
    );
  }
}
