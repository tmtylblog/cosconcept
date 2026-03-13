-- Migration: Add acq_deal_sources table for configurable deal source options
-- Run against Neon production DB

CREATE TABLE IF NOT EXISTS acq_deal_sources (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT NOT NULL DEFAULT 'globe',
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed default system sources
INSERT INTO acq_deal_sources (id, key, label, color, icon, is_system, display_order) VALUES
  (gen_random_uuid()::text, 'hubspot_sync', 'HubSpot Sync', '#ff7a59', 'globe', true, 0),
  (gen_random_uuid()::text, 'instantly_auto', 'Instantly Auto', '#f97316', 'mail', true, 1),
  (gen_random_uuid()::text, 'linkedin_auto', 'LinkedIn Auto', '#2563eb', 'linkedin', true, 2),
  (gen_random_uuid()::text, 'manual', 'Manual', '#6366f1', 'plus-circle', true, 3)
ON CONFLICT (key) DO NOTHING;
