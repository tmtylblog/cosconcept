import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: Try to directly insert and then delete a test user using Drizzle
  // This tests the exact same DB operations Better Auth would do
  const testId = "debug_" + Date.now();
  const testEmail = `debug_${Date.now()}@test.com`;

  try {
    // INSERT user
    await db.insert(schema.users).values({
      id: testId,
      name: "Debug Test",
      email: testEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    results.insertUser = { ok: true };
  } catch (err) {
    results.insertUser = {
      ok: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 5),
    };
  }

  // INSERT account (password hash)
  try {
    await db.insert(schema.accounts).values({
      id: "acc_" + testId,
      userId: testId,
      accountId: testId,
      providerId: "credential",
      password: "fake_hashed_password",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    results.insertAccount = { ok: true };
  } catch (err) {
    results.insertAccount = {
      ok: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 5),
    };
  }

  // INSERT session
  try {
    await db.insert(schema.sessions).values({
      id: "sess_" + testId,
      userId: testId,
      token: "fake_token_" + testId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    results.insertSession = { ok: true };
  } catch (err) {
    results.insertSession = {
      ok: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 5),
    };
  }

  // CLEANUP: delete test data
  try {
    await db.execute(sql`DELETE FROM "sessions" WHERE id = ${"sess_" + testId}`);
    await db.execute(sql`DELETE FROM "accounts" WHERE id = ${"acc_" + testId}`);
    await db.execute(sql`DELETE FROM "users" WHERE id = ${testId}`);
    results.cleanup = { ok: true };
  } catch (err) {
    results.cleanup = { ok: false, error: (err as Error).message };
  }

  // Also test: what columns does the accounts table have?
  try {
    const result = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'accounts' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    results.accountsColumns = result.rows;
  } catch (err) {
    results.accountsColumns = { ok: false, error: (err as Error).message };
  }

  return NextResponse.json(results, { status: 200 });
}
