/**
 * Apply only the NEW schema additions for the email/call intelligence features.
 * Skips existing tables/enums and only creates new ones.
 * Then marks 0001 migration as applied.
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

// New SQL to apply — only the tables/columns that don't exist yet
const newStatements = [
  // New enums (using DO block because CREATE TYPE doesn't support IF NOT EXISTS)
  `DO $$ BEGIN CREATE TYPE "public"."call_type" AS ENUM('partnership', 'client', 'unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "public"."meeting_platform" AS ENUM('google_meet', 'zoom', 'teams', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "public"."scheduled_call_status" AS ENUM('pending', 'recording', 'done', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'processing', 'done', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Settings table
  `CREATE TABLE IF NOT EXISTS "settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Scheduled calls table
  `CREATE TABLE IF NOT EXISTS "scheduled_calls" (
    "id" text PRIMARY KEY NOT NULL,
    "firm_id" text NOT NULL REFERENCES "service_firms"("id") ON DELETE CASCADE,
    "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
    "meeting_title" text,
    "meeting_time" timestamp,
    "meeting_link" text,
    "platform" "meeting_platform" DEFAULT 'other',
    "participants" jsonb,
    "partnership_id" text REFERENCES "partnerships"("id") ON DELETE SET NULL,
    "call_type" "call_type" DEFAULT 'unknown',
    "source_email_thread_id" text REFERENCES "email_threads"("id") ON DELETE SET NULL,
    "transcript_id" text,
    "recall_bot_id" text,
    "status" "scheduled_call_status" NOT NULL DEFAULT 'pending',
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Call recordings table
  `CREATE TABLE IF NOT EXISTS "call_recordings" (
    "id" text PRIMARY KEY NOT NULL,
    "firm_id" text NOT NULL REFERENCES "service_firms"("id") ON DELETE CASCADE,
    "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
    "scheduled_call_id" text REFERENCES "scheduled_calls"("id") ON DELETE SET NULL,
    "call_type" "call_type" DEFAULT 'unknown',
    "partner_firm_id" text REFERENCES "service_firms"("id") ON DELETE SET NULL,
    "platform" "meeting_platform" DEFAULT 'other',
    "duration_seconds" integer,
    "processed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Call transcripts table
  `CREATE TABLE IF NOT EXISTS "call_transcripts" (
    "id" text PRIMARY KEY NOT NULL,
    "call_recording_id" text REFERENCES "call_recordings"("id") ON DELETE CASCADE,
    "scheduled_call_id" text REFERENCES "scheduled_calls"("id") ON DELETE SET NULL,
    "full_text" text,
    "segments" jsonb,
    "processing_status" "transcript_status" NOT NULL DEFAULT 'pending',
    "deepgram_job_id" text,
    "coaching_report_id" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Coaching reports table
  `CREATE TABLE IF NOT EXISTS "coaching_reports" (
    "id" text PRIMARY KEY NOT NULL,
    "call_recording_id" text REFERENCES "call_recordings"("id") ON DELETE CASCADE,
    "scheduled_call_id" text REFERENCES "scheduled_calls"("id") ON DELETE SET NULL,
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
  )`,

  // Add new columns to email_approval_queue (if they don't exist)
  `ALTER TABLE "email_approval_queue" ADD COLUMN IF NOT EXISTS "confidence" real`,
  `ALTER TABLE "email_approval_queue" ADD COLUMN IF NOT EXISTS "in_reply_to_thread_id" text REFERENCES "email_threads"("id") ON DELETE SET NULL`,
];

console.log("Applying new schema additions...\n");

for (const stmt of newStatements) {
  try {
    await sql.unsafe(stmt);
    const firstLine = stmt.split("\n")[0].trim().slice(0, 80);
    console.log(`✅ ${firstLine}`);
  } catch (err) {
    if (err.code === "42710" || err.code === "42P07") {
      // Type or table already exists — skip
      const firstLine = stmt.split("\n")[0].trim().slice(0, 80);
      console.log(`⏭ Already exists: ${firstLine}`);
    } else {
      console.error(`❌ Failed: ${stmt.split("\n")[0].trim()}`);
      console.error(`   Error: ${err.message}`);
    }
  }
}

// Mark 0001 migration as applied
const migrationContent = readFileSync("./drizzle/0001_happy_mantis.sql", "utf-8");
const hash = createHash("sha256").update(migrationContent).digest("hex");

const existing = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
if (existing.length > 0) {
  console.log("\n✅ Migration 0001 already tracked");
} else {
  await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${1772968062927})`;
  console.log("\n✅ Migration 0001 marked as applied");
}

await sql.end();
console.log("\n🚀 Done! Schema is up to date.");
