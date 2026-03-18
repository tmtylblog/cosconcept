-- Add premium contract tracking to LinkedIn accounts
-- Enables identifying which Sales Navigator / Recruiter contract each connection uses
-- (a single LinkedIn user may have multiple SN contracts via contract_chooser)

ALTER TABLE "growth_ops_linkedin_accounts"
  ADD COLUMN IF NOT EXISTS "premium_contract_id" text,
  ADD COLUMN IF NOT EXISTS "premium_features" text[] DEFAULT '{}';
