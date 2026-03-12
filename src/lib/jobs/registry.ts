/**
 * Job Registry — maps job type strings to handler functions.
 *
 * Uses lazy dynamic imports so handlers are only loaded when needed,
 * keeping cold-start times low.
 */

export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown>;

type HandlerLoader = () => Promise<JobHandler>;

const registry: Record<string, HandlerLoader> = {
  // ── Enrichment pipeline ──────────────────────────────
  "team-ingest": () =>
    import("./handlers/team-ingest").then((m) => m.handleTeamIngest),
  "firm-abstraction": () =>
    import("./handlers/firm-abstraction").then(
      (m) => m.handleFirmAbstraction
    ),
  "firm-case-study-ingest": () =>
    import("./handlers/firm-case-study-ingest").then(
      (m) => m.handleFirmCaseStudyIngest
    ),
  "deep-crawl": () =>
    import("./handlers/deep-crawl").then((m) => m.handleDeepCrawl),
  "graph-sync": () =>
    import("./handlers/graph-sync").then((m) => m.handleGraphSync),
  "expert-linkedin": () =>
    import("./handlers/expert-linkedin").then((m) => m.handleExpertLinkedIn),
  "case-study-ingest": () =>
    import("./handlers/case-study-ingest").then(
      (m) => m.handleCaseStudyIngest
    ),

  // ── Calls & intelligence ─────────────────────────────
  "calls-analyze": () =>
    import("./handlers/calls-analyze").then((m) => m.handleCallsAnalyze),
  "calls-join-meeting": () =>
    import("./handlers/join-meeting").then((m) => m.handleJoinMeeting),

  // ── Email pipeline ───────────────────────────────────
  "email-process-inbound": () =>
    import("./handlers/email-process-inbound").then(
      (m) => m.handleEmailProcessInbound
    ),
  "email-send-now": () =>
    import("./handlers/email-send-now").then((m) => m.handleEmailSendNow),
  "email-schedule-follow-up": () =>
    import("./handlers/email-schedule-follow-up").then(
      (m) => m.handleEmailScheduleFollowUp
    ),

  // ── Memory ───────────────────────────────────────────
  "extract-memories": () =>
    import("./handlers/extract-memories").then(
      (m) => m.handleExtractMemories
    ),

  // ── Cron jobs (triggered via vercel.json schedule) ───
  "weekly-recrawl": () =>
    import("./handlers/weekly-recrawl").then((m) => m.handleWeeklyRecrawl),
  "weekly-digest": () =>
    import("./handlers/weekly-digest").then((m) => m.handleWeeklyDigest),
  "check-stale-partnerships": () =>
    import("./handlers/check-stale-partnerships").then(
      (m) => m.handleCheckStalePartnerships
    ),
};

/** Returns the handler function for a given job type, or null if not registered. */
export async function getHandler(type: string): Promise<JobHandler | null> {
  const loader = registry[type];
  if (!loader) return null;
  return loader();
}
