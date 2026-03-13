/**
 * Vimeo Ingestor — fetches video metadata and transcript.
 *
 * Uses Vimeo oEmbed API (free, no auth) for metadata and thumbnail,
 * and the Vimeo API texttracks endpoint (requires VIMEO_ACCESS_TOKEN)
 * for transcript text.
 *
 * Requires env var: VIMEO_ACCESS_TOKEN
 */

export interface VimeoIngestResult {
  rawText: string;
  thumbnailUrl: string | null;
  sourceMetadata: {
    videoId: string;
    videoDuration?: number;
    transcriptLength?: number;
  };
}

/**
 * Extract the Vimeo video ID from a vimeo.com URL.
 * Handles: vimeo.com/{id}, vimeo.com/channels/.../id, player.vimeo.com/video/{id}
 */
export function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // player.vimeo.com/video/{id}
    const playerMatch = parsed.pathname.match(/\/video\/(\d+)/);
    if (playerMatch) return playerMatch[1];
    // vimeo.com/{id} or vimeo.com/anything/{id}
    const segments = parsed.pathname.split("/").filter(Boolean);
    const numericId = segments.find((s) => /^\d+$/.test(s));
    return numericId ?? null;
  } catch {
    return null;
  }
}

/**
 * Strip WebVTT/SRT markers from a caption file to extract plain text.
 */
function stripVttMarkers(vtt: string): string {
  return vtt
    .replace(/WEBVTT\s*/g, "")
    .replace(/^\d{2}:\d{2}:\d{2}\.\d{3} --> .*$/gm, "")
    .replace(/^\d+$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, " ")
    .trim();
}

/**
 * Ingest a Vimeo video: fetch oEmbed metadata (free), then attempt
 * to download a texttrack (VTT transcript) via the Vimeo API.
 *
 * Falls back to title + description only if no texttracks are available
 * or the access token is not set.
 */
export async function ingestVimeo(url: string): Promise<VimeoIngestResult> {
  const videoId = extractVimeoId(url);
  if (!videoId) {
    throw new Error(`[VimeoIngestor] Could not extract video ID from URL: ${url}`);
  }

  // ── oEmbed (free, no auth needed for public videos) ─────
  let title = "";
  let description = "";
  let thumbnailUrl: string | null = null;
  let videoDuration: number | undefined;

  try {
    const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    const oembedRes = await fetch(oembedUrl);
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title ?? "";
      description = oembed.description ?? "";
      thumbnailUrl = oembed.thumbnail_url ?? null;
      videoDuration = typeof oembed.duration === "number" ? oembed.duration : undefined;
    }
  } catch (err) {
    console.error("[VimeoIngestor] oEmbed fetch failed:", err);
  }

  // ── Transcript via Vimeo API texttracks ─────────────────
  let transcriptText = "";
  let transcriptLength: number | undefined;

  const accessToken = process.env.VIMEO_ACCESS_TOKEN;
  if (accessToken) {
    try {
      const tracksRes = await fetch(
        `https://api.vimeo.com/videos/${videoId}/texttracks`,
        {
          headers: {
            Authorization: `bearer ${accessToken}`,
            Accept: "application/vnd.vimeo.*+json;version=3.4",
          },
        }
      );
      if (tracksRes.ok) {
        const tracksData = await tracksRes.json();
        const firstTrack = tracksData?.data?.[0];
        if (firstTrack?.link) {
          const vttRes = await fetch(firstTrack.link);
          if (vttRes.ok) {
            const vttText = await vttRes.text();
            transcriptText = stripVttMarkers(vttText);
            transcriptLength = transcriptText.length;
          }
        }
      }
    } catch (err) {
      console.warn(
        `[VimeoIngestor] Texttrack fetch failed for ${videoId} — using title + description:`,
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn("[VimeoIngestor] VIMEO_ACCESS_TOKEN not set — skipping transcript");
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
