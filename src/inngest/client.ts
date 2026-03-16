import { Inngest } from "inngest";

/**
 * Inngest client — used by all background job functions.
 *
 * Event types define the payload for each job trigger.
 * This gives us type safety across event sends and function handlers.
 */
export const inngest = new Inngest({
  id: "collective-os",
  /**
   * Event schemas for type-safe event payloads.
   * Each key is an event name, value describes the data shape.
   */
});

// ─── Event type definitions ───────────────────────────────

/** Deep website crawl for a firm */
export type DeepCrawlEvent = {
  name: "enrich/deep-crawl";
  data: {
    firmId: string;
    organizationId: string;
    website: string;
    firmName: string;
  };
};

/** Ingest a single case study from URL, raw text, or file */
export type CaseStudyIngestEvent = {
  name: "enrich/case-study-ingest";
  data: {
    firmId: string;
    caseStudyUrl: string;
    sourceType: "url" | "pdf" | "slides";
    rawText?: string;
    filename?: string;
  };
};

/** LinkedIn enrichment for an expert */
export type ExpertLinkedInEvent = {
  name: "enrich/expert-linkedin";
  data: {
    expertId: string;
    firmId: string;
    fullName: string;
    linkedinUrl?: string;
    email?: string;
    companyName?: string;
    companyWebsite?: string;
  };
};

/** Rebuild abstraction profile for a firm */
export type FirmAbstractionEvent = {
  name: "enrich/firm-abstraction";
  data: {
    firmId: string;
    organizationId: string;
  };
};

/** Sync firm data to Neo4j graph */
export type GraphSyncFirmEvent = {
  name: "graph/sync-firm";
  data: {
    firmId: string;
    organizationId: string;
    firmName: string;
    website?: string;
  };
};

/** Extract memories from a conversation */
export type ExtractMemoriesEvent = {
  name: "memory/extract";
  data: {
    conversationId: string;
    userId: string;
    organizationId?: string;
  };
};

/** Weekly recrawl all firm websites */
export type WeeklyRecrawlEvent = {
  name: "cron/weekly-recrawl";
  data: Record<string, never>;
};

/** Post-call analysis for a recorded call */
export type PostCallAnalysisEvent = {
  name: "calls/analyze";
  data: {
    callId: string;
    firmId: string;
    userId?: string;
    transcript: string;
    callType: string;
    platform?: string;
    participants?: string[];
    duration?: number | null;
    partnershipId?: string;
    scheduledCallId?: string;
    transcriptId?: string;
  };
};

/** Process an inbound email received at ossy@ */
export type ProcessInboundEmailEvent = {
  name: "email/process-inbound";
  data: {
    messageId: string;
    threadId: string;
    firmId: string;
    from: string;
    subject: string;
    bodyText: string;
  };
};

/** Schedule a follow-up reminder for an email thread */
export type ScheduleFollowUpEvent = {
  name: "email/schedule-follow-up";
  data: {
    threadId: string;
    firmId: string;
    reason?: string;
    action?: string;
    suggestedDate?: string;
  };
};

/** Send an approved email from the approval queue */
export type SendApprovedEmailEvent = {
  name: "email/send-now";
  data: { queueId: string };
};

/** Join a scheduled meeting via Recall.ai bot */
export type JoinMeetingEvent = {
  name: "calls/join-meeting";
  data: { scheduledCallId: string };
};

/** Team roster import via PDL search + classification */
export type TeamIngestEvent = {
  name: "enrich/team-ingest";
  data: {
    firmId: string;
    domain: string;
    limit: number;
    autoEnrichLimit: number;
    force: boolean;
    /** ID of the backgroundJobs row for status tracking */
    jobId: string;
    companyName?: string;
  };
};

/** User-managed case study ingestion + analysis pipeline */
export type FirmCaseStudyIngestEvent = {
  name: "enrich/firm-case-study-ingest";
  data: {
    caseStudyId: string; // firmCaseStudies.id
    firmId: string;
    organizationId: string;
    sourceUrl: string;
    sourceType: "url" | "pdf_url" | "text";
    rawText?: string; // For PDF-extracted or manually pasted text
    filename?: string; // Original filename for PDFs
  };
};

/** Network relationship scan for an email connection */
export type NetworkScanEvent = {
  name: "network/scan";
  data: {
    userId: string;
    organizationId: string;
    provider: string;
    connectionId: string;
  };
};

/** Attribution check for a new user signup */
export type AttributionCheckEvent = {
  name: "growth/attribution-check";
  data: {
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    linkedinUrl: string | null;
  };
};

/** LinkedIn invite scheduler */
export type LinkedInInviteSchedulerEvent = {
  name: "cron/linkedin-invite-scheduler";
  data: Record<string, never>;
};

/** Client/prospect research pipeline (PDL + Jina + classify + intelligence) */
export type ResearchCompanyEvent = {
  name: "research/company";
  data: {
    domain: string;
    firmId: string;
    userId: string;
    pitchContext?: string;
    conversationId?: string;
  };
};

/** Fit assessment after research completes */
export type AssessClientFitEvent = {
  name: "research/assess-fit";
  data: {
    domain: string;
    firmId: string;
    userId: string;
    pitchContext?: string;
    conversationId?: string;
  };
};

/** Opportunity extraction from transcripts */
export type ExtractOpportunitiesEvent = {
  name: "opportunities/extract";
  data: {
    transcript: string;
    firmId: string;
    userId: string;
    organizationId?: string;
    firmName?: string;
    firmCategories?: string[];
    source: string;
  };
};

/** Sync preferences to Neo4j graph */
export type SyncPreferencesEvent = {
  name: "preferences/sync-graph";
  data: {
    firmId: string;
    field?: string;
    value?: string | string[];
  };
};

// Union type for all events
export type CosEvent =
  | DeepCrawlEvent
  | CaseStudyIngestEvent
  | ExpertLinkedInEvent
  | FirmAbstractionEvent
  | GraphSyncFirmEvent
  | ExtractMemoriesEvent
  | WeeklyRecrawlEvent
  | PostCallAnalysisEvent
  | ProcessInboundEmailEvent
  | ScheduleFollowUpEvent
  | SendApprovedEmailEvent
  | JoinMeetingEvent
  | FirmCaseStudyIngestEvent
  | TeamIngestEvent
  | NetworkScanEvent
  | AttributionCheckEvent
  | LinkedInInviteSchedulerEvent
  | ResearchCompanyEvent
  | AssessClientFitEvent
  | ExtractOpportunitiesEvent
  | SyncPreferencesEvent;
