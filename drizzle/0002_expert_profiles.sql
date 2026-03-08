-- Expert Profile System
-- New enums and tables for expertProfiles, specialistProfiles, specialistProfileExamples

DO $$ BEGIN
  CREATE TYPE "public"."expert_division" AS ENUM('collective_member', 'expert', 'trusted_expert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."specialist_profile_source" AS ENUM('ai_generated', 'user_created', 'ai_suggested_user_confirmed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."specialist_profile_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."quality_status" AS ENUM('strong', 'partial', 'weak', 'incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."example_type" AS ENUM('project', 'role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "expert_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "firm_id" text NOT NULL REFERENCES "service_firms"("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "imported_contact_id" text REFERENCES "imported_contacts"("id") ON DELETE SET NULL,

  -- Identity
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

  -- PDL source
  "pdl_id" text,
  "pdl_data" jsonb,
  "pdl_enriched_at" timestamp,

  -- Computed / denormalized
  "top_skills" jsonb,
  "top_industries" jsonb,
  "division" "expert_division",

  -- Meta
  "is_public" boolean NOT NULL DEFAULT true,
  "profile_completeness" real DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "specialist_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "expert_profile_id" text NOT NULL REFERENCES "expert_profiles"("id") ON DELETE CASCADE,
  "firm_id" text NOT NULL REFERENCES "service_firms"("id") ON DELETE CASCADE,

  -- Core content
  "title" text,
  "body_description" text,

  -- Taxonomy
  "skills" jsonb,
  "industries" jsonb,
  "services" jsonb,

  -- Quality
  "quality_score" real DEFAULT 0,
  "quality_status" "quality_status" DEFAULT 'incomplete',

  -- Flags
  "source" "specialist_profile_source" NOT NULL DEFAULT 'user_created',
  "is_searchable" boolean NOT NULL DEFAULT false,
  "is_primary" boolean NOT NULL DEFAULT false,
  "status" "specialist_profile_status" NOT NULL DEFAULT 'draft',

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "specialist_profile_examples" (
  "id" text PRIMARY KEY NOT NULL,
  "specialist_profile_id" text NOT NULL REFERENCES "specialist_profiles"("id") ON DELETE CASCADE,

  "example_type" "example_type" NOT NULL DEFAULT 'project',
  "title" text,
  "subject" text,

  -- Context
  "company_name" text,
  "company_industry" text,
  "start_date" text,
  "end_date" text,
  "is_current" boolean NOT NULL DEFAULT false,

  -- PDL source link
  "is_pdl_source" boolean NOT NULL DEFAULT false,
  "pdl_experience_index" integer,

  "position" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "expert_profiles_firm_id_idx" ON "expert_profiles"("firm_id");
CREATE INDEX IF NOT EXISTS "expert_profiles_user_id_idx" ON "expert_profiles"("user_id");
CREATE INDEX IF NOT EXISTS "specialist_profiles_expert_id_idx" ON "specialist_profiles"("expert_profile_id");
CREATE INDEX IF NOT EXISTS "specialist_profiles_firm_id_idx" ON "specialist_profiles"("firm_id");
CREATE INDEX IF NOT EXISTS "specialist_profiles_is_searchable_idx" ON "specialist_profiles"("is_searchable");
CREATE INDEX IF NOT EXISTS "specialist_profile_examples_sp_id_idx" ON "specialist_profile_examples"("specialist_profile_id");
