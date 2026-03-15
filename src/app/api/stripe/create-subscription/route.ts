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
    // Create a subscription with incomplete status so we can confirm payment
    // on the client with Stripe Elements
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { organizationId, plan },
      expand: ["latest_invoice"],
    });

    step = "resolve_client_secret";
    // Get the invoice (expanded above)
    const invoice = subscription.latest_invoice as Stripe.Invoice | string | null;
    const invoiceId = typeof invoice === "string" ? invoice : invoice?.id;
    if (!invoiceId) {
      return NextResponse.json(
        { error: "No invoice on subscription" },
        { status: 500 }
      );
    }

    // Get the payment intent ID from the invoice
    const invoiceObj = typeof invoice === "string"
      ? await stripe.invoices.retrieve(invoice)
      : invoice;
    const paymentIntentId = typeof invoiceObj.payment_intent === "string"
      ? invoiceObj.payment_intent
      : invoiceObj.payment_intent?.id;

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "No payment_intent on invoice" },
        { status: 500 }
      );
    }

    // Retrieve the PaymentIntent directly to get the client_secret
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
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
