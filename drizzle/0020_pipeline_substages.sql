-- Add parentStageId to acq_pipeline_stages for substage support
ALTER TABLE "acq_pipeline_stages" ADD COLUMN "parent_stage_id" text REFERENCES "acq_pipeline_stages"("id") ON DELETE CASCADE;

-- Junction table for many-to-many deal<->contact associations
CREATE TABLE IF NOT EXISTS "acq_deal_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "deal_id" text NOT NULL REFERENCES "acq_deals"("id") ON DELETE CASCADE,
  "contact_id" text NOT NULL REFERENCES "acq_contacts"("id") ON DELETE CASCADE,
  "role" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
