"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface OnboardingStatus {
  enrichmentComplete: boolean;
  preferencesComplete: boolean;
  answeredCount: number;
  totalRequired: number;
  onboardingComplete: boolean;
  missingFields: string[];
  isLoading: boolean;
  recheck: () => void;
}

const POLL_INTERVAL = 2000; // 2 seconds

/**
 * Hook that checks onboarding completeness status via the server API.
 * Polls every 2s while onboarding is NOT complete (catches async writes
 * from migration, Ossy tool calls, etc.). Stops polling once complete.
 */
export function useOnboardingStatus(
  organizationId: string | undefined
): OnboardingStatus {
  const [status, setStatus] = useState<{
    enrichmentComplete: boolean;
    preferencesComplete: boolean;
    answeredCount: number;
    totalRequired: number;
    onboardingComplete: boolean;
    missingFields: string[];
  }>({
    enrichmentComplete: false,
    preferencesComplete: false,
    answeredCount: 0,
    totalRequired: 9,
    onboardingComplete: false,
    missingFields: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const completedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!organizationId) return;

    try {
      const res = await fetch(
        `/api/onboarding/status?organizationId=${encodeURIComponent(organizationId)}`
      );
      if (!res.ok) return;

      const data = await res.json();
      setStatus({
        enrichmentComplete: data.enrichmentComplete ?? false,
        preferencesComplete: data.preferencesComplete ?? false,
        answeredCount: data.answeredCount ?? 0,
        totalRequired: data.totalRequired ?? 9,
        onboardingComplete: data.onboardingComplete ?? false,
        missingFields: data.missingFields ?? [],
      });

      if (data.onboardingComplete) {
        completedRef.current = true;
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      console.error("[useOnboardingStatus] Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Initial fetch + polling setup
  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    // Reset on org change
    completedRef.current = false;
    setIsLoading(true);

    // Initial fetch
    fetchStatus();

    // Start polling (will self-stop when complete)
    pollingRef.current = setInterval(() => {
      if (!completedRef.current) {
        fetchStatus();
      }
    }, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [organizationId, fetchStatus]);

  const recheck = useCallback(() => {
    completedRef.current = false;
    fetchStatus();
    // Restart polling if it was stopped
    if (!pollingRef.current && organizationId) {
      pollingRef.current = setInterval(() => {
        if (!completedRef.current) {
          fetchStatus();
        }
      }, POLL_INTERVAL);
    }
  }, [fetchStatus, organizationId]);

  return {
    ...status,
    isLoading,
    recheck,
  };
}
