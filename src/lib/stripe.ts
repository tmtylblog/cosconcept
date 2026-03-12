import Stripe from "stripe";

/**
 * Stripe client singleton.
 * Only initialize when STRIPE_SECRET_KEY is available.
 */

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(key, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Price ID mapping for subscription plans.
 */
export const STRIPE_PRICES = {
  pro: {
    monthly: (process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "").trim(),
    yearly: (process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? "").trim(),
  },
  enterprise: {
    monthly: (process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID ?? "").trim(),
    yearly: (process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID ?? "").trim(),
  },
} as const;
