/**
 * Analytics stub — placeholder for future phase.
 * Logs events to console in development. Will be wired to a real
 * analytics backend (e.g. PostHog, Segment) in a later phase.
 *
 * Usage throughout the codebase:
 *   // [ANALYTICS] trackEvent("match_generated", { orgId, matchId })
 */

export async function trackEvent(
  name: string,
  data: Record<string, unknown> = {}
) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[Analytics] ${name}`, data);
  }
  // Future: send to analytics backend
}
