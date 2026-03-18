"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// ─── Page Context Snapshots ──────────────────────────────
// Each page registers a typed snapshot of its current state.
// Kept under ~200 tokens per snapshot (counts and indicators, not raw data).

export type PageContextSnapshot =
  | { page: "overview"; completeness: number; filledFields: number; totalFields: number; enrichmentStatus: string }
  | { page: "offering"; serviceCount: number; hiddenCount: number; withDescription: number; withoutDescription: number; deepCrawlRunning: boolean }
  | { page: "experts"; expertCount: number; enrichedCount: number; pendingCount: number; creditsRemaining: number }
  | { page: "experience"; caseStudyCount: number; pendingCount: number; activeCount: number; failedCount: number }
  | { page: "preferences"; filledFields: string[]; emptyFields: string[]; completeness: number }
  | { page: "discover" }
  | { page: "dashboard"; enrichmentStage: string }
  | { page: "calls"; callCount: number; pendingAnalysis: number }
  | { page: "settings"; subpage: string }
  | { page: "partner-matching"; prefsComplete: boolean; missingFields: string[]; matchCount: number };

interface OssyContextValue {
  pageContext: PageContextSnapshot | null;
  setPageContext: (snapshot: PageContextSnapshot | null) => void;
}

const OssyContext = createContext<OssyContextValue>({
  pageContext: null,
  setPageContext: () => {},
});

export function OssyContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContextSnapshot | null>(null);

  const setPageContext = useCallback((snapshot: PageContextSnapshot | null) => {
    setPageContextState(snapshot);
  }, []);

  return (
    <OssyContext.Provider value={{ pageContext, setPageContext }}>
      {children}
    </OssyContext.Provider>
  );
}

export function useOssyContext() {
  return useContext(OssyContext);
}
