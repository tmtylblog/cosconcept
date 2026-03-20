CREATE TYPE "public"."feature_log_category" AS ENUM('feature', 'enhancement', 'fix', 'infrastructure', 'docs');--> statement-breakpoint
CREATE TABLE "feature_log" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "feature_log_category" DEFAULT 'feature' NOT NULL,
	"logged_by" text DEFAULT '' NOT NULL,
	"pr_number" integer,
	"commit_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acq_deal_queue" ADD COLUMN "linkedin_account_id" text;--> statement-breakpoint
ALTER TABLE "acq_deal_queue" ADD COLUMN "outreach_email_account" text;--> statement-breakpoint
ALTER TABLE "acq_deal_queue" ADD COLUMN "classified_stage" text;--> statement-breakpoint
ALTER TABLE "acq_deal_queue" ADD COLUMN "classification_confidence" real;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD COLUMN "linkedin_account_id" text;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD COLUMN "outreach_email_account" text;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD COLUMN "classified_stage" text;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD COLUMN "classification_confidence" real;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD COLUMN "last_classified_at" timestamp;--> statement-breakpoint
ALTER TABLE "growth_ops_linkedin_accounts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "acq_deals" ADD CONSTRAINT "acq_deals_linkedin_account_id_growth_ops_linkedin_accounts_id_fk" FOREIGN KEY ("linkedin_account_id") REFERENCES "public"."growth_ops_linkedin_accounts"("id") ON DELETE set null ON UPDATE no action;