import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: env vars exist
  results.envCheck = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_length: process.env.DATABASE_URL?.length,
    DATABASE_URL_ends_newline: process.env.DATABASE_URL?.endsWith("\n"),
    DATABASE_URL_ends_space: process.env.DATABASE_URL?.endsWith(" "),
    BETTER_AUTH_SECRET: !!process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_SECRET_length: process.env.BETTER_AUTH_SECRET?.length,
    BETTER_AUTH_SECRET_ends_newline: process.env.BETTER_AUTH_SECRET?.endsWith("\n"),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_URL_ends_newline: process.env.BETTER_AUTH_URL?.endsWith("\n"),
  };

  // Test 2: database connection
  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    results.dbConnection = { ok: true, rows: result.rows?.length };
  } catch (err) {
    results.dbConnection = {
      ok: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 3),
    };
  }

  // Test 3: list ALL tables in the database
  try {
    const result = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    results.allTables = result.rows?.map((r: Record<string, unknown>) => r.table_name);
  } catch (err) {
    results.allTables = { ok: false, error: (err as Error).message };
  }

  // Test 4: users table (plural — our schema)
  try {
    const result = await db.execute(sql`SELECT count(*) as cnt FROM "users"`);
    results.usersTable = { ok: true, count: result.rows?.[0]?.cnt };
  } catch (err) {
    results.usersTable = { ok: false, error: (err as Error).message };
  }

  // Test 5: sessions table (plural)
  try {
    const result = await db.execute(sql`SELECT count(*) as cnt FROM "sessions"`);
    results.sessionsTable = { ok: true, count: result.rows?.[0]?.cnt };
  } catch (err) {
    results.sessionsTable = { ok: false, error: (err as Error).message };
  }

  // Test 6: accounts table (plural)
  try {
    const result = await db.execute(sql`SELECT count(*) as cnt FROM "accounts"`);
    results.accountsTable = { ok: true, count: result.rows?.[0]?.cnt };
  } catch (err) {
    results.accountsTable = { ok: false, error: (err as Error).message };
  }

  // Test 7: check users table columns to verify schema
  try {
    const result = await db.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    results.usersColumns = result.rows;
  } catch (err) {
    results.usersColumns = { ok: false, error: (err as Error).message };
  }

  return NextResponse.json(results, { status: 200 });
}
