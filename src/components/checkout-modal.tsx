"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { X } from "lucide-react";
import { PLAN_DISPLAY_NAMES, PLAN_PRICES } from "@/lib/billing/plan-limits";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface CheckoutModalProps {
  plan: "pro" | "enterprise";
  interval: "monthly" | "yearly";
  organizationId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CheckoutModal({
  plan,
  interval,
  organizationId,
  onCancel,
}: CheckoutModalProps) {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/stripe/create-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, plan, interval }),
    });
    const data = await res.json();
    if (!res.ok || !data.clientSecret) {
      setError(data.error || "Failed to initialize checkout");
      throw new Error(data.error || "No client secret");
    }
    return data.clientSecret;
  }, [organizationId, plan, interval]);

  const price = PLAN_PRICES[plan];
  const displayPrice = interval === "yearly"
    ? `$${((price.yearly ?? price.monthly * 10) / 12).toFixed(0)}/mo (billed annually)`
    : `$${price.monthly}/mo`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-cos-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cos-border bg-white px-6 py-4 rounded-t-cos-xl">
          <div>
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Upgrade to {PLAN_DISPLAY_NAMES[plan]}
            </h2>
            <p className="text-sm text-cos-slate">{displayPrice}</p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full text-cos-slate hover:bg-cos-cloud hover:text-cos-midnight transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Embedded Checkout */}
        <div className="p-6">
          {error ? (
            <div className="rounded-cos-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
}
