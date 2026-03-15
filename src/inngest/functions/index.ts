/**
 * Inngest Functions Registry
 *
 * Export all Inngest functions here. They get registered
 * in the serve endpoint at /api/inngest.
 */

export { deepCrawl } from "./deep-crawl";
export { graphSyncFirm } from "./graph-sync";
export { caseStudyIngest } from "./case-study-ingest";
export { expertLinkedIn } from "./expert-linkedin";
export { weeklyRecrawl } from "./weekly-recrawl";
export { extractMemories } from "./extract-memories";
export { postCallAnalysis } from "./post-call-analysis";
export { processInboundEmail } from "./process-inbound-email";
export { scheduleFollowUp, checkStalePartnerships } from "./follow-up-reminders";
export { weeklyDigest } from "./weekly-digest";
export { sendApprovedEmail } from "./send-approved-email";
export { joinMeeting } from "./join-meeting";
export { firmCaseStudyIngest } from "./firm-case-study-ingest";
export { teamIngest } from "./team-ingest";
export { networkScan } from "./network-scan";
export { firmAbstraction } from "./firm-abstraction";
export { attributionCheck } from "./attribution-check";
export { linkedinInviteScheduler } from "./linkedin-invite-scheduler";

// ── Track A: Schema Migration & Background Jobs ──────────
export { migrateClientNodesToCompany } from "./migrate-client-nodes-to-company";
export { migratePartnershipPrefsToEdges } from "./migrate-partnership-prefs-to-edges";
export { skillComputeStrength } from "./skill-compute-strength";
export { preferenceUpdateRevealed } from "./preference-update-revealed";
export { companyEnrichStub } from "./company-enrich-stub";
