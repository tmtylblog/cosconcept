/**
 * Migration: Rework opportunities + add leads/lead_shares tables
 *
 * Run with: npx tsx scripts/migrate-opportunities.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Starting migration...");

  // 1. Update opportunity_status enum — drop old values, add new lifecycle
  console.log("1. Updating opportunity_status enum...");
  await sql`ALTER TABLE opportunities ALTER COLUMN status DROP DEFAULT`;
  await sql`ALTER TABLE opportunities ALTER COLUMN status TYPE text`;
  await sql`DROP TYPE IF EXISTS opportunity_status`;
  await sql`CREATE TYPE opportunity_status AS ENUM('new', 'in_review', 'actioned', 'dismissed')`;
  await sql`ALTER TABLE opportunities ALTER COLUMN status TYPE opportunity_status USING 'new'::opportunity_status`;
  await sql`ALTER TABLE opportunities ALTER COLUMN status SET DEFAULT 'new'`;
  await sql`ALTER TABLE opportunities ALTER COLUMN status SET NOT NULL`;

  // 2. Create lead_status enum (the old opportunity sharing lifecycle)
  console.log("2. Creating lead_status enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE lead_status AS ENUM('open', 'shared', 'claimed', 'won', 'lost', 'expired');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;

  // 3. Add new columns to opportunities
  console.log("3. Adding new columns to opportunities...");
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS evidence text`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS signal_type text NOT NULL DEFAULT 'direct'`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS resolution_approach text NOT NULL DEFAULT 'network'`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS required_categories jsonb DEFAULT '[]'`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS required_markets jsonb DEFAULT '[]'`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_domain text`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_name text`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS anonymize_client boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_size_band size_band`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_id text`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'`;

  // Update defaults on existing columns
  await sql`ALTER TABLE opportunities ALTER COLUMN required_skills SET DEFAULT '[]'`;
  await sql`ALTER TABLE opportunities ALTER COLUMN required_industries SET DEFAULT '[]'`;

  // Remove old column no longer needed
  await sql`ALTER TABLE opportunities DROP COLUMN IF EXISTS client_type`;
  await sql`ALTER TABLE opportunities DROP COLUMN IF EXISTS expires_at`;

  // 4. Drop opportunity_shares table
  console.log("4. Dropping opportunity_shares table...");
  await sql`DROP TABLE IF EXISTS opportunity_shares CASCADE`;

  // 5. Create leads table
  console.log("5. Creating leads table...");
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id text PRIMARY KEY,
      firm_id text NOT NULL REFERENCES service_firms(id) ON DELETE CASCADE,
      created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL,
      title text NOT NULL,
      description text NOT NULL,
      evidence text,
      required_categories jsonb DEFAULT '[]',
      required_skills jsonb DEFAULT '[]',
      required_industries jsonb DEFAULT '[]',
      required_markets jsonb DEFAULT '[]',
      estimated_value text,
      timeline text,
      client_domain text,
      client_name text,
      anonymize_client boolean NOT NULL DEFAULT false,
      client_size_band size_band,
      client_type text,
      quality_score integer NOT NULL DEFAULT 0,
      quality_breakdown jsonb,
      attachments jsonb DEFAULT '[]',
      status lead_status NOT NULL DEFAULT 'open',
      expires_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;

  // 6. Create lead_shares table
  console.log("6. Creating lead_shares table...");
  await sql`
    CREATE TABLE IF NOT EXISTS lead_shares (
      id text PRIMARY KEY,
      lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      shared_with_firm_id text NOT NULL REFERENCES service_firms(id) ON DELETE CASCADE,
      shared_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at timestamp,
      claimed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
