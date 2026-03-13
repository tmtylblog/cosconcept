/**
 * Preview Generator — acquires a raw thumbnail/screenshot and optionally
 * passes it through Nano Banana Pro to produce a device-mockup composite image.
 *
 * Source-type strategy:
 * - youtube / vimeo: rawThumbnailUrl is already a high-quality image — use directly.
 * - url / google_slides / powerpoint_online: call Microlink.io free screenshot API.
 * - pdf_upload: raw thumbnail not available via URL (pdfjs-dist first-page render
 *   is a future enhancement — skipped for now; returns null).
 *
 * Nano Banana Pro:
 * - When NANO_BANANA_PRO_API_KEY is set, the raw image will be composited into a
 *   device mockup. The actual API call is stubbed pending API key + docs.
 * - When the key is NOT set, the raw image URL is returned as-is (graceful fallback).
 */

import type { CaseStudySourceType } from "./source-classifier";

export async function generateCaseStudyPreview(input: {
  sourceType: CaseStudySourceType;
  rawThumbnailUrl?: string;
  sourceUrl: string;
  title: string;
}): Promise<string | null> {
  try {
    // ── Step 1: Acquire raw image ────────────────────────────

    let rawImageUrl: string | null = null;

    if (input.rawThumbnailUrl) {
      // YouTube and Vimeo ingestors already provide a high-quality thumbnail
      rawImageUrl = input.rawThumbnailUrl;
    } else if (
      input.sourceUrl &&
      input.sourceType !== "pdf_upload" &&
      input.sourceType !== "pdf" as string
    ) {
      // For URL / Google Slides / PowerPoint Online: take a screenshot via Microlink.io
      // Microlink free tier — no API key needed, rate-limited to ~100 req/day per IP.
      // Replace with ScreenshotOne or Nano Banana Pro screenshot when keys are available.
      try {
        const encoded = encodeURIComponent(input.sourceUrl);
        const microlinkUrl = `https://api.microlink.io?url=${encoded}&screenshot=true&embed=screenshot.url&meta=false`;
        const res = await fetch(microlinkUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const data = await res.json();
          rawImageUrl = data?.data?.screenshot?.url ?? null;
        }
      } catch (screenshotErr) {
        console.warn("[PreviewGenerator] Microlink screenshot failed:", screenshotErr);
      }
    }

    if (!rawImageUrl) {
      // pdf_upload + failed screenshots → no preview available yet
      return null;
    }

    // ── Step 2: Nano Banana Pro device mockup ────────────────

    const nanoBananaKey = process.env.NANO_BANANA_PRO_API_KEY;

    if (!nanoBananaKey) {
      // Graceful fallback — store raw image until Nano Banana Pro key is configured
      return rawImageUrl;
    }

    // TODO: Replace with actual Nano Banana Pro API call once key + API docs are provided.
    // Example (placeholder — endpoint/params subject to change):
    //
    // const mockupRes = await fetch("https://api.nanobanana.pro/v1/mockup", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${nanoBananaKey}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     image_url: rawImageUrl,
    //     device: "laptop",
    //     format: "webp",
    //   }),
    // });
    // if (mockupRes.ok) {
    //   const mockupData = await mockupRes.json();
    //   return mockupData.url ?? rawImageUrl;
    // }

    // For now — return raw image (will be replaced with real API call)
    return rawImageUrl;
  } catch (err) {
    console.error("[PreviewGenerator] Failed:", err);
    return null;
  }
}
