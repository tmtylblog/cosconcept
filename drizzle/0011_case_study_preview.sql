-- Migration: 0011_case_study_preview
-- Adds multi-format ingestion columns to firm_case_studies

ALTER TABLE "firm_case_studies" ADD COLUMN IF NOT EXISTS "file_storage_key" text;
ALTER TABLE "firm_case_studies" ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;
ALTER TABLE "firm_case_studies" ADD COLUMN IF NOT EXISTS "preview_image_url" text;
