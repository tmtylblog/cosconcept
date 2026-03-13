-- Pipeline Schema Migration
-- Creates COS-native pipeline tables and extends acq_deals
-- Run this against the Neon database

-- 1. Pipeline stages table
CREATE TABLE IF NOT EXISTS acq_pipeline_stages (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL DEFAULT 'default',
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_closed_won BOOLEAN NOT NULL DEFAULT false,
  is_closed_lost BOOLEAN NOT NULL DEFAULT false,
  hubspot_stage_id TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Extend acq_deals with new columns
ALTER TABLE acq_deals
  ADD COLUMN IF NOT EXISTS stage_id TEXT REFERENCES acq_pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'hubspot_sync',
  ADD COLUMN IF NOT EXISTS source_channel TEXT,
  ADD COLUMN IF NOT EXISTS source_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS source_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sentiment_score REAL;

-- 3. Deal activities table
CREATE TABLE IF NOT EXISTS acq_deal_activities (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES acq_deals(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Deal approval queue table
CREATE TABLE IF NOT EXISTS acq_deal_queue (
  id TEXT PRIMARY KEY,
  contact_email TEXT,
  contact_name TEXT,
  contact_linkedin_url TEXT,
  company_name TEXT,
  company_domain TEXT,
  source TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  source_campaign_id TEXT,
  source_campaign_name TEXT,
  source_message_id TEXT,
  message_text TEXT,
  sentiment TEXT,
  sentiment_score REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewed_by TEXT,
  created_deal_id TEXT REFERENCES acq_deals(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Instantly reply watermarks table
CREATE TABLE IF NOT EXISTS acq_instantly_reply_watermarks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  last_reply_count INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_acq_deals_stage_id ON acq_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_acq_deals_status ON acq_deals(status);
CREATE INDEX IF NOT EXISTS idx_acq_deals_source ON acq_deals(source);
CREATE INDEX IF NOT EXISTS idx_acq_deal_activities_deal_id ON acq_deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_acq_deal_queue_status ON acq_deal_queue(status);
CREATE INDEX IF NOT EXISTS idx_acq_instantly_reply_wm_campaign ON acq_instantly_reply_watermarks(campaign_id, lead_email);
