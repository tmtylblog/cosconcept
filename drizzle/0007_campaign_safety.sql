-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_campaign_safety.sql
-- Five-tier LinkedIn campaign safety system from CORE handoff:
--   active days/hours, weekly limits, acceptance tracking, counters
-- ─────────────────────────────────────────────────────────────────────────────

-- Campaign safety fields
ALTER TABLE growth_ops_invite_campaigns
  ADD COLUMN IF NOT EXISTS active_days jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri","sat"]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_hours_start integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS active_hours_end integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS total_sent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accepted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS started_at timestamp,
  ADD COLUMN IF NOT EXISTS completed_at timestamp;

-- Queue acceptance tracking + cached provider ID
ALTER TABLE growth_ops_invite_queue
  ADD COLUMN IF NOT EXISTS accepted_at timestamp,
  ADD COLUMN IF NOT EXISTS unipile_provider_id text;
