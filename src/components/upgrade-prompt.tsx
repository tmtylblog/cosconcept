"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BillingDrawer } from "@/components/billing-drawer";
import { PLAN_DISPLAY_NAMES, type PlanId } from "@/lib/billing/plan-limits";

export interface UpgradePromptProps {
  feature: string;
  description?: string;
  requiredPlan?: PlanId;
  className?: string;
}

export function UpgradePrompt({
  feature,
  description,
  requiredPlan = "pro",
  className,
}: UpgradePromptProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div
        className={`rounded-cos-xl border border-cos-warm/30 bg-cos-warm/5 p-4 text-center ${className ?? ""}`}
      >
        <p className="text-sm font-medium text-cos-midnight">
          {feature} is available on the{" "}
          <span className="font-semibold text-cos-electric">
            {PLAN_DISPLAY_NAMES[requiredPlan]}
          </span>{" "}
          plan.
        </p>
        {description && (
          <p className="mt-1 text-xs text-cos-slate">{description}</p>
        )}
        <Button
          size="sm"
          className="mt-3"
          onClick={() => setDrawerOpen(true)}
        >
          Upgrade Now
        </Button>
      </div>

      <BillingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        highlightPlan={requiredPlan}
      />
    </>
  );
}
