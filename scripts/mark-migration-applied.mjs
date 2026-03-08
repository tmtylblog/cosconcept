/**
 * Mark the 0000 migration as applied in the Drizzle migrations table.
 * Run this when the database has the schema but the migrations table is out of sync.
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

// Read the migration file and compute its hash (Drizzle uses SHA256 of content)
const migrationContent = readFileSync("./drizzle/0000_mute_blink.sql", "utf-8");
const hash = createHash("sha256").update(migrationContent).digest("hex");

// Check if drizzle schema + table exists
await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`;

// Check if already applied
const existing = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
if (existing.length > 0) {
  console.log("Migration 0000 already tracked.");
} else {
  await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${1772873220682})`;
  console.log("Migration 0000 marked as applied. Hash:", hash);
}

await sql.end();
