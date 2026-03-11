CREATE TYPE "public"."call_type" AS ENUM('partnership', 'client', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."case_study_status" AS ENUM('pending', 'ingesting', 'active', 'blocked', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."company_source" AS ENUM('scraped', 'imported', 'pdl', 'user_created', 'self_registered');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('full_time', 'fractional', 'advisor', 'board', 'embedded');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('stub', 'pending', 'enriched', 'needs_linkedin');--> statement-breakpoint
CREATE TYPE "public"."example_type" AS ENUM('project', 'role');--> statement-breakpoint
CREATE TYPE "public"."expert_division" AS ENUM('collective_member', 'expert', 'trusted_expert');--> statement-breakpoint
CREATE TYPE "public"."firm_type" AS ENUM('fractional_interim', 'staff_augmentation', 'embedded_teams', 'boutique_agency', 'project_consulting', 'managed_service_provider', 'advisory', 'global_consulting', 'freelancer_network', 'agency_collective');--> statement-breakpoint
CREATE TYPE "public"."industry_level" AS ENUM('L1', 'L2', 'L3');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('open', 'shared', 'claimed', 'won', 'lost', 'expired');--> statement-breakpoint
CREATE TYPE "public"."market_level" AS ENUM('L1', 'L2', 'L3');--> statement-breakpoint
CREATE TYPE "public"."meeting_platform" AS ENUM('google_meet', 'zoom', 'teams', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('new', 'in_review', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."partnership_status" AS ENUM('suggested', 'requested', 'accepted', 'declined', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."partnership_type" AS ENUM('trusted_partner', 'collective', 'vendor_network');--> statement-breakpoint
CREATE TYPE "public"."person_source" AS ENUM('scraped', 'imported', 'user_created', 'self_registered');--> statement-breakpoint
CREATE TYPE "public"."preference_source" AS ENUM('stated', 'revealed', 'ai_inferred');--> statement-breakpoint
CREATE TYPE "public"."quality_status" AS ENUM('strong', 'partial', 'weak', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."scheduled_call_status" AS ENUM('pending', 'recording', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."size_band" AS ENUM('individual', 'micro_1_10', 'small_11_50', 'emerging_51_200', 'mid_201_500', 'upper_mid_501_1000', 'large_1001_5000', 'major_5001_10000', 'global_10000_plus');--> statement-breakpoint
CREATE TYPE "public"."solution_partner_category" AS ENUM('crm', 'marketing_automation', 'ecommerce', 'analytics', 'project_management', 'developer_tools', 'cloud_infrastructure', 'communication', 'design', 'payments', 'customer_support', 'data_integration', 'other');--> statement-breakpoint
CREATE TYPE "public"."specialist_profile_source" AS ENUM('ai_generated', 'user_created', 'ai_suggested_user_confirmed');--> statement-breakpoint
CREATE TYPE "public"."specialist_profile_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "abstraction_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"hidden_narrative" text,
	"top_services" jsonb,
	"top_skills" jsonb,
	"top_industries" jsonb,
	"typical_client_profile" text,
	"partnership_readiness" jsonb,
	"confidence_scores" jsonb,
	"evidence_sources" jsonb,
	"last_enriched_at" timestamp,
	"enrichment_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"model" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" real,
	"entity_type" text,
	"entity_id" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"title" text,
	"mode" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_models_name_unique" UNIQUE("name")
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
CREATE TABLE "enrichment_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"firm_name" text,
	"enrichment_data" jsonb NOT NULL,
	"guest_preferences" jsonb,
	"has_pdl" boolean DEFAULT false NOT NULL,
	"has_scrape" boolean DEFAULT false NOT NULL,
	"has_classify" boolean DEFAULT false NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_cache_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "expert_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text,
	"imported_contact_id" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"email" text,
	"title" text,
	"headline" text,
	"photo_url" text,
	"linkedin_url" text,
	"location" text,
	"bio" text,
	"pdl_id" text,
	"pdl_data" jsonb,
	"pdl_enriched_at" timestamp,
	"top_skills" jsonb,
	"top_industries" jsonb,
	"division" "expert_division",
	"is_public" boolean DEFAULT true NOT NULL,
	"profile_completeness" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_case_studies" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source_url" text NOT NULL,
	"source_type" text DEFAULT 'url' NOT NULL,
	"user_notes" text,
	"status" "case_study_status" DEFAULT 'pending' NOT NULL,
	"status_message" text,
	"title" text,
	"summary" text,
	"thumbnail_url" text,
	"auto_tags" jsonb,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"cos_analysis" jsonb,
	"graph_node_id" text,
	"abstraction_profile_id" text,
	"ingested_at" timestamp,
	"last_ingested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" text,
	"theme" text,
	"sample_orgs" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "firm_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "firm_services" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_url" text,
	"source_page_title" text,
	"sub_services" jsonb,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"domain" text,
	"logo_url" text,
	"description" text,
	"industry" text,
	"sector" text,
	"industry_group" text,
	"sub_industry" text,
	"employee_count" text,
	"employee_count_exact" integer,
	"employee_range" text,
	"estimated_revenue" text,
	"annual_revenue" text,
	"location" text,
	"city" text,
	"state" text,
	"country" text,
	"country_code" text,
	"website" text,
	"founded_year" integer,
	"company_type" text,
	"parent_domain" text,
	"linkedin_url" text,
	"twitter_url" text,
	"facebook_url" text,
	"tech_stack" jsonb,
	"tags" jsonb,
	"funding_raised" text,
	"latest_funding_stage" text,
	"service_firm_source_id" text,
	"service_firm_name" text,
	"imported_company_id" text,
	"enriched_at" timestamp,
	"enrichment_sources" jsonb,
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
	"logo_url" text,
	"description" text,
	"industry" text,
	"sector" text,
	"industry_group" text,
	"sub_industry" text,
	"size" text,
	"employee_count_exact" integer,
	"employee_range" text,
	"revenue" text,
	"estimated_revenue" text,
	"location" text,
	"city" text,
	"state" text,
	"country" text,
	"country_code" text,
	"founded_year" integer,
	"company_type" text,
	"parent_domain" text,
	"website_url" text,
	"linkedin_url" text,
	"twitter_url" text,
	"facebook_url" text,
	"tech_stack" jsonb,
	"tags" jsonb,
	"funding_raised" text,
	"latest_funding_stage" text,
	"is_icp" boolean,
	"icp_classification" text,
	"classification_confidence" real,
	"graph_node_id" text,
	"service_firm_id" text,
	"enriched_at" timestamp,
	"enrichment_sources" jsonb,
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
CREATE TABLE "industries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" "industry_level",
	"parent_id" text,
	"sector" text,
	"linkedin_value" text,
	"crunchbase_value" text,
	"cos_legacy_id" text,
	"cos_legacy_name" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_industry_id" text NOT NULL,
	"source" text NOT NULL,
	"external_value" text NOT NULL,
	"external_label" text,
	"confidence" real,
	"mapped_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"inviter_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"shared_with_firm_id" text NOT NULL,
	"shared_by" text NOT NULL,
	"viewed_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"created_by" text NOT NULL,
	"opportunity_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" text,
	"required_categories" jsonb DEFAULT '[]'::jsonb,
	"required_skills" jsonb DEFAULT '[]'::jsonb,
	"required_industries" jsonb DEFAULT '[]'::jsonb,
	"required_markets" jsonb DEFAULT '[]'::jsonb,
	"estimated_value" text,
	"timeline" text,
	"client_domain" text,
	"client_name" text,
	"anonymize_client" boolean DEFAULT false NOT NULL,
	"client_size_band" "size_band",
	"client_type" text,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"quality_breakdown" jsonb,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"status" "lead_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" "market_level",
	"parent_id" text,
	"iso_code" text,
	"latitude" real,
	"longitude" real,
	"radius_km" real,
	"population" integer,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
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
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
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
CREATE TABLE "onboarding_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"organization_id" text,
	"firm_id" text,
	"domain" text,
	"stage" text NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"evidence" text,
	"signal_type" text DEFAULT 'direct' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"resolution_approach" text DEFAULT 'network' NOT NULL,
	"required_categories" jsonb DEFAULT '[]'::jsonb,
	"required_skills" jsonb DEFAULT '[]'::jsonb,
	"required_industries" jsonb DEFAULT '[]'::jsonb,
	"required_markets" jsonb DEFAULT '[]'::jsonb,
	"estimated_value" text,
	"timeline" text,
	"client_domain" text,
	"client_name" text,
	"anonymize_client" boolean DEFAULT false NOT NULL,
	"client_size_band" "size_band",
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"status" "opportunity_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partner_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"preferred_firm_types" jsonb,
	"preferred_size_bands" jsonb,
	"preferred_industries" jsonb,
	"preferred_markets" jsonb,
	"partnership_models" jsonb,
	"deal_breakers" jsonb,
	"growth_goals" text,
	"raw_onboarding_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "service_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "service_firms" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"description" text,
	"founded_year" integer,
	"size_band" "size_band",
	"firm_type" "firm_type",
	"is_platform_member" boolean DEFAULT false NOT NULL,
	"profile_completeness" real DEFAULT 0,
	"partnership_readiness_score" real,
	"response_velocity" real,
	"enrichment_data" jsonb,
	"enrichment_status" text DEFAULT 'pending',
	"classification_confidence" real,
	"entity_type" text DEFAULT 'service_firm',
	"registered_interest_email" text,
	"registered_interest_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"service_category_id" text,
	"description" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
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
CREATE TABLE "specialist_profile_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"specialist_profile_id" text NOT NULL,
	"example_type" "example_type" DEFAULT 'project' NOT NULL,
	"title" text,
	"subject" text,
	"company_name" text,
	"company_industry" text,
	"start_date" text,
	"end_date" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_pdl_source" boolean DEFAULT false NOT NULL,
	"pdl_experience_index" integer,
	"position" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"expert_profile_id" text NOT NULL,
	"firm_id" text NOT NULL,
	"title" text,
	"body_description" text,
	"skills" jsonb,
	"industries" jsonb,
	"services" jsonb,
	"quality_score" real DEFAULT 0,
	"quality_status" "quality_status" DEFAULT 'incomplete',
	"source" "specialist_profile_source" DEFAULT 'user_created' NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "specialist_profile_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"organization_id" text,
	"data" jsonb,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "tech_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph_node_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tech_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "unmapped_industries" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_value" text NOT NULL,
	"source" text NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"example_company" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"mapped_to_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_partner_firm_id_service_firms_id_fk" FOREIGN KEY ("partner_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_reports" ADD CONSTRAINT "coaching_reports_call_recording_id_call_recordings_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_reports" ADD CONSTRAINT "coaching_reports_scheduled_call_id_scheduled_calls_id_fk" FOREIGN KEY ("scheduled_call_id") REFERENCES "public"."scheduled_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_approval_queue" ADD CONSTRAINT "email_approval_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_audit_log" ADD CONSTRAINT "enrichment_audit_log_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_audit_log" ADD CONSTRAINT "enrichment_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_imported_contact_id_imported_contacts_id_fk" FOREIGN KEY ("imported_contact_id") REFERENCES "public"."imported_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_case_studies" ADD CONSTRAINT "firm_case_studies_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_services" ADD CONSTRAINT "firm_services_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_case_studies" ADD CONSTRAINT "imported_case_studies_imported_company_id_imported_companies_id_fk" FOREIGN KEY ("imported_company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD CONSTRAINT "imported_clients_imported_company_id_imported_companies_id_fk" FOREIGN KEY ("imported_company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD CONSTRAINT "imported_companies_service_firm_id_service_firms_id_fk" FOREIGN KEY ("service_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_contacts" ADD CONSTRAINT "imported_contacts_company_id_imported_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_outreach" ADD CONSTRAINT "imported_outreach_company_id_imported_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."imported_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_outreach" ADD CONSTRAINT "imported_outreach_contact_id_imported_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."imported_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_parent_id_industries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_mappings" ADD CONSTRAINT "industry_mappings_canonical_industry_id_industries_id_fk" FOREIGN KEY ("canonical_industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_shares" ADD CONSTRAINT "lead_shares_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_shares" ADD CONSTRAINT "lead_shares_shared_with_firm_id_service_firms_id_fk" FOREIGN KEY ("shared_with_firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_shares" ADD CONSTRAINT "lead_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_parent_id_markets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_themes" ADD CONSTRAINT "memory_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_themes" ADD CONSTRAINT "memory_themes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_preferences" ADD CONSTRAINT "partner_preferences_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_source_email_thread_id_email_threads_id_fk" FOREIGN KEY ("source_email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_firms" ADD CONSTRAINT "service_firms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_service_category_id_service_categories_id_fk" FOREIGN KEY ("service_category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profile_examples" ADD CONSTRAINT "specialist_profile_examples_specialist_profile_id_specialist_profiles_id_fk" FOREIGN KEY ("specialist_profile_id") REFERENCES "public"."specialist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profiles" ADD CONSTRAINT "specialist_profiles_expert_profile_id_expert_profiles_id_fk" FOREIGN KEY ("expert_profile_id") REFERENCES "public"."expert_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profiles" ADD CONSTRAINT "specialist_profiles_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmapped_industries" ADD CONSTRAINT "unmapped_industries_mapped_to_id_industries_id_fk" FOREIGN KEY ("mapped_to_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;