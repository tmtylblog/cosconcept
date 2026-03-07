"use client";

import { Button } from "@/components/ui/button";
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
  return (
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
        onClick={() => {
          // Navigate to billing settings
          // TODO: wire to slide panel open
          window.location.href = "/settings/billing";
        }}
      >
        Upgrade Now
      </Button>
    </div>
  );
}
