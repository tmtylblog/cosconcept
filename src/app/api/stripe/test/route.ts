import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/stripe/test
 * Quick connectivity test for the Stripe API key.
 * Checks for env var corruption (whitespace), key type, connectivity.
 */
export async function GET() {
  const rawKey = process.env.STRIPE_SECRET_KEY;
  if (!rawKey) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY not set" });
  }

  // Check for common env var corruption
  const trimmedKey = rawKey.trim();
  const hasWhitespace = rawKey !== trimmedKey;
  const keyLength = rawKey.length;
  const trimmedLength = trimmedKey.length;

  const keyType = trimmedKey.startsWith("sk_live_")
    ? "live_secret"
    : trimmedKey.startsWith("sk_test_")
      ? "test_secret"
      : trimmedKey.startsWith("rk_live_")
        ? "live_restricted"
        : trimmedKey.startsWith("rk_test_")
          ? "test_restricted"
          : "unknown";

  const priceId = (process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "(not set)").trim();

  // Use trimmed key for the actual test
  try {
    const stripe = new Stripe(trimmedKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
      timeout: 10000,
    });

    const balance = await stripe.balance.retrieve();
    return NextResponse.json({
      ok: true,
      keyType,
      keyLength,
      trimmedLength,
      hasWhitespace,
      priceId: priceId.substring(0, 25) + "...",
      balanceCurrency: balance.available?.[0]?.currency ?? "unknown",
      message: "Stripe connection OK",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorType = (error as { type?: string })?.type ?? "unknown";
    return NextResponse.json({
      ok: false,
      keyType,
      keyLength,
      trimmedLength,
      hasWhitespace,
      priceId: priceId.substring(0, 25) + "...",
      errorType,
      error: message,
    });
  }
}
