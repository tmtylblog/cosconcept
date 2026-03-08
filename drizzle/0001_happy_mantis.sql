CREATE TYPE "public"."call_type" AS ENUM('partnership', 'client', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."meeting_platform" AS ENUM('google_meet', 'zoom', 'teams', 'other');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'shared', 'claimed', 'won', 'lost', 'expired');--> statement-breakpoint
CREATE TYPE "public"."partnership_status" AS ENUM('suggested', 'requested', 'accepted', 'declined', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."partnership_type" AS ENUM('trusted_partner', 'collective', 'vendor_network');--> statement-breakpoint
CREATE TYPE "public"."scheduled_call_status" AS ENUM('pending', 'recording', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."solution_partner_category" AS ENUM('crm', 'marketing_automation', 'ecommerce', 'analytics', 'project_management', 'developer_tools', 'cloud_infrastructure', 'communication', 'design', 'payments', 'customer_support', 'data_integration', 'other');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "call_recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text,
	"scheduled_call_id" text,
	"call_type" "call_type" DEFAULT 'unknown',
	"partner_firm_id" text,
	"platform" "meeting_platform" DEFAULT 'other',
	"duration_seconds" integer,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"call_recording_id" text,
	"scheduled_call_id" text,
	"full_text" text,
	"segments" jsonb,
	"processing_status" "transcript_status" DEFAULT 'pending' NOT NULL,
	"deepgram_job_id" text,
	"coaching_report_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"call_recording_id" text,
	"scheduled_call_id" text,
	"talking_time_ratio" jsonb,
	"value_proposition" jsonb,
	"question_quality" jsonb,
	"topics_covered" jsonb,
	"next_steps" jsonb,
	"action_items" jsonb,
	"overall_score" integer,
	"top_recommendation" text,
	"recommended_experts" jsonb,
	"recommended_case_studies" jsonb,
	"sent_to_firm_a_at" timestamp,
	"sent_to_firm_b_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_approval_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email_type" text NOT NULL,
	"to_emails" jsonb NOT NULL,
	"cc_emails" jsonb,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"context" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"sent_at" timestamp,
	"external_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"external_message_id" text,
	"direction" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" jsonb NOT NULL,
	"cc_emails" jsonb,
	"subject" text NOT NULL,
	"body_html" text,
	"body_text" text,
	"extracted_intent" text,
	"extracted_entities" jsonb,
	"confidence" real,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"subject" text NOT NULL,
	"participants" jsonb,
	"partnership_id" text,
	"opportunity_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"intent" text,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text,
	"user_id" text,
	"phase" text NOT NULL,
	"source" text NOT NULL,
	"raw_input" text,
	"raw_output" text,
	"extracted_data" jsonb,
	"model" text,
	"cost_usd" real,
	"confidence" real,
	"duration_ms" integer,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_case_studies" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"source" text DEFAULT 'legacy' NOT NULL,
	"author_org_source_id" text,
	"author_org_name" text,
	"content" text,
	"status" text DEFAULT 'published',
	"client_companies" jsonb,
	"industries" jsonb,
	"skills" jsonb,
	"links" jsonb,
	"markets" jsonb,
	"expert_users" jsonb,
	"imported_company_id" text,
	"legacy_data" jsonb,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source" text DEFAULT 'legacy' NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"website" text,
	"employee_count" text,
	"service_firm_source_id" text,
	"service_firm_name" text,
	"imported_company_id" text,
	"legacy_data" jsonb,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source" text DEFAULT 'n8n' NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"description" text,
	"industry" text,
	"location" text,
	"country" text,
	"size" text,
	"founded_year" integer,
	"linkedin_url" text,
	"website_url" text,
	"revenue" text,
	"is_icp" boolean,
	"icp_classification" text,
	"classification_confidence" real,
	"graph_node_id" text,
	"service_firm_id" text,
	"review_tags" jsonb DEFAULT '[]'::jsonb,
	"meta" jsonb,
	"legacy_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source" text DEFAULT 'n8n' NOT NULL,
	"company_id" text,
	"first_name" text,
	"last_name" text,
	"name" text,
	"email" text,
	"title" text,
	"linkedin_url" text,
	"photo_url" text,
	"headline" text,
	"short_bio" text,
	"city" text,
	"state" text,
	"country" text,
	"is_partner" boolean,
	"is_icp" boolean,
	"profile_match" text,
	"profile_match_justification" text,
	"expert_classification" text,
	"graph_node_id" text,
	"review_tags" jsonb DEFAULT '[]'::jsonb,
	"meta" jsonb,
	"legacy_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_outreach" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source" text DEFAULT 'n8n' NOT NULL,
	"company_id" text,
	"contact_id" text,
	"message_type" text,
	"message_module" text,
	"message" text,
	"direction" text,
	"sender_org_id" text,
	"recipient_org_id" text,
	"opportunity_title" text,
	"sent_at" timestamp,
	"meta" jsonb,
	"legacy_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"theme" text NOT NULL,
	"content" text NOT NULL,
	"confidence" real DEFAULT 0.8,
	"source_conversation_id" text,
	"source_message_id" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"theme" text NOT NULL,
	"summary" text,
	"entry_count" integer DEFAULT 0,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'n8n' NOT NULL,
	"entity_type" text NOT NULL,
	"batch_number" integer NOT NULL,
	"total_in_batch" integer NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"error_details" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"required_skills" jsonb,
	"required_industries" jsonb,
	"estimated_value" text,
	"timeline" text,
	"client_type" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"shared_with_firm_id" text NOT NULL,
	"shared_by" text NOT NULL,
	"viewed_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partnership_events" (
	"id" text PRIMARY KEY NOT NULL,
	"partnership_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_a_id" text NOT NULL,
	"firm_b_id" text NOT NULL,
	"status" "partnership_status" DEFAULT 'suggested' NOT NULL,
	"type" "partnership_type" DEFAULT 'trusted_partner' NOT NULL,
	"initiated_by" text,
	"match_score" real,
	"match_explanation" text,
	"notes" text,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"partnership_id" text,
	"opportunity_id" text,
	"referring_firm_id" text NOT NULL,
	"receiving_firm_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimated_value" text,
	"actual_value" text,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text,
	"meeting_title" text,
	"meeting_time" timestamp,
	"meeting_link" text,
	"platform" "meeting_platform" DEFAULT 'other',
	"participants" jsonb,
	"partnership_id" text,
	"call_type" "call_type" DEFAULT 'unknown',
	"source_email_thread_id" text,
	"transcript_id" text,
	"recall_bot_id" text,
	"status" "scheduled_call_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"category" "solution_partner_category",
	"description" text,
	"logo_url" text,
	"website_url" text,
	"graph_node_id" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solution_partners_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "service_firms" ADD COLUMN "enrichment_data" jsonb;--> statement-breakpoint
ALTER TABLE "service_firms" ADD COLUMN "enrichment_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "service_firms" ADD COLUMN "classification_confidence" real;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_partner_firm_id_service_firms_id_fk" FOREIGN KEY ("partner_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_reports" ADD CONSTRAINT "coaching_reports_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_reports" ADD CONSTRAINT "coaching_reports_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_audit_log" ADD CONSTRAINT "enrichment_audit_log_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_audit_log" ADD CONSTRAINT "enrichment_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_case_studies" ADD CONSTRAINT "imported_case_studies_imported_company_id_imported_companies_id_fk" FOREIGN KEY ("imported_company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD CONSTRAINT "imported_clients_imported_company_id_imported_companies_id_fk" FOREIGN KEY ("imported_company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD CONSTRAINT "imported_companies_service_firm_id_service_firms_id_fk" FOREIGN KEY ("service_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_contacts" ADD CONSTRAINT "imported_contacts_company_id_imported_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_outreach" ADD CONSTRAINT "imported_outreach_company_id_imported_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_outreach" ADD CONSTRAINT "imported_outreach_contact_id_imported_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."imported_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_themes" ADD CONSTRAINT "memory_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_themes" ADD CONSTRAINT "memory_themes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_shares" ADD CONSTRAINT "opportunity_shares_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_shares" ADD CONSTRAINT "opportunity_shares_shared_with_firm_id_service_firms_id_fk" FOREIGN KEY ("shared_with_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_shares" ADD CONSTRAINT "opportunity_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_events" ADD CONSTRAINT "partnership_events_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_events" ADD CONSTRAINT "partnership_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_firm_a_id_service_firms_id_fk" FOREIGN KEY ("firm_a_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_firm_b_id_service_firms_id_fk" FOREIGN KEY ("firm_b_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referring_firm_id_service_firms_id_fk" FOREIGN KEY ("referring_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_receiving_firm_id_service_firms_id_fk" FOREIGN KEY ("receiving_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_source_email_thread_id_email_threads_id_fk" FOREIGN KEY ("source_email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;