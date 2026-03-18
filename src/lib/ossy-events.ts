/**
 * Ossy Page Events — discrete moments where Ossy should proactively speak up.
 *
 * Components emit events via emitOssyEvent(). ChatPanel listens and
 * batches/throttles them before auto-sending a context message to Ossy.
 */

export type OssyPageEvent =
  | { type: "enrichment_stage_complete"; stage: string }
  | { type: "services_discovered"; count: number }
  | { type: "case_study_ingested"; title: string; status: string }
  | { type: "team_discovery_complete"; count: number }
  | { type: "experts_enriched"; count: number }
  | { type: "profile_completeness_milestone"; percent: number }
  | { type: "preference_updated"; field: string }
  | { type: "empty_state_lingered"; section: string }
  | { type: "discover_firm_viewed"; entityId: string; displayName: string; dataSummary: string }
  | { type: "discover_expert_viewed"; entityId: string; displayName: string; dataSummary: string }
  | { type: "partner_matching_needs_prefs"; missingFields: string[] }
  | { type: "partner_matches_loaded"; matchCount: number; topMatches: string; patterns: string };

/**
 * Emit a page event that ChatPanel will pick up.
 * Safe to call from any component — no-ops during SSR.
 */
export function emitOssyEvent(event: OssyPageEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cos:page-event", { detail: event }));
}

/**
 * Collapse rapid-fire events of the same type into a single batch.
 * e.g. 5× experts_enriched → 1 event with the last count.
 */
export function batchEvents(events: OssyPageEvent[]): OssyPageEvent[] {
  const byType = new Map<string, OssyPageEvent>();
  for (const event of events) {
    byType.set(event.type, event);
  }
  return Array.from(byType.values());
}

/**
 * Format a batch of events into a [PAGE_EVENT] message for Ossy.
 */
export function formatEventsForOssy(events: OssyPageEvent[]): string {
  const batched = batchEvents(events);
  const lines = batched.map((e) => {
    switch (e.type) {
      case "services_discovered":
        return `services_discovered: ${e.count} services found from your website`;
      case "case_study_ingested":
        return `case_study_ingested: "${e.title}" — status: ${e.status}`;
      case "team_discovery_complete":
        return `team_discovery_complete: ${e.count} team members found`;
      case "experts_enriched":
        return `experts_enriched: ${e.count} expert profiles enriched`;
      case "enrichment_stage_complete":
        return `enrichment_stage_complete: ${e.stage} finished`;
      case "profile_completeness_milestone":
        return `profile_completeness_milestone: ${e.percent}% complete`;
      case "preference_updated":
        return `preference_updated: ${e.field} was updated`;
      case "empty_state_lingered":
        return `empty_state_lingered: ${e.section} has no data yet`;
      case "discover_firm_viewed":
        return `discover_firm_viewed: User is viewing "${e.displayName}". Profile data: ${e.dataSummary}`;
      case "discover_expert_viewed":
        return `discover_expert_viewed: User is viewing expert "${e.displayName}". Profile data: ${e.dataSummary}`;
      case "partner_matching_needs_prefs":
        return `partner_matching_needs_prefs: User opened Partner Matching but is missing these V2 preference fields: ${e.missingFields.join(", ")}. Start the preference interview NOW — ask the first missing question.`;
      case "partner_matches_loaded":
        return `partner_matches_loaded: ${e.matchCount} partner matches just loaded. ${e.topMatches}. ${e.patterns}. Give the user a brief consultant-style commentary — what stands out, who you'd prioritize, any patterns worth noting. Be specific, reference firm names and scores. 2-3 sentences max.`;
    }
  });
  return `[PAGE_EVENT] ${lines.join("; ")}`;
}
