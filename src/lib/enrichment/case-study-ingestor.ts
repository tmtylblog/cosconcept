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
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ─────────────────────────────────────────────────

export type CaseStudySourceType = "url" | "pdf" | "text";

export interface CaseStudyIngestionInput {
  firmId: string;
  sourceType: CaseStudySourceType;
  /** URL for web-based case studies */
  url?: string;
  /** Raw text content (for PDF-extracted or manual paste) */
  rawText?: string;
  /** Original filename (for PDFs) */
  filename?: string;
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

  switch (input.sourceType) {
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

    case "pdf": {
      if (!input.rawText) throw new Error("rawText required for PDF source");
      rawText = input.rawText;
      sourceTitle = input.filename ?? "Uploaded PDF";
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
  return analysis;
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
 * Extract text from a PDF buffer.
 *
 * Uses a simple approach: split by common PDF text markers.
 * For production, integrate pdf-parse or pdfjs-dist.
 *
 * This is a placeholder — real PDF extraction would use:
 *   import pdfParse from 'pdf-parse';
 *   const data = await pdfParse(buffer);
 *   return data.text;
 */
export async function extractTextFromPdf(
  buffer: ArrayBuffer
): Promise<string> {
  // Attempt to extract readable text from PDF buffer
  // This is a basic approach — converts buffer to string and extracts text-like content
  const bytes = new Uint8Array(buffer);
  const text: string[] = [];

  // Look for text between BT/ET (Begin Text/End Text) operators
  // This handles simple PDFs. Complex ones need a real parser.
  let current = "";
  for (let i = 0; i < bytes.length; i++) {
    const char = bytes[i];
    if (char >= 32 && char < 127) {
      current += String.fromCharCode(char);
    } else if (current.length > 3) {
      // Only keep meaningful strings
      if (
        current.length > 10 &&
        /[a-zA-Z]{3,}/.test(current) &&
        !/^[0-9\s.]+$/.test(current)
      ) {
        text.push(current.trim());
      }
      current = "";
    } else {
      current = "";
    }
  }

  const extracted = text.join(" ").replace(/\s+/g, " ");

  if (extracted.length < 50) {
    console.warn("[PDF] Minimal text extracted — may need pdf-parse for this document");
  }

  return extracted;
}
