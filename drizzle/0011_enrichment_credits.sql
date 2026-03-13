-- Enrichment Credits System
-- Adds credit tracking tables and enrichment_status column for expert profiles

-- 1. Create credit_transaction_type enum
DO $$ BEGIN
  CREATE TYPE "public"."credit_transaction_type" AS ENUM('free_auto', 'pro_grant', 'boost_pack', 'manual_grant', 'enrichment_use');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create enrichment_credits table (per-org credit balance)
CREATE TABLE IF NOT EXISTS "enrichment_credits" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "total_credits" integer NOT NULL DEFAULT 5,
  "used_credits" integer NOT NULL DEFAULT 0,
  "free_auto_used" integer NOT NULL DEFAULT 0,
  "pro_credits_granted" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 3. Create enrichment_credit_transactions table (audit trail)
CREATE TABLE IF NOT EXISTS "enrichment_credit_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type" "credit_transaction_type" NOT NULL,
  "amount" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "expert_profile_id" text,
  "stripe_payment_intent_id" text,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- 4. Add enrichment_status column to expert_profiles
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "enrichment_status" text NOT NULL DEFAULT 'roster';

-- 5. Backfill: mark experts with PDL enrichment as 'enriched'
UPDATE "expert_profiles" SET "enrichment_status" = 'enriched' WHERE "pdl_enriched_at" IS NOT NULL AND "enrichment_status" = 'roster';

-- 6. Index for credit lookups
CREATE INDEX IF NOT EXISTS "idx_enrichment_credits_org" ON "enrichment_credits"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_enrichment_credit_tx_org" ON "enrichment_credit_transactions"("organization_id");
