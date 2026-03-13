/**
 * Hook: useEnrichmentCredits
 *
 * Fetches the current org's enrichment credit balance.
 * Used on the experts page to show credit bar and gate enrich buttons.
 */

import { useState, useEffect, useCallback } from "react";

interface EnrichmentCredits {
  totalCredits: number;
  usedCredits: number;
  availableCredits: number;
  freeAutoUsed: number;
  proCreditsGranted: boolean;
}

export function useEnrichmentCredits() {
  const [credits, setCredits] = useState<EnrichmentCredits | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/billing/enrichment-credits");
      if (!res.ok) {
        throw new Error(`Failed to fetch credits: ${res.status}`);
      }
      const data = await res.json();
      setCredits({
        totalCredits: data.totalCredits,
        usedCredits: data.usedCredits,
        availableCredits: data.availableCredits,
        freeAutoUsed: data.freeAutoUsed,
        proCreditsGranted: data.proCreditsGranted,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credits");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return {
    credits,
    isLoading,
    error,
    refetch: fetchCredits,
  };
}
