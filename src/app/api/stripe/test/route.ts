import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/stripe/test
 * Quick connectivity test for the Stripe API key.
 * Returns key type, permissions check, etc.
 */
export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY not set" });
  }

  const keyType = key.startsWith("sk_live_")
    ? "live_secret"
    : key.startsWith("sk_test_")
      ? "test_secret"
      : key.startsWith("rk_live_")
        ? "live_restricted"
        : key.startsWith("rk_test_")
          ? "test_restricted"
          : "unknown";

  const priceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "(not set)";

  try {
    const stripe = getStripe();
    // Simple read-only call to test connectivity
    const balance = await stripe.balance.retrieve();
    return NextResponse.json({
      ok: true,
      keyType,
      priceId: priceId.substring(0, 20) + "...",
      balanceCurrency: balance.available?.[0]?.currency ?? "unknown",
      message: "Stripe connection OK",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      keyType,
      priceId: priceId.substring(0, 20) + "...",
      error: message,
    });
  }
}
