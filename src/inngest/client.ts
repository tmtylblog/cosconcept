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

/** Ingest a single case study from URL */
export type CaseStudyIngestEvent = {
  name: "enrich/case-study-ingest";
  data: {
    firmId: string;
    caseStudyUrl: string;
    sourceType: "url" | "pdf" | "slides";
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

// Union type for all events
export type CosEvent =
  | DeepCrawlEvent
  | CaseStudyIngestEvent
  | ExpertLinkedInEvent
  | FirmAbstractionEvent
  | GraphSyncFirmEvent
  | ExtractMemoriesEvent
  | WeeklyRecrawlEvent;
