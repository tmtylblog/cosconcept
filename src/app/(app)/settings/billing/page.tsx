"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { usePlan } from "@/hooks/use-plan";
import {
  PLAN_LIMITS,
  PLAN_DISPLAY_NAMES,
  PLAN_TAGLINES,
  PLAN_PRICES,
  type PlanId,
} from "@/lib/billing/plan-limits";
import { cn } from "@/lib/utils";

const plans: PlanId[] = ["free", "pro", "enterprise"];

export default function BillingPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { plan: currentPlan, usage, isLoading: planLoading } = usePlan();
  const [loading, setLoading] = useState<string | null>(null);

  const orgId = activeOrg?.id ?? "";

  async function handleUpgrade(plan: "pro" | "enterprise") {
    if (!orgId) return;
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          plan,
          interval: "monthly",
        }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    if (!orgId) return;
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Billing & Plans
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Manage your subscription and billing details
          {activeOrg?.name ? ` for ${activeOrg.name}` : ""}.
        </p>
      </div>

      {/* Current plan + usage */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
        <p className="text-sm text-cos-slate">Current Plan</p>
        <p className="mt-1 font-heading text-xl font-bold text-cos-midnight">
          {planLoading ? "..." : PLAN_DISPLAY_NAMES[currentPlan]}
        </p>

        {!planLoading && (
          <div className="mt-3 space-y-1 text-xs text-cos-slate">
            <p>
              Matches this week: {usage.matchesThisWeek} /{" "}
              {PLAN_LIMITS[currentPlan].potentialMatchesPerWeek}
            </p>
            <p>
              AI Perfect Matches: {usage.aiPerfectMatches} /{" "}
              {PLAN_LIMITS[currentPlan].aiPerfectMatchesPerMonth}
            </p>
            {PLAN_LIMITS[currentPlan].opportunityResponsesPerMonth > 0 && (
              <p>
                Opportunity responses: {usage.opportunityResponses} /{" "}
                {PLAN_LIMITS[currentPlan].opportunityResponsesPerMonth}
              </p>
            )}
          </div>
        )}

        {currentPlan !== "free" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleManageBilling}
            disabled={loading === "portal"}
          >
            {loading === "portal" ? "..." : "Manage Billing"}
          </Button>
        )}
      </div>

      {/* Plan comparison */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const price = PLAN_PRICES[plan];
          const isCurrent = plan === currentPlan;
          const isEnterprise = plan === "enterprise";
          return (
            <div
              key={plan}
              className={cn(
                "rounded-cos-2xl border p-5",
                isCurrent
                  ? "border-cos-electric bg-cos-electric/5"
                  : "border-cos-border bg-cos-surface"
              )}
            >
              <h3 className="font-heading text-base font-semibold text-cos-midnight">
                {PLAN_DISPLAY_NAMES[plan]}
              </h3>
              <p className="mt-0.5 text-xs text-cos-electric">
                {PLAN_TAGLINES[plan]}
              </p>
              <p className="mt-2 font-heading text-2xl font-bold text-cos-midnight">
                {isEnterprise ? "Custom" : `$${price.monthly}/mo`}
              </p>

              <ul className="mt-4 space-y-2 text-sm text-cos-slate-dim">
                <li>
                  {limits.members === Infinity
                    ? "Unlimited"
                    : limits.members}{" "}
                  {limits.members === 1 ? "seat" : "seats"}
                </li>
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
                  AI Perfect{" "}
                  {limits.aiPerfectMatchesPerMonth === 1
                    ? "Match"
                    : "Matches"}
                  /mo
                  {plan === "free" && (
                    <span className="ml-1 text-xs text-cos-warm">
                      (trial)
                    </span>
                  )}
                </li>
                <li>
                  {limits.unlimitedMessaging
                    ? "Unlimited messaging"
                    : "Limited messaging"}
                </li>
                {limits.opportunityResponsesPerMonth > 0 && (
                  <li>
                    {limits.opportunityResponsesPerMonth === Infinity
                      ? "Unlimited"
                      : limits.opportunityResponsesPerMonth}{" "}
                    opportunity responses/mo
                  </li>
                )}
                {limits.canSearchNetwork && (
                  <li className="text-cos-signal">Search the Network</li>
                )}
                {limits.enhancedProfile && (
                  <li className="text-cos-signal">Enhanced profile listing</li>
                )}
                {limits.canAccessCallIntelligence && (
                  <li className="text-cos-signal">Call intelligence</li>
                )}
                {limits.canAccessEmailAgent && (
                  <li className="text-cos-signal">Email agent</li>
                )}
                {limits.canExportData && (
                  <li className="text-cos-signal">Data export</li>
                )}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled
                    className="w-full"
                  >
                    Current Plan
                  </Button>
                ) : isEnterprise ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      window.open(
                        "https://joincollectiveos.com/contact",
                        "_blank"
                      )
                    }
                  >
                    Contact Us
                  </Button>
                ) : plan === "free" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="w-full"
                  >
                    Free
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleUpgrade(plan)}
                    disabled={loading === plan || !orgId}
                  >
                    {loading === plan
                      ? "..."
                      : `Upgrade to ${PLAN_DISPLAY_NAMES[plan]}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
