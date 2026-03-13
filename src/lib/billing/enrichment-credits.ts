/**
 * Enrichment Credit Management
 *
 * Manages per-org credit balances for expert enrichment.
 * - Free tier: 5 auto-enrichments on signup (no user action)
 * - Pro tier: 100 credits granted on upgrade (user picks who to enrich)
 * - Boost Pack: 50 credits for $100 (one-time Stripe purchase)
 *
 * All credit mutations are atomic (SELECT FOR UPDATE) and logged
 * to enrichment_credit_transactions for audit.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  enrichmentCredits,
  enrichmentCreditTransactions,
} from "@/lib/db/schema";

type TransactionType =
  | "free_auto"
  | "pro_grant"
  | "boost_pack"
  | "manual_grant"
  | "enrichment_use";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Get or create the credit balance row for an org.
 * New orgs start with 5 free credits (for auto-enrichment on signup).
 */
export async function getOrCreateCreditBalance(organizationId: string) {
  const [existing] = await db
    .select()
    .from(enrichmentCredits)
    .where(eq(enrichmentCredits.organizationId, organizationId))
    .limit(1);

  if (existing) return existing;

  const id = generateId("ec");
  const [created] = await db
    .insert(enrichmentCredits)
    .values({
      id,
      organizationId,
      totalCredits: 5,
      usedCredits: 0,
      freeAutoUsed: 0,
      proCreditsGranted: false,
    })
    .onConflictDoNothing()
    .returning();

  // Race: another request may have inserted. Re-fetch.
  if (!created) {
    const [refetched] = await db
      .select()
      .from(enrichmentCredits)
      .where(eq(enrichmentCredits.organizationId, organizationId))
      .limit(1);
    return refetched!;
  }

  return created;
}

/**
 * Returns available credits (totalCredits - usedCredits).
 */
export async function getAvailableCredits(organizationId: string): Promise<number> {
  const balance = await getOrCreateCreditBalance(organizationId);
  return balance.totalCredits - balance.usedCredits;
}

// ─── Consume ─────────────────────────────────────────────────────────────────

/**
 * Atomically consume 1 credit for expert enrichment.
 * Uses SELECT FOR UPDATE to prevent race conditions.
 * Throws if insufficient credits.
 */
export async function consumeCredit(
  organizationId: string,
  expertProfileId: string
): Promise<{ availableCredits: number }> {
  // Use raw SQL for SELECT FOR UPDATE (Drizzle doesn't support it natively)
  const result = await db.execute(sql`
    WITH locked AS (
      SELECT id, total_credits, used_credits
      FROM enrichment_credits
      WHERE organization_id = ${organizationId}
      FOR UPDATE
    ),
    updated AS (
      UPDATE enrichment_credits
      SET used_credits = used_credits + 1,
          updated_at = NOW()
      FROM locked
      WHERE enrichment_credits.id = locked.id
        AND locked.total_credits > locked.used_credits
      RETURNING enrichment_credits.total_credits, enrichment_credits.used_credits
    )
    SELECT * FROM updated
  `);

  if (!result.rows.length) {
    throw new Error("Insufficient enrichment credits");
  }

  const row = result.rows[0] as { total_credits: number; used_credits: number };

  // Log transaction
  await db.insert(enrichmentCreditTransactions).values({
    id: generateId("ect"),
    organizationId,
    type: "enrichment_use",
    amount: -1,
    balanceBefore: row.total_credits - row.used_credits + 1,
    balanceAfter: row.total_credits - row.used_credits,
    expertProfileId,
  });

  return { availableCredits: row.total_credits - row.used_credits };
}

/**
 * Record a free auto-enrichment (the 5 that happen on signup).
 * Does NOT consume from the credit pool — these are separate.
 */
export async function recordFreeAutoEnrich(
  organizationId: string,
  expertProfileId: string
): Promise<void> {
  await db.execute(sql`
    UPDATE enrichment_credits
    SET free_auto_used = LEAST(free_auto_used + 1, 5),
        updated_at = NOW()
    WHERE organization_id = ${organizationId}
  `);

  // Log for audit
  const balance = await getOrCreateCreditBalance(organizationId);
  await db.insert(enrichmentCreditTransactions).values({
    id: generateId("ect"),
    organizationId,
    type: "free_auto",
    amount: 0, // No credit consumed — free auto-enrich
    balanceBefore: balance.totalCredits - balance.usedCredits,
    balanceAfter: balance.totalCredits - balance.usedCredits,
    expertProfileId,
  });
}

// ─── Grant ───────────────────────────────────────────────────────────────────

/**
 * Grant credits to an org. Used by Pro upgrade, Boost Pack, admin grants.
 */
export async function grantCredits(
  organizationId: string,
  amount: number,
  type: TransactionType,
  meta?: { stripePaymentIntentId?: string; note?: string; expertProfileId?: string }
): Promise<{ totalCredits: number; availableCredits: number }> {
  // Ensure balance row exists
  await getOrCreateCreditBalance(organizationId);

  const result = await db.execute(sql`
    UPDATE enrichment_credits
    SET total_credits = total_credits + ${amount},
        updated_at = NOW()
    WHERE organization_id = ${organizationId}
    RETURNING total_credits, used_credits
  `);

  const row = result.rows[0] as { total_credits: number; used_credits: number };

  await db.insert(enrichmentCreditTransactions).values({
    id: generateId("ect"),
    organizationId,
    type,
    amount,
    balanceBefore: row.total_credits - amount - row.used_credits,
    balanceAfter: row.total_credits - row.used_credits,
    expertProfileId: meta?.expertProfileId ?? null,
    stripePaymentIntentId: meta?.stripePaymentIntentId ?? null,
    note: meta?.note ?? null,
  });

  return {
    totalCredits: row.total_credits,
    availableCredits: row.total_credits - row.used_credits,
  };
}

/**
 * Idempotent: Grant 100 credits on first Pro upgrade.
 * Safe to call multiple times — checks proCreditsGranted flag.
 */
export async function grantProCredits(
  organizationId: string
): Promise<{ granted: boolean }> {
  const balance = await getOrCreateCreditBalance(organizationId);

  if (balance.proCreditsGranted) {
    return { granted: false }; // Already granted
  }

  // Atomically set flag + grant credits
  const result = await db.execute(sql`
    UPDATE enrichment_credits
    SET total_credits = total_credits + 100,
        pro_credits_granted = true,
        updated_at = NOW()
    WHERE organization_id = ${organizationId}
      AND pro_credits_granted = false
    RETURNING total_credits, used_credits
  `);

  if (!result.rows.length) {
    return { granted: false }; // Race: another request already granted
  }

  const row = result.rows[0] as { total_credits: number; used_credits: number };

  await db.insert(enrichmentCreditTransactions).values({
    id: generateId("ect"),
    organizationId,
    type: "pro_grant",
    amount: 100,
    balanceBefore: row.total_credits - 100 - row.used_credits,
    balanceAfter: row.total_credits - row.used_credits,
  });

  return { granted: true };
}

/**
 * Grant 50 credits from a Boost Pack purchase.
 * Deduped by stripePaymentIntentId to handle webhook retries.
 */
export async function grantBoostPack(
  organizationId: string,
  stripePaymentIntentId: string
): Promise<{ granted: boolean }> {
  // Check for duplicate
  const [existing] = await db
    .select({ id: enrichmentCreditTransactions.id })
    .from(enrichmentCreditTransactions)
    .where(eq(enrichmentCreditTransactions.stripePaymentIntentId, stripePaymentIntentId))
    .limit(1);

  if (existing) {
    return { granted: false }; // Already processed
  }

  await grantCredits(organizationId, 50, "boost_pack", { stripePaymentIntentId });
  return { granted: true };
}

/**
 * Get recent transactions for an org (for display in UI).
 */
export async function getTransactions(
  organizationId: string,
  limit = 20
) {
  return db
    .select()
    .from(enrichmentCreditTransactions)
    .where(eq(enrichmentCreditTransactions.organizationId, organizationId))
    .orderBy(sql`created_at DESC`)
    .limit(limit);
}
