/**
 * Enrichment Audit Logger
 *
 * Logs every enrichment step with raw input/output for admin inspection.
 * This creates a complete audit trail of what data was collected,
 * what models were used, and what was stored.
 */

import { db } from "@/lib/db";
import { enrichmentAuditLog } from "@/lib/db/schema";

type AuditPhase =
  | "pdl"
  | "jina"
  | "classifier"
  | "linkedin"
  | "case_study"
  | "onboarding"
  | "memory"
  | "deep_crawl"
  | "team-ingest";

interface AuditLogParams {
  firmId?: string;
  userId?: string;
  phase: AuditPhase;
  source: string;
  rawInput?: string;
  rawOutput?: string;
  extractedData?: unknown;
  model?: string;
  costUsd?: number;
  confidence?: number;
  durationMs?: number;
  status?: "success" | "error" | "skipped";
  errorMessage?: string;
}

/**
 * Log an enrichment step to the audit trail.
 *
 * Truncates raw input/output to 50KB to avoid bloating the database
 * while still preserving enough data for admin inspection.
 */
export async function logEnrichmentStep(params: AuditLogParams): Promise<string> {
  const id = generateId();

  const truncate = (s?: string, max = 50000) =>
    s && s.length > max ? s.slice(0, max) + `\n\n[TRUNCATED: ${s.length} total chars]` : s;

  try {
    await db.insert(enrichmentAuditLog).values({
      id,
      firmId: params.firmId ?? null,
      userId: params.userId ?? null,
      phase: params.phase,
      source: params.source,
      rawInput: truncate(params.rawInput),
      rawOutput: truncate(params.rawOutput),
      extractedData: params.extractedData ?? null,
      model: params.model ?? null,
      costUsd: params.costUsd ?? null,
      confidence: params.confidence ?? null,
      durationMs: params.durationMs ?? null,
      status: params.status ?? "success",
      errorMessage: params.errorMessage ?? null,
    });
  } catch (err) {
    // Don't let audit logging failures break the enrichment pipeline
    console.error("[AuditLogger] Failed to log:", err);
  }

  return id;
}

/**
 * Convenience wrapper that times an enrichment operation and logs the result.
 */
export async function withAuditLog<T>(
  params: Omit<AuditLogParams, "durationMs" | "status" | "errorMessage" | "rawOutput" | "extractedData">,
  fn: () => Promise<T>,
  extractResult?: (result: T) => { rawOutput?: string; extractedData?: unknown; confidence?: number }
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const extracted = extractResult ? extractResult(result) : {};

    await logEnrichmentStep({
      ...params,
      durationMs,
      status: "success",
      rawOutput: extracted.rawOutput,
      extractedData: extracted.extractedData,
      confidence: extracted.confidence ?? params.confidence,
    });

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await logEnrichmentStep({
      ...params,
      durationMs,
      status: "error",
      errorMessage,
    });

    throw err;
  }
}

function generateId(): string {
  return `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
