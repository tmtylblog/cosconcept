-- Migration 0006: LinkedIn Conversation Cache
-- Adds account_type to linkedin accounts + conversation/message/usage cache tables.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

--> statement-breakpoint
ALTER TABLE "growth_ops_linkedin_accounts"
  ADD COLUMN IF NOT EXISTS "account_type" text NOT NULL DEFAULT 'basic';

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "linkedin_account_id" text NOT NULL REFERENCES "growth_ops_linkedin_accounts"("id") ON DELETE CASCADE,
  "chat_id" text NOT NULL,
  "participant_provider_id" text NOT NULL DEFAULT '',
  "participant_name" text NOT NULL DEFAULT '',
  "participant_headline" text,
  "participant_profile_url" text,
  "participant_avatar_url" text,
  "last_message_at" timestamp,
  "last_message_preview" text,
  "unread_count" integer NOT NULL DEFAULT 0,
  "is_inmail_thread" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_conversations_account_chat_unique" UNIQUE("linkedin_account_id", "chat_id")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "linkedin_account_id" text NOT NULL REFERENCES "growth_ops_linkedin_accounts"("id") ON DELETE CASCADE,
  "chat_id" text NOT NULL,
  "message_id" text NOT NULL,
  "sender_provider_id" text NOT NULL DEFAULT '',
  "is_outbound" boolean NOT NULL DEFAULT false,
  "body" text NOT NULL DEFAULT '',
  "is_read" boolean NOT NULL DEFAULT false,
  "is_inmail" boolean NOT NULL DEFAULT false,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_messages_message_id_unique" UNIQUE("message_id")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_daily_usage" (
  "id" text PRIMARY KEY NOT NULL,
  "linkedin_account_id" text NOT NULL REFERENCES "growth_ops_linkedin_accounts"("id") ON DELETE CASCADE,
  "date" text NOT NULL,
  "invites_sent" integer NOT NULL DEFAULT 0,
  "messages_sent" integer NOT NULL DEFAULT 0,
  "inmails_sent" integer NOT NULL DEFAULT 0,
  "profile_views" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_daily_usage_account_date_unique" UNIQUE("linkedin_account_id", "date")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_ops_messages_chat_idx" ON "growth_ops_messages"("chat_id");
CREATE INDEX IF NOT EXISTS "growth_ops_conversations_account_idx" ON "growth_ops_conversations"("linkedin_account_id");
