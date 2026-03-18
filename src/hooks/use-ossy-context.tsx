"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { PageMode, CosSignal } from "@/lib/cos-signal";

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
  currentPageMode: PageMode | null;
}

const OssyContext = createContext<OssyContextValue>({
  pageContext: null,
  setPageContext: () => {},
  currentPageMode: null,
});

export function OssyContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContextSnapshot | null>(null);
  const [currentPageMode, setCurrentPageMode] = useState<PageMode | null>(null);

  const setPageContext = useCallback((snapshot: PageContextSnapshot | null) => {
    setPageContextState(snapshot);
  }, []);

  // Listen for cos:signal nav events to track current page mode
  useEffect(() => {
    const handler = (e: Event) => {
      const signal = (e as CustomEvent<CosSignal>).detail;
      if (signal?.kind === "nav") {
        setCurrentPageMode(signal.page);
      }
    };

    window.addEventListener("cos:signal", handler);
    return () => window.removeEventListener("cos:signal", handler);
  }, []);

  return (
    <OssyContext.Provider value={{ pageContext, setPageContext, currentPageMode }}>
      {children}
    </OssyContext.Provider>
  );
}

export function useOssyContext() {
  return useContext(OssyContext);
}
