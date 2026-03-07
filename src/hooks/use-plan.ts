"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveOrganization } from "@/lib/auth-client";
import { PLAN_LIMITS, type PlanId, type PlanLimits } from "@/lib/billing/plan-limits";

interface UsageData {
  matchesThisWeek: number;
  aiPerfectMatches: number;
  opportunityResponses: number;
}

interface RemainingData {
  matchesThisWeek: number;
  aiPerfectMatches: number;
  opportunityResponses: number;
}

interface PlanState {
  plan: PlanId;
  limits: PlanLimits;
  usage: UsageData;
  remaining: RemainingData;
  isLoading: boolean;
  error: string | null;
  /** Check if a boolean feature is available on the current plan */
  canUse: (feature: keyof PlanLimits) => boolean;
  /** Refresh usage data */
  refresh: () => void;
}

const DEFAULT_USAGE: UsageData = {
  matchesThisWeek: 0,
  aiPerfectMatches: 0,
  opportunityResponses: 0,
};

const DEFAULT_REMAINING: RemainingData = {
  matchesThisWeek: 0,
  aiPerfectMatches: 0,
  opportunityResponses: 0,
};

export function usePlan(): PlanState {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;

  const [plan, setPlan] = useState<PlanId>("free");
  const [usage, setUsage] = useState<UsageData>(DEFAULT_USAGE);
  const [remaining, setRemaining] = useState<RemainingData>(DEFAULT_REMAINING);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/billing/usage?organizationId=${encodeURIComponent(orgId)}`
      );
      if (!res.ok) throw new Error("Failed to fetch plan usage");

      const data = await res.json();
      setPlan(data.plan);
      setUsage(data.usage);
      setRemaining(data.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const limits = PLAN_LIMITS[plan];

  const canUse = useCallback(
    (feature: keyof PlanLimits) => {
      const value = limits[feature];
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value > 0;
      return false;
    },
    [limits]
  );

  return {
    plan,
    limits,
    usage,
    remaining,
    isLoading,
    error,
    canUse,
    refresh: fetchUsage,
  };
}
