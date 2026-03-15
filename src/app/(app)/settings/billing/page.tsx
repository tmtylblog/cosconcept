"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import CheckoutModal from "@/components/checkout-modal";

const plans: PlanId[] = ["free", "pro", "enterprise"];

export default function BillingPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { plan: currentPlan, usage, isLoading: planLoading, refresh: refreshPlan } = usePlan();
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const searchParams = useSearchParams();

  // Embedded checkout modal state
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<"pro" | "enterprise">("pro");
  const [checkoutInterval, setCheckoutInterval] = useState<"monthly" | "yearly">("monthly");

  // Local orgId state — useActiveOrganization() often doesn't re-render after
  // setActive(), so we track the resolved orgId ourselves to guarantee the
  // Upgrade button becomes enabled.
  const [resolvedOrgId, setResolvedOrgId] = useState<string>("");
  const orgId = activeOrg?.id || resolvedOrgId;
  const [syncing, setSyncing] = useState(false);
  const orgActivationAttempted = useRef(false);

  // Self-healing: if no active org, try to activate one
  useEffect(() => {
    if (orgId || orgActivationAttempted.current) return;
    orgActivationAttempted.current = true;

    (async () => {
      try {
        const { data: orgs } = await authClient.organization.list();
        const orgList = (orgs as { id: string }[]) ?? [];
        if (orgList.length > 0) {
          console.log("[Billing] No active org — auto-activating", orgList[0].id);
          await authClient.organization.setActive({ organizationId: orgList[0].id });
          // Force local state update — the hook may not re-render
          setResolvedOrgId(orgList[0].id);
        }
      } catch (err) {
        console.error("[Billing] Failed to auto-activate org:", err);
      }
    })();
  }, [orgId]);

  // Sync subscription state from Stripe after checkout or portal return
  async function syncFromStripe() {
    if (!orgId) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/stripe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (res.ok) {
        // Refresh plan data from our DB (now updated by sync)
        await new Promise((r) => setTimeout(r, 300));
        refreshPlan();
      }
    } catch {
      // Sync failure is non-fatal — webhook will eventually catch up
    } finally {
      setSyncing(false);
    }
  }

  // Handle Stripe redirect params
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setNotice({ type: "success", message: "Syncing your subscription..." });
      syncFromStripe().then(() => {
        setNotice({ type: "success", message: "Your plan has been upgraded. Welcome aboard!" });
        window.history.replaceState({}, "", "/settings/billing");
      });
    } else if (searchParams.get("canceled") === "true") {
      setNotice({ type: "info", message: "Checkout canceled — no changes were made." });
      window.history.replaceState({}, "", "/settings/billing");
    } else if (searchParams.get("portal") === "true") {
      setNotice({ type: "info", message: "Syncing subscription changes..." });
      syncFromStripe().then(() => {
        setNotice(null);
        window.history.replaceState({}, "", "/settings/billing");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orgId]);

  async function handleUpgrade(plan: "pro" | "enterprise") {
    // Resolve orgId — use local state, hook, or fetch as last resort
    let effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      try {
        const { data: orgs } = await authClient.organization.list();
        const orgList = (orgs as { id: string }[]) ?? [];
        if (orgList.length > 0) {
          effectiveOrgId = orgList[0].id;
          setResolvedOrgId(effectiveOrgId);
          await authClient.organization.setActive({ organizationId: effectiveOrgId });
        }
      } catch {
        // fall through
      }
    }
    if (!effectiveOrgId) {
      setNotice({ type: "error", message: "No organization found. Please refresh and try again." });
      return;
    }

    // Open embedded checkout modal instead of redirecting to Stripe
    setNotice(null);
    setCheckoutPlan(plan);
    setCheckoutInterval("monthly");
    setShowCheckout(true);
  }

  function handleCheckoutSuccess() {
    setShowCheckout(false);
    setNotice({ type: "success", message: "Syncing your subscription..." });
    syncFromStripe().then(() => {
      setNotice({ type: "success", message: "Your plan has been upgraded. Welcome aboard!" });
    });
  }

  function handleCheckoutCancel() {
    setShowCheckout(false);
  }

  async function handleManageBilling() {
    if (!orgId) return;
    setLoading("portal");
    setNotice(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();

      if (res.status === 503 || data.code === "stripe_not_configured") {
        setNotice({
          type: "info",
          message: "Billing portal is not yet active — check back soon.",
        });
        return;
      }

      if (!res.ok) {
        setNotice({ type: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      if (data.url) window.location.href = data.url;
    } catch {
      setNotice({ type: "error", message: "Network error — please try again." });
    } finally {
      setLoading(null);
    }
  }

  const noticeIcon = {
    success: <CheckCircle className="h-4 w-4 shrink-0 text-cos-signal" />,
    error: <XCircle className="h-4 w-4 shrink-0 text-red-500" />,
    info: <AlertCircle className="h-4 w-4 shrink-0 text-cos-electric" />,
  };

  return (
    <div className="w-full space-y-8 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Billing & Plans
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Manage your subscription and billing details
          {activeOrg?.name ? ` for ${activeOrg.name}` : ""}.
        </p>
      </div>

      {/* Notice banner */}
      {notice && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-cos-xl border p-4 text-sm",
            notice.type === "success" && "border-cos-signal/30 bg-cos-signal/5 text-cos-signal-dark",
            notice.type === "error" && "border-red-200 bg-red-50 text-red-700",
            notice.type === "info" && "border-cos-electric/30 bg-cos-electric/5 text-cos-midnight"
          )}
        >
          {noticeIcon[notice.type]}
          <p>{notice.message}</p>
        </div>
      )}

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
              {PLAN_LIMITS[currentPlan].potentialMatchesPerWeek === Infinity
                ? "∞"
                : PLAN_LIMITS[currentPlan].potentialMatchesPerWeek}
            </p>
            <p>
              AI Perfect Matches: {usage.aiPerfectMatches} /{" "}
              {PLAN_LIMITS[currentPlan].aiPerfectMatchesPerMonth === Infinity
                ? "∞"
                : PLAN_LIMITS[currentPlan].aiPerfectMatchesPerMonth}
            </p>
            {PLAN_LIMITS[currentPlan].opportunityResponsesPerMonth > 0 && (
              <p>
                Opportunity responses: {usage.opportunityResponses} /{" "}
                {PLAN_LIMITS[currentPlan].opportunityResponsesPerMonth === Infinity
                  ? "∞"
                  : PLAN_LIMITS[currentPlan].opportunityResponsesPerMonth}
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

      {/* Inline Stripe Checkout (replaces plan cards when active) */}
      {showCheckout && orgId ? (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-heading text-lg font-semibold text-cos-midnight">
                Upgrade to {PLAN_DISPLAY_NAMES[checkoutPlan]}
              </h3>
              <p className="text-sm text-cos-slate">
                ${PLAN_PRICES[checkoutPlan].monthly}/mo &mdash; enter your payment details below
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCheckoutCancel}>
              Back
            </Button>
          </div>
          <CheckoutModal
            plan={checkoutPlan}
            interval={checkoutInterval}
            organizationId={orgId}
            onSuccess={handleCheckoutSuccess}
            onCancel={handleCheckoutCancel}
          />
        </div>
      ) : (
      /* Plan comparison */
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
                  {limits.members === Infinity ? "Unlimited" : limits.members}{" "}
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
                  {limits.aiPerfectMatchesPerMonth === 1 ? "Match" : "Matches"}
                  /mo
                  {plan === "free" && (
                    <span className="ml-1 text-xs text-cos-warm">(trial)</span>
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
                      window.open("https://joincollectiveos.com/contact", "_blank")
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
                    disabled={loading === plan}
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
      )}
    </div>
  );
}
