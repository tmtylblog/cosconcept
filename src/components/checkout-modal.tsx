"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { PLAN_DISPLAY_NAMES, PLAN_PRICES } from "@/lib/billing/plan-limits";
import { Loader2, X, AlertCircle } from "lucide-react";

// Initialize Stripe.js once outside the component
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export interface CheckoutModalProps {
  plan: "pro" | "enterprise";
  interval: "monthly" | "yearly";
  organizationId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Inner form component — must be rendered inside <Elements> provider
 * so useStripe() / useElements() have access to the Stripe context.
 */
function CheckoutForm({
  plan,
  interval,
  onSuccess,
  onCancel,
}: {
  plan: "pro" | "enterprise";
  interval: "monthly" | "yearly";
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = PLAN_PRICES[plan];
  const displayPrice =
    interval === "yearly" && price.yearly != null
      ? price.yearly
      : price.monthly;
  const periodLabel = interval === "yearly" ? "/yr" : "/mo";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/settings/billing?success=true`,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(
        confirmError.message ?? "Payment failed. Please try again."
      );
      setSubmitting(false);
    } else {
      // Payment succeeded (or requires no redirect) — notify parent
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Plan summary */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
        <p className="text-sm text-cos-slate">Subscribing to</p>
        <p className="mt-1 font-heading text-lg font-bold text-cos-midnight">
          {PLAN_DISPLAY_NAMES[plan]}
        </p>
        <p className="mt-0.5 font-heading text-2xl font-bold text-cos-electric">
          ${displayPrice}
          <span className="text-sm font-normal text-cos-slate">
            {periodLabel}
          </span>
        </p>
      </div>

      {/* Stripe PaymentElement */}
      <div className="min-h-[200px]">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-cos-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elements || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Subscribe"
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * Checkout modal with embedded Stripe PaymentElement.
 * Creates an incomplete subscription server-side, then lets the user
 * confirm payment inline without leaving the app.
 */
export function CheckoutModal({
  plan,
  interval,
  organizationId,
  onSuccess,
  onCancel,
}: CheckoutModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
    [onCancel]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Create the incomplete subscription to get a clientSecret
  useEffect(() => {
    let cancelled = false;

    async function createSubscription() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/stripe/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, plan, interval }),
        });
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Failed to initialize checkout.");
          return;
        }

        setClientSecret(data.clientSecret);
      } catch {
        if (!cancelled) {
          setError("Network error — please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    createSubscription();
    return () => {
      cancelled = true;
    };
  }, [organizationId, plan, interval]);

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md rounded-cos-2xl border border-cos-border bg-cos-surface-raised p-6 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-full p-1 text-cos-slate hover:bg-cos-surface hover:text-cos-midnight"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <h3 className="mb-5 font-heading text-lg font-semibold text-cos-midnight">
          Complete Your Upgrade
        </h3>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
            <p className="text-sm text-cos-slate">
              Setting up your subscription...
            </p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-cos-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onCancel}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Payment form */}
        {!loading && !error && clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#4F46E5",
                  borderRadius: "8px",
                  fontFamily:
                    'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
                },
              },
            }}
          >
            <CheckoutForm
              plan={plan}
              interval={interval}
              onSuccess={onSuccess}
              onCancel={onCancel}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
