--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_linkedin_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "unipile_account_id" text NOT NULL,
  "display_name" text NOT NULL DEFAULT '',
  "linkedin_username" text,
  "status" text NOT NULL DEFAULT 'CONNECTING',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_linkedin_accounts_unipile_account_id_unique" UNIQUE("unipile_account_id")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_target_lists" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_invite_targets" (
  "id" text PRIMARY KEY NOT NULL,
  "list_id" text NOT NULL,
  "first_name" text NOT NULL DEFAULT '',
  "linkedin_url" text NOT NULL,
  "unipile_provider_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "invited_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_invite_targets_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "growth_ops_target_lists"("id") ON DELETE CASCADE
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_invite_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "target_list_id" text NOT NULL,
  "linkedin_account_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "daily_min" integer NOT NULL DEFAULT 15,
  "daily_max" integer NOT NULL DEFAULT 19,
  "invite_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_invite_campaigns_target_list_id_fk" FOREIGN KEY ("target_list_id") REFERENCES "growth_ops_target_lists"("id") ON DELETE RESTRICT,
  CONSTRAINT "growth_ops_invite_campaigns_linkedin_account_id_fk" FOREIGN KEY ("linkedin_account_id") REFERENCES "growth_ops_linkedin_accounts"("id") ON DELETE RESTRICT
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_invite_queue" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL,
  "target_id" text NOT NULL,
  "linkedin_account_id" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "sent_at" timestamp,
  "status" text NOT NULL DEFAULT 'queued',
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_invite_queue_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "growth_ops_invite_campaigns"("id") ON DELETE CASCADE,
  CONSTRAINT "growth_ops_invite_queue_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "growth_ops_invite_targets"("id") ON DELETE CASCADE,
  CONSTRAINT "growth_ops_invite_queue_linkedin_account_id_fk" FOREIGN KEY ("linkedin_account_id") REFERENCES "growth_ops_linkedin_accounts"("id") ON DELETE CASCADE
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_ops_hubspot_cache" (
  "id" text PRIMARY KEY NOT NULL,
  "deal_id" text NOT NULL,
  "pipeline_id" text NOT NULL,
  "pipeline_label" text NOT NULL DEFAULT '',
  "stage_id" text NOT NULL,
  "stage_label" text NOT NULL DEFAULT '',
  "stage_order" integer NOT NULL DEFAULT 0,
  "deal_data" jsonb NOT NULL DEFAULT '{}',
  "synced_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "growth_ops_hubspot_cache_deal_id_unique" UNIQUE("deal_id")
);
