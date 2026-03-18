"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface DiscoverCandidate {
  entityType: "firm" | "expert" | "case_study";
  entityId: string;
  firmId: string;
  displayName: string;
  firmName: string;
  matchScore: number; // 0–100
  explanation: string;
  categories: string[];
  skills: string[];
  industries: string[];
  website?: string;
  caseStudyCount?: number;
  // Expert-specific
  specialistTitle?: string;
  specialistProfileCount?: number;
  subtitle?: string;
  // Case study-specific
  contributorCount?: number;
  summary?: string;
  sourceUrl?: string;
  clientName?: string;
}

export interface DiscoverFilters {
  skills?: string[];
  industries?: string[];
  markets?: string[];
  categories?: string[];
  sizeBand?: string;
  entityType?: "firm" | "expert" | "case_study";
}

interface DiscoverState {
  results: DiscoverCandidate[];
  searching: boolean;
  searchQuery: string;
  searchIntent: "partner" | "expertise" | "evidence";
  filters: DiscoverFilters;
  parsedFilters: DiscoverFilters;
  stats: { layer1Candidates: number; layer2Candidates: number; layer3Ranked: number; totalDurationMs: number; estimatedCostUsd: number } | null;
  error: string | null;
}

interface DiscoverContextValue extends DiscoverState {
  setResults: (results: DiscoverCandidate[], query?: string, intent?: "partner" | "expertise" | "evidence") => void;
  setSearchIntent: (intent: "partner" | "expertise" | "evidence") => void;
  setSearching: (v: boolean) => void;
  setFilters: (filters: DiscoverFilters) => void;
  setParsedFilters: (filters: DiscoverFilters) => void;
  setStats: (stats: DiscoverState["stats"]) => void;
  clearError: () => void;
  clear: () => void;
  executeSearch: (query: string, filterOverrides?: Partial<DiscoverFilters>) => Promise<void>;
}

const DiscoverContext = createContext<DiscoverContextValue | null>(null);

export function DiscoverResultsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DiscoverState>({
    results: [],
    searching: false,
    searchQuery: "",
    searchIntent: "partner",
    filters: {},
    parsedFilters: {},
    stats: null,
    error: null,
  });

  const setResults = useCallback((results: DiscoverCandidate[], query = "", intent?: "partner" | "expertise" | "evidence") => {
    setState((prev) => ({ ...prev, results, searching: false, searchQuery: query, ...(intent ? { searchIntent: intent } : {}) }));
  }, []);

  const setSearchIntent = useCallback((intent: "partner" | "expertise" | "evidence") => {
    setState((prev) => ({ ...prev, searchIntent: intent }));
  }, []);

  const setSearching = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, searching: v }));
  }, []);

  const setFilters = useCallback((filters: DiscoverFilters) => {
    setState((prev) => ({ ...prev, filters }));
  }, []);

  const setParsedFilters = useCallback((parsedFilters: DiscoverFilters) => {
    setState((prev) => ({ ...prev, parsedFilters }));
  }, []);

  const setStats = useCallback((stats: DiscoverState["stats"]) => {
    setState((prev) => ({ ...prev, stats }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const clear = useCallback(() => {
    setState({
      results: [],
      searching: false,
      searchQuery: "",
      searchIntent: "partner",
      filters: {},
      parsedFilters: {},
      stats: null,
      error: null,
    });
  }, []);

  const executeSearch = useCallback(async (query: string, filterOverrides?: Partial<DiscoverFilters>) => {
    if (!query.trim()) return;

    setState((prev) => ({ ...prev, searching: true, searchQuery: query, error: null }));

    try {
      const mergedFilters = { ...state.filters, ...filterOverrides };
      // Strip empty arrays from filters
      const cleanFilters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(mergedFilters)) {
        if (Array.isArray(v) && v.length === 0) continue;
        if (v === undefined || v === null) continue;
        cleanFilters[k] = v;
      }

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          filters: Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Search failed" }));
        console.error("[Discover] Search API error:", res.status, err);
        setState((prev) => ({
          ...prev,
          searching: false,
          searchQuery: query,
          error: err?.error ?? `Search failed (${res.status})`,
        }));
        return;
      }

      const data = await res.json();

      // Map API candidates to DiscoverCandidate format
      const results: DiscoverCandidate[] = (data.candidates ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => ({
          entityType: c.entityType ?? "firm",
          entityId: c.entityId,
          firmId: c.firmId ?? c.entityId,
          displayName: c.displayName ?? c.firmName ?? "Unknown",
          firmName: c.firmName ?? c.displayName ?? "Unknown",
          matchScore: Math.round((c.totalScore ?? 0) * 100),
          explanation: c.matchExplanation ?? "",
          categories: c.preview?.categories ?? [],
          skills: c.preview?.topSkills ?? [],
          industries: c.preview?.industries ?? [],
          website: c.preview?.website,
          caseStudyCount: c.preview?.caseStudyCount,
        })
      );

      // Save parsed filters from API response
      const parsed: DiscoverFilters = {};
      if (data.filters) {
        if (data.filters.skills?.length) parsed.skills = data.filters.skills;
        if (data.filters.industries?.length) parsed.industries = data.filters.industries;
        if (data.filters.markets?.length) parsed.markets = data.filters.markets;
        if (data.filters.categories?.length) parsed.categories = data.filters.categories;
        if (data.filters.sizeBand) parsed.sizeBand = data.filters.sizeBand;
        if (data.filters.entityType) parsed.entityType = data.filters.entityType;
      }

      setState({
        results,
        searching: false,
        searchQuery: query,
        filters: { ...state.filters, ...filterOverrides },
        parsedFilters: parsed,
        stats: data.stats ?? null,
        error: null,
      });
    } catch (err) {
      console.error("[Discover] Search failed:", err);
      setState((prev) => ({
        ...prev,
        searching: false,
        error: err instanceof Error ? err.message : "Search failed",
      }));
    }
  }, [state.filters]);

  return (
    <DiscoverContext.Provider
      value={{
        ...state,
        setResults,
        setSearchIntent,
        setSearching,
        setFilters,
        setParsedFilters,
        setStats,
        clearError,
        clear,
        executeSearch,
      }}
    >
      {children}
    </DiscoverContext.Provider>
  );
}

export function useDiscoverResults() {
  return useContext(DiscoverContext);
}
