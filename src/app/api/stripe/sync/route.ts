import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import type { PlanId } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/sync
 * Pulls the latest subscription state from Stripe and syncs it to the DB.
 * Used after checkout success and portal return so the app reflects reality
 * without relying on webhooks (essential for dev, good fallback for prod).
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured", code: "stripe_not_configured" },
      { status: 503 }
    );
  }

  try {
    const { organizationId } = (await req.json()) as {
      organizationId: string;
    };

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    // No Stripe customer yet — nothing to sync
    if (!sub?.stripeCustomerId || sub.stripeCustomerId.startsWith("pending_")) {
      return NextResponse.json({ synced: false, reason: "no_stripe_customer", plan: "free" });
    }

    const stripe = getStripe();
    const stripeSubs = await stripe.subscriptions.list({
      customer: sub.stripeCustomerId,
      status: "all",
      limit: 5,
    });

    // Find the most relevant subscription (active > trialing > others)
    const activeSub =
      stripeSubs.data.find((s) => s.status === "active") ??
      stripeSubs.data.find((s) => s.status === "trialing") ??
      stripeSubs.data.find(
        (s) => s.status !== "canceled" && s.status !== "incomplete_expired"
      );

    if (!activeSub) {
      // No active subscription — revert to free
      await db
        .update(subscriptions)
        .set({
          plan: "free",
          status: "canceled",
          stripeSubscriptionId: null,
          stripePriceId: null,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, organizationId));

      return NextResponse.json({ synced: true, plan: "free", status: "canceled" });
    }

    // Determine plan from price ID
    const priceId = activeSub.items.data[0]?.price.id;
    const plan = resolvePlan(priceId);

    const item = activeSub.items.data[0];
    const periodStart = item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : undefined;
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : undefined;

    await db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: activeSub.id,
        stripePriceId: priceId,
        plan,
        status: activeSub.status as
          | "active"
          | "trialing"
          | "past_due"
          | "canceled"
          | "unpaid"
          | "incomplete",
        ...(periodStart && { currentPeriodStart: periodStart }),
        ...(periodEnd && { currentPeriodEnd: periodEnd }),
        cancelAtPeriodEnd: activeSub.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    return NextResponse.json({
      synced: true,
      plan,
      status: activeSub.status,
      cancelAtPeriodEnd: activeSub.cancel_at_period_end,
    });
  } catch (error) {
    console.error("[Stripe] Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync subscription" },
      { status: 500 }
    );
  }
}

/**
 * Resolve plan ID from a Stripe price ID.
 * Checks env vars first, falls back to "pro" for any paid subscription.
 */
function resolvePlan(priceId: string | undefined): PlanId {
  if (!priceId) return "free";

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proYearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID;
  const entMonthly = process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID;
  const entYearly = process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID;

  if (priceId === proMonthly || priceId === proYearly) return "pro";
  if (priceId === entMonthly || priceId === entYearly) return "enterprise";

  // Price exists but doesn't match any configured env var — default to pro
  // (any paid subscription should at minimum get Pro features)
  return "pro";
}
