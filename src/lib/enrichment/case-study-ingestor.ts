/**
 * Case Study Multi-Format Ingestor
 *
 * Handles case study ingestion from multiple sources:
 * 1. Web URL — scrape and AI-extract
 * 2. PDF — extract text, then AI-extract
 * 3. Raw text — direct AI-extraction (for manual paste)
 *
 * Each format feeds into the same AI extraction pipeline
 * that produces structured CaseStudyCosAnalysis data.
 */

import { scrapeUrl } from "./jina-scraper";
import { logEnrichmentStep } from "./audit-logger";
import { classifySourceUrl } from "./source-classifier";
import { ingestYouTube } from "./youtube-ingestor";
import { ingestVimeo } from "./vimeo-ingestor";
import { ingestGoogleSlides, ingestPowerPointOnline } from "./slides-ingestor";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ─────────────────────────────────────────────────

export type CaseStudySourceType =
  | "url"
  | "youtube"
  | "vimeo"
  | "google_slides"
  | "powerpoint_online"
  | "pdf_upload"
  | "pdf"      // legacy alias — treated as pdf_upload
  | "text";

export interface CaseStudyIngestionInput {
  firmId: string;
  sourceType: CaseStudySourceType;
  /** URL for web-based case studies */
  url?: string;
  /** Raw text content (for text paste) */
  rawText?: string;
  /** Original filename (for PDFs) */
  filename?: string;
  /** Vercel Blob URL for uploaded PDFs */
  fileStorageKey?: string;
}

export interface CaseStudyCosAnalysis {
  title: string;
  clientName?: string;
  clientIndustry?: string;
  challenge?: string;
  solution?: string;
  approach?: string;
  outcomes: string[];
  metrics: CaseStudyMetric[];
  servicesUsed: string[];
  skillsDemonstrated: string[];
  industries: string[];
  projectDuration?: string;
  teamSize?: string;
  isCaseStudy: boolean;
  confidence: number;
  /** Thumbnail URL from ingestor (YouTube / Vimeo) — stored but not shown to user directly */
  thumbnailUrl?: string;
  /** Source-specific metadata for the firmCaseStudies.sourceMetadata column */
  sourceMetadata?: {
    videoDuration?: string;
    slideCount?: number;
    transcriptLength?: number;
    videoId?: string;
    thumbnailSource?: string;
  };
}

interface CaseStudyMetric {
  label: string;
  value: string;
  improvement?: string;
}

// ─── Main Ingestion Pipeline ───────────────────────────────

/**
 * Ingest a case study from any supported format.
 *
 * Returns structured COS analysis or null if content
 * is not actually a case study.
 */
export async function ingestCaseStudy(
  input: CaseStudyIngestionInput
): Promise<CaseStudyCosAnalysis | null> {
  const start = Date.now();

  // Step 1: Extract raw text from source
  let rawText: string;
  let sourceTitle = "";
  let thumbnailUrl: string | undefined;
  let sourceMetadata: CaseStudyCosAnalysis["sourceMetadata"];

  // Auto-classify URL sources so callers don't have to do it manually
  const effectiveSourceType =
    input.sourceType === "url" && input.url
      ? classifySourceUrl(input.url)
      : input.sourceType;

  switch (effectiveSourceType) {
    case "url": {
      if (!input.url) throw new Error("URL required for url source type");
      const scraped = await scrapeUrl(input.url);
      rawText = scraped.content;
      sourceTitle = scraped.title;

      await logEnrichmentStep({
        firmId: input.firmId,
        phase: "case_study",
        source: input.url,
        rawInput: `Scraped URL: ${input.url}`,
        rawOutput: rawText.slice(0, 5000),
        status: "success",
        durationMs: Date.now() - start,
      });
      break;
    }

    case "youtube": {
      if (!input.url) throw new Error("URL required for youtube source type");
      const result = await ingestYouTube(input.url);
      rawText = result.rawText;
      sourceTitle = "YouTube Video";
      thumbnailUrl = result.thumbnailUrl ?? undefined;
      sourceMetadata = result.sourceMetadata;
      break;
    }

    case "vimeo": {
      if (!input.url) throw new Error("URL required for vimeo source type");
      const result = await ingestVimeo(input.url);
      rawText = result.rawText;
      sourceTitle = "Vimeo Video";
      thumbnailUrl = result.thumbnailUrl ?? undefined;
      sourceMetadata = result.sourceMetadata;
      break;
    }

    case "google_slides": {
      if (!input.url) throw new Error("URL required for google_slides source type");
      const result = await ingestGoogleSlides(input.url);
      rawText = result.rawText;
      sourceTitle = "Google Slides";
      sourceMetadata = result.sourceMetadata;
      break;
    }

    case "powerpoint_online": {
      if (!input.url) throw new Error("URL required for powerpoint_online source type");
      const result = await ingestPowerPointOnline(input.url);
      rawText = result.rawText;
      sourceTitle = "PowerPoint Online";
      sourceMetadata = result.sourceMetadata;
      break;
    }

    case "pdf_upload":
    case "pdf": {
      // If a Vercel Blob URL is provided, download and parse the PDF
      if (input.fileStorageKey) {
        const buffer = await downloadFromBlob(input.fileStorageKey);
        rawText = await extractTextFromPdf(buffer);
        sourceTitle = input.filename ?? "Uploaded PDF";
      } else if (input.rawText) {
        // Fallback: pre-extracted text passed directly
        rawText = input.rawText;
        sourceTitle = input.filename ?? "Uploaded PDF";
      } else {
        throw new Error("fileStorageKey or rawText required for pdf_upload source type");
      }
      break;
    }

    case "text": {
      if (!input.rawText) throw new Error("rawText required for text source");
      rawText = input.rawText;
      sourceTitle = "Manual Input";
      break;
    }

    default:
      throw new Error(`Unsupported source type: ${input.sourceType}`);
  }

  if (!rawText || rawText.length < 100) {
    return null;
  }

  // Step 2: AI extract structured case study data
  const analysis = await extractCaseStudyAnalysis(
    rawText,
    sourceTitle,
    input.url
  );

  // Audit log the extraction
  await logEnrichmentStep({
    firmId: input.firmId,
    phase: "case_study",
    source: input.url ?? input.sourceType,
    rawInput: rawText.slice(0, 2000),
    extractedData: analysis,
    model: "gemini-flash",
    confidence: analysis?.confidence,
    durationMs: Date.now() - start,
    status: analysis?.isCaseStudy ? "success" : "skipped",
  });

  if (!analysis?.isCaseStudy) return null;

  // Attach thumbnail + source metadata to the analysis object
  return {
    ...analysis,
    thumbnailUrl,
    sourceMetadata,
  };
}

// ─── AI Extraction ─────────────────────────────────────────

async function extractCaseStudyAnalysis(
  content: string,
  title: string,
  url?: string
): Promise<CaseStudyCosAnalysis | null> {
  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `Extract structured case study data from this content.

If this is NOT a case study (just a blog post, generic marketing page, or landing page), set isCaseStudy to false and provide minimal data.

${title ? `TITLE: ${title}` : ""}
${url ? `URL: ${url}` : ""}

CONTENT:
${content.slice(0, 12000)}

Extract as much detail as the content provides. Be precise about metrics and outcomes.`,
      schema: z.object({
        isCaseStudy: z
          .boolean()
          .describe("Is this actually a case study, project showcase, or client success story?"),
        title: z.string().describe("Case study title"),
        clientName: z
          .string()
          .optional()
          .describe("Client company name if mentioned"),
        clientIndustry: z
          .string()
          .optional()
          .describe("Client's industry (e.g., Healthcare, SaaS, Retail)"),
        challenge: z
          .string()
          .optional()
          .describe("The business problem, challenge, or objective"),
        solution: z
          .string()
          .optional()
          .describe("What was delivered or implemented"),
        approach: z
          .string()
          .optional()
          .describe("How the work was approached or the methodology used"),
        outcomes: z
          .array(z.string())
          .describe("Key results stated in the case study"),
        metrics: z
          .array(
            z.object({
              label: z.string().describe("What was measured"),
              value: z.string().describe("The result value"),
              improvement: z
                .string()
                .optional()
                .describe("Change description (e.g., '150% increase')"),
            })
          )
          .describe("Specific quantitative metrics and results"),
        servicesUsed: z
          .array(z.string())
          .describe("Services/capabilities demonstrated (e.g., Brand Strategy, Web Design)"),
        skillsDemonstrated: z
          .array(z.string())
          .describe("Specific tools/skills (e.g., Shopify, Google Ads, React, Figma)"),
        industries: z
          .array(z.string())
          .describe("Industries involved (e.g., Healthcare, FinTech, CPG)"),
        projectDuration: z
          .string()
          .optional()
          .describe("Project timeline if mentioned (e.g., '3 months', '6 weeks')"),
        teamSize: z
          .string()
          .optional()
          .describe("Team size if mentioned (e.g., '4 people', 'cross-functional team of 8')"),
        confidence: z
          .number()
          .describe("Confidence that this is a genuine case study (0-1)"),
      }),
      maxOutputTokens: 1024,
    });

    return result.object;
  } catch (err) {
    console.error("[CaseStudyIngestor] AI extraction failed:", err);
    return null;
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 *
 * Install with: npm install pdf-parse @types/pdf-parse
 * Caps output at 50k characters to keep AI prompts manageable.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import so the package is optional at build time
    const pdfParse = (await import("pdf-parse" as string as any)).default;
    const data = await pdfParse(buffer);
    return (data.text as string).slice(0, 50000);
  } catch (err) {
    console.error("[CaseStudyIngestor] pdf-parse failed:", err);
    // Surface a meaningful error rather than returning empty string
    throw new Error(
      `PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Download a file from Vercel Blob by its URL.
 *
 * The storageKey for Vercel Blob IS the public URL returned at upload time.
 * Requires the Blob store to allow public reads (the default for @vercel/blob).
 */
export async function downloadFromBlob(blobUrl: string): Promise<Buffer> {
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new Error(
      `[CaseStudyIngestor] Failed to download from Blob: ${res.status} ${res.statusText}`
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
