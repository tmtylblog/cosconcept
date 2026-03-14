"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResults {
  total: number;
  experts: number;
  potentialExperts: number;
  notExperts: number;
}

interface EnrichProgress {
  total: number;
  completed: number;
  running: number;
  failed: number;
}

type Phase =
  | "idle"
  | "checking"
  | "queued"
  | "searching"
  | "enriching"
  | "discovered"
  | "done"
  | "error"
  | "skipped";

interface UseTeamDiscoveryReturn {
  phase: Phase;
  searchResults: SearchResults | null;
  enrichProgress: EnrichProgress | null;
  domain: string | null;
  isActive: boolean;
  errorMessage: string | null;
  retry: () => void;
}

const MAX_POLLS = 120; // 6 min at 3s intervals
const POLL_INTERVAL = 3000;

export function useTeamDiscovery(
  organizationId: string | undefined,
  expertCount: number,
  expertsLoaded: boolean
): UseTeamDiscoveryReturn {
  const [phase, setPhase] = useState<Phase>("idle");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const pollCount = useRef(0);
  const triggered = useRef(false);
  const mounted = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
    pollCount.current = 0;
  }, []);

  const fetchStatus = useCallback(async (): Promise<{
    phase: string;
    domain?: string | null;
    searchResults?: SearchResults | null;
    enrichProgress?: EnrichProgress | null;
    jobError?: string | null;
  } | null> => {
    if (!organizationId) return null;
    try {
      const res = await fetch(`/api/firm/team-import/status?organizationId=${encodeURIComponent(organizationId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [organizationId]);

  const startPolling = useCallback(() => {
    if (pollInterval.current) return; // already polling
    pollCount.current = 0;

    pollInterval.current = setInterval(async () => {
      if (!mounted.current) { stopPolling(); return; }

      pollCount.current++;
      if (pollCount.current > MAX_POLLS) {
        stopPolling();
        setPhase("error");
        setErrorMessage("Discovery timed out. Please refresh the page.");
        return;
      }

      const data = await fetchStatus();
      if (!data || !mounted.current) return;

      if (data.domain) setDomain(data.domain);
      if (data.searchResults) setSearchResults(data.searchResults);
      if (data.enrichProgress) setEnrichProgress(data.enrichProgress);

      const p = data.phase;
      if (p === "queued") {
        setPhase("queued");
      } else if (p === "searching") {
        setPhase("searching");
      } else if (p === "enriching") {
        setPhase("enriching");
      } else if (p === "discovered" || p === "done") {
        setPhase("done");
        stopPolling();
      } else if (p === "error") {
        setPhase("error");
        setErrorMessage(data.jobError || "Team discovery failed.");
        stopPolling();
      }
    }, POLL_INTERVAL);
  }, [fetchStatus, stopPolling]);

  const triggerImport = useCallback(async () => {
    try {
      const res = await fetch("/api/firm/team-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.log("[TeamDiscovery] trigger failed:", res.status, err);
        // No website = can't discover, skip silently
        if (res.status === 400) {
          setPhase("skipped");
          return;
        }
        setPhase("error");
        setErrorMessage(err.error || "Failed to trigger team import");
        return;
      }

      const data = await res.json();
      console.log("[TeamDiscovery] trigger response:", data);
      if (data.alreadyRunning) {
        // Job exists — start polling to track it
        setPhase("queued");
      } else {
        setPhase("queued");
        if (data.domain) setDomain(data.domain);
      }
      startPolling();
    } catch {
      setPhase("error");
      setErrorMessage("Network error triggering team import");
    }
  }, [startPolling, organizationId]);

  const retry = useCallback(() => {
    setPhase("checking");
    setErrorMessage(null);
    triggered.current = false;
    // Manually re-trigger since effect deps won't change
    (async () => {
      const data = await fetchStatus();
      if (!mounted.current) return;
      triggered.current = true;
      if (!data) {
        await triggerImport();
        return;
      }
      if (data.domain) setDomain(data.domain);
      const p = data.phase;
      if (p === "idle" || p === "error") {
        await triggerImport();
      } else if (p === "queued" || p === "searching" || p === "enriching") {
        setPhase(p as Phase);
        startPolling();
      } else if (p === "discovered" || p === "done") {
        setPhase("done");
      }
    })();
  }, [fetchStatus, triggerImport, startPolling]);

  // Main effect: auto-trigger when experts page loads with 0 experts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    console.log("[TeamDiscovery] effect:", { organizationId, expertsLoaded, expertCount, triggered: triggered.current });
    if (!organizationId || !expertsLoaded) return;

    // If experts already exist, skip
    if (expertCount > 0) {
      setPhase("skipped");
      return;
    }

    // Already triggered in this mount
    if (triggered.current) return;
    triggered.current = true;
    setPhase("checking");

    // Check status first
    (async () => {
      const data = await fetchStatus();
      console.log("[TeamDiscovery] status response:", data);
      if (!mounted.current) return;

      if (!data) {
        // Network error — try triggering anyway
        await triggerImport();
        return;
      }

      if (data.domain) setDomain(data.domain);

      const p = data.phase;
      if (p === "queued" || p === "searching" || p === "enriching") {
        // Already in progress — attach to it
        setPhase(p as Phase);
        if (data.searchResults) setSearchResults(data.searchResults);
        if (data.enrichProgress) setEnrichProgress(data.enrichProgress);
        startPolling();
      } else if (p === "discovered" || p === "done") {
        // Already done — experts should load from refetch
        setPhase("done");
      } else if (p === "idle") {
        // No job exists — trigger one
        await triggerImport();
      } else if (p === "error") {
        // Previous job failed — try again
        await triggerImport();
      }
    })();
  }, [organizationId, expertsLoaded, expertCount]);

  const isActive = phase !== "idle" && phase !== "skipped" && phase !== "done";

  return {
    phase,
    searchResults,
    enrichProgress,
    domain,
    isActive,
    errorMessage,
    retry,
  };
}
