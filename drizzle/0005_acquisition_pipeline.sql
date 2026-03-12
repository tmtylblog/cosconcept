-- Migration 0005: COS Acquisition Pipeline
-- Adds COS-native tables for managing the acquisition CRM (HubSpot-synced).
-- See docs/context/crm-acquisition.md for full context.
-- All tables use CREATE TABLE IF NOT EXISTS — safe to re-run.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acq_companies" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "domain" text,
  "industry" text,
  "size_estimate" text,
  "hubspot_company_id" text,
  "hubspot_synced_at" timestamp,
  "cos_org_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "acq_companies_hubspot_company_id_unique" UNIQUE("hubspot_company_id")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acq_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "first_name" text NOT NULL DEFAULT '',
  "last_name" text NOT NULL DEFAULT '',
  "linkedin_url" text,
  "company_id" text,
  "hubspot_contact_id" text,
  "hubspot_owner_id" text,
  "hubspot_synced_at" timestamp,
  "cos_user_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "acq_contacts_email_unique" UNIQUE("email"),
  CONSTRAINT "acq_contacts_hubspot_contact_id_unique" UNIQUE("hubspot_contact_id"),
  CONSTRAINT "acq_contacts_cos_user_id_unique" UNIQUE("cos_user_id"),
  CONSTRAINT "acq_contacts_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "acq_companies"("id") ON DELETE SET NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acq_deals" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "contact_id" text,
  "company_id" text,
  "hubspot_deal_id" text,
  "hubspot_pipeline_id" text,
  "hubspot_stage_id" text,
  "stage_label" text NOT NULL DEFAULT '',
  "deal_value" text,
  "status" text NOT NULL DEFAULT 'open',
  "closed_at" timestamp,
  "hubspot_synced_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "acq_deals_hubspot_deal_id_unique" UNIQUE("hubspot_deal_id"),
  CONSTRAINT "acq_deals_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "acq_contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "acq_deals_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "acq_companies"("id") ON DELETE SET NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attribution_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "contact_id" text,
  "instantly_campaign_id" text,
  "instantly_campaign_name" text,
  "linkedin_campaign_id" text,
  "linkedin_invite_target_id" text,
  "match_method" text NOT NULL DEFAULT 'none',
  "matched_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "attribution_events_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "attribution_events_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "acq_contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "attribution_events_linkedin_campaign_id_fk" FOREIGN KEY ("linkedin_campaign_id") REFERENCES "growth_ops_invite_campaigns"("id") ON DELETE SET NULL,
  CONSTRAINT "attribution_events_linkedin_invite_target_id_fk" FOREIGN KEY ("linkedin_invite_target_id") REFERENCES "growth_ops_invite_targets"("id") ON DELETE SET NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acq_contacts_email_idx" ON "acq_contacts"("email");
CREATE INDEX IF NOT EXISTS "acq_contacts_linkedin_url_idx" ON "acq_contacts"("linkedin_url");
CREATE INDEX IF NOT EXISTS "acq_deals_status_idx" ON "acq_deals"("status");
