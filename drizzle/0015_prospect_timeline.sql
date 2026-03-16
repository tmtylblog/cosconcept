-- Migration 0015: Prospect Timeline
-- Unified timeline of all touchpoints with prospects across channels.
-- Powers the Growth Ops dashboard funnel with real data.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospect_timeline" (
  "id" text PRIMARY KEY NOT NULL,
  "prospect_email" text NOT NULL,
  "prospect_name" text,
  "event_type" text NOT NULL,
  "channel" text NOT NULL,
  "campaign_id" text,
  "campaign_name" text,
  "metadata" jsonb,
  "event_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prospect_timeline_email" ON "prospect_timeline"("prospect_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prospect_timeline_event" ON "prospect_timeline"("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prospect_timeline_at" ON "prospect_timeline"("event_at");
