"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { AlertCircle } from "lucide-react";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface CheckoutModalProps {
  plan: "pro" | "enterprise";
  interval: "monthly" | "yearly";
  organizationId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Inline embedded Stripe checkout — renders directly in the page flow,
 * not as a modal overlay. Parent component handles the header/back button.
 */
export default function CheckoutModal({
  plan,
  interval,
  organizationId,
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

  if (!stripePromise) {
    return (
      <div className="rounded-cos-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Stripe is not configured. Please contact support.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-cos-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
