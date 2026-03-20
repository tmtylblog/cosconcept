/**
 * Pipeline Stage Protection
 *
 * Prevents locked stages from being downgraded by automation.
 * Locked stages: Meeting Confirmed, Signed Up, Onboarded, Paying
 *
 * Lost substages can always be set (explicit rejection overrides protection).
 */

import type { PipelineStage } from "./response-classifier";

/** Stage progression order — higher = further along the pipeline */
const STAGE_ORDER: Record<string, number> = {
  contacted: 0,
  interested: 1,
  maybe_later: 1,
  asked_question: 1,
  referred_elsewhere: 1,
  meeting_requested: 2,
  meeting_confirmed: 3,
  signed_up: 4,
  onboarded: 5,
  paying: 6,
  // Lost substages — these are terminal, not ordered
  bad_fit: -1,
  no_budget: -1,
  bad_timing: -1,
  went_with_competitor: -1,
  unresponsive: -1,
  unsubscribed: -1,
};

/** Stages that cannot be automatically downgraded */
const LOCKED_STAGES = new Set<string>([
  "meeting_confirmed",
  "signed_up",
  "onboarded",
  "paying",
]);

/** Lost substages — always allowed (explicit rejection) */
const LOST_STAGES = new Set<string>([
  "bad_fit",
  "no_budget",
  "bad_timing",
  "went_with_competitor",
  "unresponsive",
  "unsubscribed",
]);

/**
 * Check if a stage transition is allowed.
 *
 * @param currentStageSlug - Current stage slug (e.g. "meeting_confirmed")
 * @param proposedStageSlug - Proposed new stage slug
 * @returns true if the transition is allowed
 */
export function canTransition(
  currentStageSlug: string | null,
  proposedStageSlug: PipelineStage
): boolean {
  // No current stage — anything goes
  if (!currentStageSlug) return true;

  // Lost stages can always be set (explicit rejection overrides)
  if (LOST_STAGES.has(proposedStageSlug)) return true;

  // Current stage is locked — only allow forward progression
  if (LOCKED_STAGES.has(currentStageSlug)) {
    const currentOrder = STAGE_ORDER[currentStageSlug] ?? 0;
    const proposedOrder = STAGE_ORDER[proposedStageSlug] ?? 0;
    return proposedOrder >= currentOrder;
  }

  // Not locked — allow any transition
  return true;
}

/**
 * Map a stage slug to the DB stage ID.
 * Returns null if no matching stage found.
 */
export function findStageBySlug(
  stages: { id: string; label: string; parentStageId: string | null }[],
  slug: PipelineStage
): string | null {
  // Normalize slug to label: "meeting_requested" → "Meeting Requested"
  const label = slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const match = stages.find(
    (s) => s.label.toLowerCase() === label.toLowerCase()
  );
  return match?.id ?? null;
}

/**
 * Get the slug for a stage label.
 */
export function stageToSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "_");
}
