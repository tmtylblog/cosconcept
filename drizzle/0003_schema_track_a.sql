-- Track A Schema Migration
-- Adds canonical FK columns, rate preference fields, and the "draft" lead status.
-- Safe to run multiple times (uses IF NOT EXISTS / IF VALUE NOT EXISTS where possible).

--> statement-breakpoint
-- Add "draft" to lead_status enum (must go first, before any table changes)
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'draft';

--> statement-breakpoint
-- imported_companies: canonical Neo4j Company node reference
ALTER TABLE "imported_companies" ADD COLUMN IF NOT EXISTS "canonical_company_id" text;

--> statement-breakpoint
-- imported_clients: canonical Neo4j Company node reference
ALTER TABLE "imported_clients" ADD COLUMN IF NOT EXISTS "canonical_company_id" text;

--> statement-breakpoint
-- imported_contacts: canonical Neo4j Person node reference
ALTER TABLE "imported_contacts" ADD COLUMN IF NOT EXISTS "canonical_person_id" text;

--> statement-breakpoint
-- partner_preferences: rate range + project size preferences (Track A Section 8.6)
ALTER TABLE "partner_preferences" ADD COLUMN IF NOT EXISTS "rate_start" integer;
ALTER TABLE "partner_preferences" ADD COLUMN IF NOT EXISTS "rate_end" integer;
ALTER TABLE "partner_preferences" ADD COLUMN IF NOT EXISTS "project_size_ranges" jsonb;
