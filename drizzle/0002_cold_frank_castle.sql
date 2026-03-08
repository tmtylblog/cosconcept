CREATE TYPE "public"."case_study_status" AS ENUM('pending', 'ingesting', 'active', 'blocked', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."example_type" AS ENUM('project', 'role');--> statement-breakpoint
CREATE TYPE "public"."expert_division" AS ENUM('collective_member', 'expert', 'trusted_expert');--> statement-breakpoint
CREATE TYPE "public"."quality_status" AS ENUM('strong', 'partial', 'weak', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."specialist_profile_source" AS ENUM('ai_generated', 'user_created', 'ai_suggested_user_confirmed');--> statement-breakpoint
CREATE TYPE "public"."specialist_profile_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
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
	"auto_tags" jsonb,
	"cos_analysis" jsonb,
	"graph_node_id" text,
	"abstraction_profile_id" text,
	"ingested_at" timestamp,
	"last_ingested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "abstraction_profiles" ADD COLUMN "top_services" jsonb;--> statement-breakpoint
ALTER TABLE "abstraction_profiles" ADD COLUMN "top_skills" jsonb;--> statement-breakpoint
ALTER TABLE "abstraction_profiles" ADD COLUMN "top_industries" jsonb;--> statement-breakpoint
ALTER TABLE "abstraction_profiles" ADD COLUMN "typical_client_profile" text;--> statement-breakpoint
ALTER TABLE "abstraction_profiles" ADD COLUMN "partnership_readiness" jsonb;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "industry_group" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "sub_industry" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "employee_count_exact" integer;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "employee_range" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "estimated_revenue" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "annual_revenue" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "founded_year" integer;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "company_type" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "parent_domain" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "twitter_url" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "tech_stack" jsonb;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "funding_raised" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "latest_funding_stage" text;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "imported_clients" ADD COLUMN "enrichment_sources" jsonb;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "industry_group" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "sub_industry" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "employee_count_exact" integer;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "employee_range" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "estimated_revenue" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "company_type" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "parent_domain" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "twitter_url" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "tech_stack" jsonb;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "funding_raised" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "latest_funding_stage" text;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "imported_companies" ADD COLUMN "enrichment_sources" jsonb;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_imported_contact_id_imported_contacts_id_fk" FOREIGN KEY ("imported_contact_id") REFERENCES "public"."imported_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_case_studies" ADD CONSTRAINT "firm_case_studies_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profile_examples" ADD CONSTRAINT "specialist_profile_examples_specialist_profile_id_specialist_profiles_id_fk" FOREIGN KEY ("specialist_profile_id") REFERENCES "public"."specialist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profiles" ADD CONSTRAINT "specialist_profiles_expert_profile_id_expert_profiles_id_fk" FOREIGN KEY ("expert_profile_id") REFERENCES "public"."expert_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_profiles" ADD CONSTRAINT "specialist_profiles_firm_id_service_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."service_firms"("id") ON DELETE cascade ON UPDATE no action;