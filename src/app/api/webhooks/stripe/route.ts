import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, subscriptionEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PlanId } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for subscription lifecycle.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Log the event for audit
  const eventId = crypto.randomUUID();
  try {
    await db.insert(subscriptionEvents).values({
      id: eventId,
      stripeEventId: event.id,
      eventType: event.type,
      data: event.data.object as unknown as Record<string, unknown>,
      createdAt: new Date(),
    });
  } catch {
    // Duplicate event — already processed
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organizationId;
        const plan = (session.metadata?.plan ?? "pro") as PlanId;

        if (orgId && session.subscription) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const item = sub.items.data[0];
          const periodStart = item?.current_period_start
            ? new Date(item.current_period_start * 1000)
            : new Date();
          const periodEnd = item?.current_period_end
            ? new Date(item.current_period_end * 1000)
            : new Date();

          await db
            .insert(subscriptions)
            .values({
              id: crypto.randomUUID(),
              organizationId: orgId,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: sub.id,
              stripePriceId: item?.price.id,
              plan,
              status: sub.status as "active" | "trialing",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            })
            .onConflictDoUpdate({
              target: subscriptions.organizationId,
              set: {
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: sub.id,
                stripePriceId: item?.price.id,
                plan,
                status: sub.status as "active" | "trialing",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                updatedAt: new Date(),
              },
            });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // Revert to free plan
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
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          await db
            .update(subscriptions)
            .set({
              status: "past_due",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subId));
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          await db
            .update(subscriptions)
            .set({
              status: "active",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subId));
        }
        break;
      }
    }

    // [ANALYTICS] trackEvent("subscription_webhook", { type: event.type, eventId: event.id })

    // Mark event as processed
    await db
      .update(subscriptionEvents)
      .set({ processedAt: new Date() })
      .where(eq(subscriptionEvents.id, eventId));
  } catch (error) {
    console.error("[Stripe Webhook] Processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Sync a Stripe subscription object to the database.
 */
async function syncSubscription(sub: Stripe.Subscription) {
  // Determine plan from price ID
  const priceId = sub.items.data[0]?.price.id;
  let plan: PlanId = "free";
  if (priceId) {
    const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const proYearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    const entMonthly = process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID;
    const entYearly = process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID;

    if (priceId === proMonthly || priceId === proYearly) {
      plan = "pro";
    } else if (priceId === entMonthly || priceId === entYearly) {
      plan = "enterprise";
    }
  }

  const item = sub.items.data[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : undefined;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : undefined;

  await db
    .update(subscriptions)
    .set({
      stripePriceId: priceId,
      plan,
      status: sub.status as "active" | "past_due" | "canceled" | "trialing" | "unpaid" | "incomplete",
      ...(periodStart && { currentPeriodStart: periodStart }),
      ...(periodEnd && { currentPeriodEnd: periodEnd }),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}
