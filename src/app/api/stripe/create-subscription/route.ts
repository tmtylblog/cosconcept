import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/create-subscription
 * Creates a Stripe subscription with payment_behavior: 'default_incomplete'
 * and returns the client_secret for the PaymentIntent so the client can
 * confirm payment via Stripe Elements (embedded checkout).
 *
 * Body: { organizationId, plan: "pro" | "enterprise", interval: "monthly" | "yearly" }
 * Response: { subscriptionId, clientSecret, customerId }
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
        {
          error: `Invalid plan or interval (plan=${plan}, interval=${interval}, priceId=${priceId})`,
        },
        { status: 400 }
      );
    }

    step = "db_query";
    // Check if there's already a Stripe customer for this org
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    step = "stripe_init";
    const stripe = getStripe();

    step = "resolve_customer";
    let customerId: string;

    const hasRealCustomer =
      existingSub?.stripeCustomerId &&
      existingSub.stripeCustomerId.startsWith("cus_");

    if (hasRealCustomer) {
      customerId = existingSub.stripeCustomerId;
    } else {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: session.user.email ?? undefined,
        metadata: { organizationId },
      });
      customerId = customer.id;
    }

    step = "create_subscription";
    // Create a subscription with incomplete status so we get a PaymentIntent
    // client secret to confirm on the client with Stripe Elements
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { organizationId, plan },
      expand: ["latest_invoice.payment_intent"],
    });

    // Extract the client secret from the expanded PaymentIntent.
    // The expand param causes latest_invoice to be a full Invoice object
    // with payment_intent expanded as a PaymentIntent object.
    const invoice = subscription.latest_invoice as Stripe.Invoice & {
      payment_intent?: Stripe.PaymentIntent | string | null;
    };
    if (!invoice || typeof invoice === "string") {
      return NextResponse.json(
        { error: "Failed to expand invoice on subscription" },
        { status: 500 }
      );
    }

    const paymentIntent = invoice.payment_intent;
    if (!paymentIntent || typeof paymentIntent === "string") {
      return NextResponse.json(
        { error: "Failed to expand payment_intent on invoice" },
        { status: 500 }
      );
    }

    const clientSecret = paymentIntent.client_secret;
    if (!clientSecret) {
      return NextResponse.json(
        { error: "No client_secret on PaymentIntent" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret,
      customerId,
    });
  } catch (error) {
    console.error(
      `[Stripe] create-subscription error at step="${step}":`,
      error
    );
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Subscription creation failed at step "${step}": ${message}` },
      { status: 500 }
    );
  }
}
