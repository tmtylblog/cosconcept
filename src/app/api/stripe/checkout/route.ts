import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for upgrading a subscription.
 * Body: { organizationId, plan: "pro" | "enterprise", interval: "monthly" | "yearly" }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not yet configured", code: "stripe_not_configured" },
      { status: 503 }
    );
  }

  let step = "parse_body";
  try {
    const { organizationId, plan, interval } = (await req.json()) as {
      organizationId: string;
      plan: "pro" | "enterprise";
      interval: "monthly" | "yearly";
    };

    if (!organizationId || !plan || !interval) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    step = "resolve_price";
    const priceId = STRIPE_PRICES[plan]?.[interval];
    if (!priceId) {
      return NextResponse.json(
        { error: `Invalid plan or interval (plan=${plan}, interval=${interval}, priceId=${priceId})` },
        { status: 400 }
      );
    }

    step = "db_query";
    // Get or create Stripe customer for this org
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    step = "stripe_init";
    const stripe = getStripe();
    const existingCustomerId = sub?.stripeCustomerId;

    // Only use customer ID if it's a real Stripe customer (starts with "cus_")
    const hasRealCustomer =
      existingCustomerId && existingCustomerId.startsWith("cus_");

    step = "stripe_create_session";
    // Build session params — if no real customer, let Stripe Checkout create one
    // automatically. This avoids needing rak_customer_write permission on restricted keys.
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription" as const,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.BETTER_AUTH_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.BETTER_AUTH_URL}/settings/billing?canceled=true`,
      metadata: { organizationId, plan },
    };

    if (hasRealCustomer) {
      sessionParams.customer = existingCustomerId;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error(`[Stripe] Checkout error at step="${step}":`, error);
    const message =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Checkout failed at step "${step}": ${message}` },
      { status: 500 }
    );
  }
}
