/**
 * In-memory one-time token store for sandbox session handoff.
 *
 * Tokens expire after 60 seconds. This avoids a DB migration and works
 * because create + consume happen within seconds on the same deployment.
 */

import crypto from "crypto";

interface TokenEntry {
  userId: string;
  orgId: string;
  expiresAt: number;
}

const tokens = new Map<string, TokenEntry>();

/** Prune expired tokens (called on every create/consume) */
function prune() {
  const now = Date.now();
  for (const [key, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(key);
  }
}

/** Create a one-time login token. Returns the token string. */
export function createToken(userId: string, orgId: string): string {
  prune();
  const token = crypto.randomBytes(32).toString("hex");
  tokens.set(token, {
    userId,
    orgId,
    expiresAt: Date.now() + 60_000, // 60 seconds
  });
  return token;
}

/** Consume a one-time token. Returns the entry if valid, null if expired/missing. */
export function consumeToken(token: string): { userId: string; orgId: string } | null {
  prune();
  const entry = tokens.get(token);
  if (!entry) return null;
  tokens.delete(token);
  return { userId: entry.userId, orgId: entry.orgId };
}
