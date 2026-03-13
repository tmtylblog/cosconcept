/**
 * YouTube Ingestor — fetches video metadata and transcript.
 *
 * Uses YouTube Data API v3 for metadata (title, description, duration,
 * thumbnail) and the `youtube-transcript` npm package for auto-captions.
 *
 * Requires env var: YOUTUBE_API_KEY
 */

// NOTE: `youtube-transcript` must be installed: npm install youtube-transcript
// import { YoutubeTranscript } from "youtube-transcript";

export interface YouTubeIngestResult {
  rawText: string;
  thumbnailUrl: string | null;
  sourceMetadata: {
    videoId: string;
    videoDuration?: string;
    transcriptLength?: number;
  };
}

/**
 * Extract the YouTube video ID from any common URL format.
 * Handles: watch?v=, youtu.be/, embed/
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // youtu.be/{id}
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0] ?? null;
    }
    // youtube.com/watch?v={id}
    const v = parsed.searchParams.get("v");
    if (v) return v;
    // youtube.com/embed/{id}
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];
    return null;
  } catch {
    return null;
  }
}

/**
 * Ingest a YouTube video: fetch metadata via YouTube Data API v3,
 * then fetch transcript via youtube-transcript package.
 *
 * Falls back to title + description only if transcript is unavailable.
 */
export async function ingestYouTube(url: string): Promise<YouTubeIngestResult> {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    throw new Error(`[YouTubeIngestor] Could not extract video ID from URL: ${url}`);
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("[YouTubeIngestor] YOUTUBE_API_KEY is not set");
  }

  // ── Fetch metadata from YouTube Data API v3 ─────────────
  let title = "";
  let description = "";
  let thumbnailUrl: string | null = null;
  let videoDuration: string | undefined;

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
    );
    if (!metaRes.ok) {
      throw new Error(`YouTube API returned ${metaRes.status}`);
    }
    const meta = await metaRes.json();
    const item = meta?.items?.[0];
    if (item) {
      title = item.snippet?.title ?? "";
      description = item.snippet?.description ?? "";
      videoDuration = item.contentDetails?.duration ?? undefined; // ISO 8601 (e.g. PT3M24S)
      const thumbs = item.snippet?.thumbnails;
      thumbnailUrl =
        thumbs?.maxres?.url ??
        thumbs?.standard?.url ??
        thumbs?.high?.url ??
        null;
    }
  } catch (err) {
    console.error("[YouTubeIngestor] Metadata fetch failed:", err);
  }

  // ── Fetch transcript via youtube-transcript ──────────────
  let transcriptText = "";
  let transcriptLength: number | undefined;

  try {
    // Dynamic import so the package is optional at build time
    // Install with: npm install youtube-transcript
    const { YoutubeTranscript } = await import("youtube-transcript" as string as any);
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    transcriptText = segments.map((s: { text: string }) => s.text).join(" ");
    transcriptLength = transcriptText.length;
  } catch (err) {
    // Transcript unavailable (disabled captions, private video, etc.)
    console.warn(
      `[YouTubeIngestor] Transcript unavailable for ${videoId} — using title + description only:`,
      err instanceof Error ? err.message : err
    );
  }

  // ── Compose rawText ─────────────────────────────────────
  const parts: string[] = [title, description];
  if (transcriptText) {
    parts.push("\n[TRANSCRIPT]\n" + transcriptText);
  }
  const rawText = parts.filter(Boolean).join("\n").trim();

  return {
    rawText,
    thumbnailUrl,
    sourceMetadata: {
      videoId,
      videoDuration,
      transcriptLength,
    },
  };
}
