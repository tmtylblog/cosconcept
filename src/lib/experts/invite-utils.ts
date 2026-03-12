/**
 * Shared expert invite utilities.
 * Used by both the front-end invite route and admin invite route.
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifications } from "@/lib/db/schema";

const INVITE_EXPIRY_DAYS = 7;

/**
 * Generate a signed claim token for an expert profile.
 * Stores/upserts the token in the `verifications` table.
 * Returns { token, claimUrl, expiresAt }.
 */
export async function generateClaimToken(expertId: string): Promise<{
  token: string;
  claimUrl: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const identifier = `expert-claim:${expertId}`;

  // Upsert — replace any existing pending invite for this expert
  const existing = await db
    .select({ id: verifications.id })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(verifications)
      .set({ value: token, expiresAt, updatedAt: new Date() })
      .where(eq(verifications.identifier, identifier));
  } else {
    await db.insert(verifications).values({
      id: `vc_${Date.now().toString(36)}`,
      identifier,
      value: token,
      expiresAt,
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://joincollectiveos.com";
  const claimUrl = `${baseUrl}/api/experts/claim?token=${token}&id=${expertId}`;

  return { token, claimUrl, expiresAt };
}

/**
 * Get the invite status for an expert from verifications table.
 * Returns null if no active invite exists.
 */
export async function getInviteStatus(expertId: string): Promise<{
  status: "pending" | "expired";
  expiresAt: Date;
  createdAt: Date;
} | null> {
  const identifier = `expert-claim:${expertId}`;

  const [verification] = await db
    .select({
      expiresAt: verifications.expiresAt,
      createdAt: verifications.createdAt,
    })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .limit(1);

  if (!verification) return null;

  const isExpired = verification.expiresAt < new Date();
  return {
    status: isExpired ? "expired" : "pending",
    expiresAt: verification.expiresAt,
    createdAt: verification.createdAt,
  };
}
