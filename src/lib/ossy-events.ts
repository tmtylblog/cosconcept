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
  | { type: "empty_state_lingered"; section: string };

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
    }
  });
  return `[PAGE_EVENT] ${lines.join("; ")}`;
}
