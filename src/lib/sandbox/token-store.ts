/**
 * DB-backed one-time token store for sandbox session handoff.
 *
 * Uses the existing Better Auth `verifications` table to store tokens.
 * Tokens expire after 5 minutes. This works across Vercel serverless
 * instances (unlike an in-memory Map).
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { verifications } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

const IDENTIFIER = "sandbox-login-token";
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface TokenPayload {
  userId: string;
  orgId: string;
  domain?: string;
  mode?: "onboarding" | "pre-onboarded";
}

/** Create a one-time login token. Returns the token string. */
export async function createToken(payload: TokenPayload): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();

  await db.insert(verifications).values({
    id: token,
    identifier: IDENTIFIER,
    value: JSON.stringify(payload),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  return token;
}

/** Consume a one-time token. Returns the entry if valid, null if expired/missing. */
export async function consumeToken(token: string): Promise<TokenPayload | null> {
  const [row] = await db
    .select({ value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(
      and(
        eq(verifications.id, token),
        eq(verifications.identifier, IDENTIFIER),
        gt(verifications.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  // Delete the token (one-time use)
  await db.delete(verifications).where(eq(verifications.id, token));

  return JSON.parse(row.value) as TokenPayload;
}
