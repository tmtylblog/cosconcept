-- Migration 0016: Add tags column to growth_ops_conversations
-- Enables tagging LinkedIn conversations as 'outreach' vs 'organic'.

--> statement-breakpoint
ALTER TABLE "growth_ops_conversations" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}';
