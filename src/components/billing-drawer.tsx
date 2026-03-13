"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, useActiveOrganization } from "@/lib/auth-client";
import { usePlan } from "@/hooks/use-plan";
import {
  PLAN_LIMITS,
  PLAN_DISPLAY_NAMES,
  PLAN_TAGLINES,
  PLAN_PRICES,
  type PlanId,
} from "@/lib/billing/plan-limits";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const plans: PlanId[] = ["free", "pro", "enterprise"];

interface BillingDrawerProps {
  open: boolean;
  onClose: () => void;
  highlightPlan?: PlanId;
}

export function BillingDrawer({ open, onClose, highlightPlan }: BillingDrawerProps) {
  const { data: activeOrg } = useActiveOrganization();
  const { plan: currentPlan, isLoading: planLoading } = usePlan();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleUpgrade(plan: "pro" | "enterprise") {
    let effectiveOrgId = activeOrg?.id;
    if (!effectiveOrgId) {
      try {
        const { data: orgs } = await authClient.organization.list();
        const orgList = (orgs as { id: string }[]) ?? [];
        if (orgList.length > 0) {
          effectiveOrgId = orgList[0].id;
          await authClient.organization.setActive({ organizationId: effectiveOrgId });
        }
      } catch {
        // fall through
      }
    }
    if (!effectiveOrgId) {
      setError("No organization found. Please refresh and try again.");
      return;
    }

    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: effectiveOrgId, plan, interval: "monthly" }),
      });
      const data = await res.json();

      if (res.status === 503 || data.code === "stripe_not_configured") {
        setError("Billing is not yet active — check back soon.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-cos-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Upgrade Your Plan
            </h2>
            <p className="text-sm text-cos-slate">
              Unlock more features for your firm
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-cos-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {plans.map((plan) => {
              const limits = PLAN_LIMITS[plan];
              const price = PLAN_PRICES[plan];
              const isCurrent = plan === currentPlan;
              const isHighlighted = plan === highlightPlan;
              const isEnterprise = plan === "enterprise";

              return (
                <div
                  key={plan}
                  className={cn(
                    "rounded-cos-2xl border p-5 transition-colors",
                    isHighlighted && !isCurrent
                      ? "border-cos-electric bg-cos-electric/5 ring-1 ring-cos-electric"
                      : isCurrent
                        ? "border-cos-signal bg-cos-signal/5"
                        : "border-cos-border bg-cos-surface-raised"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading text-base font-semibold text-cos-midnight">
                        {PLAN_DISPLAY_NAMES[plan]}
                      </h3>
                      <p className="text-xs text-cos-electric">
                        {PLAN_TAGLINES[plan]}
                      </p>
                    </div>
                    <p className="font-heading text-xl font-bold text-cos-midnight">
                      {isEnterprise ? "Custom" : `$${price.monthly}/mo`}
                    </p>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-sm text-cos-slate-dim">
                    <li>
                      {limits.potentialMatchesPerWeek === Infinity
                        ? "Unlimited"
                        : limits.potentialMatchesPerWeek}{" "}
                      potential matches/week
                    </li>
                    <li>
                      {limits.aiPerfectMatchesPerMonth === Infinity
                        ? "Unlimited"
                        : limits.aiPerfectMatchesPerMonth}{" "}
                      AI Perfect {limits.aiPerfectMatchesPerMonth === 1 ? "Match" : "Matches"}/mo
                    </li>
                    <li>
                      {limits.unlimitedMessaging ? "Unlimited messaging" : "Limited messaging"}
                    </li>
                    {limits.canSearchNetwork && limits.enhancedProfile && (
                      <li className="text-cos-signal">Enhanced profile + network search</li>
                    )}
                  </ul>

                  <div className="mt-4">
                    {isCurrent ? (
                      <Button variant="secondary" size="sm" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : isEnterprise ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open("https://joincollectiveos.com/contact", "_blank")}
                      >
                        Contact Us
                      </Button>
                    ) : plan === "free" ? (
                      <Button variant="outline" size="sm" disabled className="w-full">
                        Free
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleUpgrade(plan)}
                        disabled={loading === plan || planLoading}
                      >
                        {loading === plan ? "..." : `Upgrade to ${PLAN_DISPLAY_NAMES[plan]}`}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
