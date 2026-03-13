/**
 * Extraction Learner — self-learning feedback loop for enrichment.
 *
 * Records extraction outcomes per domain, detects failure patterns,
 * stores manual corrections, and provides retry hints for AI extraction.
 */

import { db } from "@/lib/db";
import { extractionOutcomes, serviceFirms } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ─── Record extraction outcome ─────────────────────────────

interface RecordOutcomeParams {
  domain: string;
  firmId?: string;
  extractionType: "services" | "case_studies";
  autoExtractedCount: number;
  failureReason?: string;
}

export async function recordExtractionOutcome(params: RecordOutcomeParams): Promise<void> {
  try {
    const id = `exo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(extractionOutcomes).values({
      id,
      domain: params.domain.toLowerCase(),
      firmId: params.firmId ?? null,
      extractionType: params.extractionType,
      autoExtractedCount: params.autoExtractedCount,
      failureReason: params.failureReason ?? null,
    });
  } catch (err) {
    // Don't let tracking failures break the pipeline
    console.warn("[ExtractionLearner] Failed to record outcome:", err);
  }
}

// ─── Record manual correction ──────────────────────────────

interface ManualCorrectionParams {
  firmId: string;
  extractionType: "services" | "case_studies";
  item: string;
}

export async function recordManualCorrection(params: ManualCorrectionParams): Promise<void> {
  try {
    // Look up domain from firmId
    const [firm] = await db
      .select({ website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, params.firmId))
      .limit(1);

    let domain: string | null = null;
    if (firm?.website) {
      try {
        domain = new URL(firm.website).hostname.replace(/^www\./, "").toLowerCase();
      } catch { /* ignore */ }
    }

    if (!domain) return;

    // Find existing unresolved outcome for this domain+type
    const [existing] = await db
      .select({
        id: extractionOutcomes.id,
        manuallyAddedCount: extractionOutcomes.manuallyAddedCount,
        manuallyAddedItems: extractionOutcomes.manuallyAddedItems,
      })
      .from(extractionOutcomes)
      .where(
        and(
          eq(extractionOutcomes.domain, domain),
          eq(extractionOutcomes.extractionType, params.extractionType),
          eq(extractionOutcomes.resolved, false)
        )
      )
      .limit(1);

    if (existing) {
      const currentItems = (existing.manuallyAddedItems as string[] | null) ?? [];
      await db.update(extractionOutcomes).set({
        manuallyAddedCount: existing.manuallyAddedCount + 1,
        manuallyAddedItems: [...currentItems, params.item],
        resolved: true, // user has added data, consider it resolved
        updatedAt: new Date(),
      }).where(eq(extractionOutcomes.id, existing.id));
    } else {
      // No prior failure record — create one to track the manual add
      const id = `exo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(extractionOutcomes).values({
        id,
        domain,
        firmId: params.firmId,
        extractionType: params.extractionType,
        autoExtractedCount: 0,
        manuallyAddedCount: 1,
        manuallyAddedItems: [params.item],
        resolved: true,
      });
    }
  } catch (err) {
    console.warn("[ExtractionLearner] Failed to record manual correction:", err);
  }
}

// ─── Get extraction hints for re-enrichment ────────────────

interface ExtractionHints {
  manuallyAddedServices: string[];
  manuallyAddedCaseStudies: string[];
  previousFailureReasons: string[];
  retryCount: number;
}

export async function getExtractionHints(domain: string): Promise<ExtractionHints> {
  const hints: ExtractionHints = {
    manuallyAddedServices: [],
    manuallyAddedCaseStudies: [],
    previousFailureReasons: [],
    retryCount: 0,
  };

  try {
    const outcomes = await db
      .select({
        extractionType: extractionOutcomes.extractionType,
        manuallyAddedItems: extractionOutcomes.manuallyAddedItems,
        failureReason: extractionOutcomes.failureReason,
        retryCount: extractionOutcomes.retryCount,
      })
      .from(extractionOutcomes)
      .where(eq(extractionOutcomes.domain, domain.toLowerCase()));

    for (const outcome of outcomes) {
      if (outcome.failureReason) {
        hints.previousFailureReasons.push(outcome.failureReason);
      }
      hints.retryCount = Math.max(hints.retryCount, outcome.retryCount);

      const items = (outcome.manuallyAddedItems as string[] | null) ?? [];
      if (outcome.extractionType === "services") {
        hints.manuallyAddedServices.push(...items);
      } else if (outcome.extractionType === "case_studies") {
        hints.manuallyAddedCaseStudies.push(...items);
      }
    }
  } catch (err) {
    console.warn("[ExtractionLearner] Failed to get hints:", err);
  }

  return hints;
}
