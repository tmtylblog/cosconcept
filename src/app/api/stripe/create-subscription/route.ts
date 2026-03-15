import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/create-subscription
 * Creates a Stripe Embedded Checkout session for subscribing to a plan.
 * Returns a clientSecret that the frontend uses with <EmbeddedCheckout />.
 *
 * Body: { organizationId, plan: "pro" | "enterprise", interval: "monthly" | "yearly" }
 * Response: { clientSecret }
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
        { error: `Invalid plan or interval (plan=${plan}, interval=${interval})` },
        { status: 400 }
      );
    }

    step = "db_query";
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    step = "stripe_init";
    const stripe = getStripe();

    step = "resolve_customer";
    let customerId: string | undefined;
    if (existingSub?.stripeCustomerId?.startsWith("cus_")) {
      customerId = existingSub.stripeCustomerId;
    }

    step = "create_checkout_session";
    const appUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://cos-concept.vercel.app";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ui_mode: "embedded",
      return_url: `${appUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { organizationId, plan },
      ...(customerId ? { customer: customerId } : { customer_email: session.user.email ?? undefined }),
    });

    return NextResponse.json({
      clientSecret: checkoutSession.client_secret,
    });
  } catch (error) {
    console.error(`[Stripe] create-subscription error at step="${step}":`, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Subscription creation failed at step "${step}": ${message}` },
      { status: 500 }
    );
  }
}
