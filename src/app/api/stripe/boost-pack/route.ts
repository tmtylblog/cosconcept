/**
 * POST /api/stripe/boost-pack
 *
 * Creates a Stripe Checkout session for a one-time Boost Pack purchase.
 * 50 enrichment credits for $100.
 *
 * Requires Pro plan or higher.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  // Check plan — must be Pro or Enterprise
  const [sub] = await db
    .select({ plan: subscriptions.plan, stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);

  if (!sub || sub.plan === "free") {
    return NextResponse.json(
      { error: "Boost Packs require a Pro plan. Please upgrade first." },
      { status: 403 }
    );
  }

  const boostPriceId = process.env.STRIPE_BOOST_PACK_PRICE_ID;
  if (!boostPriceId) {
    console.error("[BoostPack] STRIPE_BOOST_PACK_PRICE_ID not configured");
    return NextResponse.json(
      { error: "Boost Pack not available — contact support" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: sub.stripeCustomerId.startsWith("pending_") ? undefined : sub.stripeCustomerId,
    line_items: [
      {
        price: boostPriceId,
        quantity: 1,
      },
    ],
    metadata: {
      organizationId: orgId,
      type: "boost_pack",
    },
    success_url: `${baseUrl}/firm/experts?boost=success`,
    cancel_url: `${baseUrl}/firm/experts?boost=canceled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
