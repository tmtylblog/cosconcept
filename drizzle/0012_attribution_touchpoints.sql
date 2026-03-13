-- Attribution touchpoints: multi-touch attribution tracking
-- Records every touchpoint per user across all channels

CREATE TABLE IF NOT EXISTS "attribution_touchpoints" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "source_id" text,
  "source_name" text,
  "touchpoint_at" timestamp NOT NULL,
  "interaction_type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Add multi-touch columns to attribution_events
ALTER TABLE "attribution_events"
  ADD COLUMN IF NOT EXISTS "has_linkedin_organic" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_linkedin_campaign" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "linkedin_conversation_count" integer NOT NULL DEFAULT 0;

-- Index for looking up touchpoints by user
CREATE INDEX IF NOT EXISTS "idx_attribution_touchpoints_user_id" ON "attribution_touchpoints" ("user_id");

-- Index for conversation matching by participant URL (case-insensitive)
CREATE INDEX IF NOT EXISTS "idx_conversations_participant_url" ON "growth_ops_conversations" (LOWER("participant_profile_url"));
