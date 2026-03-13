-- LinkedIn PDL lookup tracking + company/2nd-degree attribution

-- Track whether PDL has been queried for a user's LinkedIn URL
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "pdl_linkedin_looked_up" boolean NOT NULL DEFAULT false;

-- Company-level and name fuzzy matching on attribution events
ALTER TABLE "attribution_events"
  ADD COLUMN IF NOT EXISTS "has_company_linkedin_match" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "company_linkedin_details" jsonb,
  ADD COLUMN IF NOT EXISTS "has_name_fuzzy_match" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "name_fuzzy_details" jsonb,
  ADD COLUMN IF NOT EXISTS "pdl_lookup_status" text;

-- Index for name fuzzy matching on conversations
CREATE INDEX IF NOT EXISTS "idx_conversations_participant_name_lower"
  ON "growth_ops_conversations" (LOWER("participant_name"));

-- Index for company domain matching
CREATE INDEX IF NOT EXISTS "idx_acq_companies_domain"
  ON "acq_companies" ("domain");
