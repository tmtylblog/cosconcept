"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

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
}

interface DiscoverState {
  results: DiscoverCandidate[];
  searching: boolean;
  searchQuery: string;
}

interface DiscoverContextValue extends DiscoverState {
  setResults: (results: DiscoverCandidate[], query?: string) => void;
  setSearching: (v: boolean) => void;
  clear: () => void;
}

const DiscoverContext = createContext<DiscoverContextValue | null>(null);

export function DiscoverResultsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DiscoverState>({
    results: [],
    searching: false,
    searchQuery: "",
  });

  const setResults = (results: DiscoverCandidate[], query = "") => {
    setState({ results, searching: false, searchQuery: query });
  };

  const setSearching = (v: boolean) => {
    setState((prev) => ({ ...prev, searching: v }));
  };

  const clear = () => {
    setState({ results: [], searching: false, searchQuery: "" });
  };

  return (
    <DiscoverContext.Provider value={{ ...state, setResults, setSearching, clear }}>
      {children}
    </DiscoverContext.Provider>
  );
}

export function useDiscoverResults() {
  return useContext(DiscoverContext);
}
