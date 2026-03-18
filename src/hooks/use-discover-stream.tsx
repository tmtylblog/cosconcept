"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { DiscoverCandidate } from "@/hooks/use-discover-results";

// ─── Types ────────────────────────────────────────────────

interface FirmDetailData {
  name: string;
  website: string | null;
  linkedinUrl: string | null;
  sizeBand: string | null;
  description: string | null;
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  caseStudies: Array<{ legacyId: string; summary: string | null; skills: string[]; industries: string[] }>;
  experts: Array<{ legacyId: string; displayName: string; title: string | null }>;
}

interface ExpertDetailData {
  legacyId: string;
  displayName: string;
  email: string | null;
  linkedinUrl: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  specialistProfiles: Array<{ title: string | null; description: string | null; skills: string[] }>;
  caseStudies: Array<{ legacyId: string; summary: string | null; firmName: string | null; skills: string[]; industries: string[] }>;
}

export type StreamItem =
  | { type: "results"; results: DiscoverCandidate[]; query: string; id: string; timestamp: number }
  | { type: "firm_detail"; entityId: string; data: FirmDetailData | null; loading: boolean; error: string | null; searchQuery: string; id: string; timestamp: number }
  | { type: "expert_detail"; entityId: string; displayName: string; data: ExpertDetailData | null; loading: boolean; error: string | null; searchQuery: string; id: string; timestamp: number };

export type { FirmDetailData, ExpertDetailData };

interface DiscoverStreamContextValue {
  items: StreamItem[];
  /** Increments on every item mutation (push, load complete, error). Use as scroll trigger. */
  updateCounter: number;
  pushResults: (results: DiscoverCandidate[], query: string) => void;
  pushFirmDetail: (entityId: string, searchQuery: string, displayName?: string) => void;
  pushExpertDetail: (entityId: string, searchQuery: string, displayName?: string) => void;
  lastResultsId: string | null;
}

const DiscoverStreamContext = createContext<DiscoverStreamContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

export function DiscoverStreamProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);
  const bumpUpdate = useCallback(() => setUpdateCounter((c) => c + 1), []);
  const lastResultsIdRef = useRef<string | null>(null);
  const idCounter = useRef(0);

  const nextId = useCallback((prefix: string) => {
    idCounter.current++;
    return `${prefix}_${idCounter.current}_${Date.now()}`;
  }, []);

  const pushResults = useCallback((results: DiscoverCandidate[], query: string) => {
    const id = nextId("results");
    lastResultsIdRef.current = id;
    setItems((prev) => [...prev, { type: "results", results, query, id, timestamp: Date.now() }]);
    bumpUpdate();
  }, [nextId, bumpUpdate]);

  const pushFirmDetail = useCallback((entityId: string, searchQuery: string, displayName?: string) => {
    const id = nextId("firm");
    const item: StreamItem = {
      type: "firm_detail",
      entityId,
      data: null,
      loading: true,
      error: null,
      searchQuery,
      id,
      timestamp: Date.now(),
    };
    setItems((prev) => [...prev, item]);

    // Fetch firm detail
    fetch(`/api/discover/entity?entityId=${encodeURIComponent(entityId)}&entityType=firm`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: d.error } as StreamItem : i));
        } else {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, data: d.data } as StreamItem : i));
        }
        bumpUpdate();
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: "Failed to load" } as StreamItem : i));
        bumpUpdate();
      });

    // Emit event for Ossy contextual commentary
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cos:page-event", {
        detail: { type: "discover_firm_viewed", entityId, displayName: displayName ?? entityId },
      }));
    }
  }, [nextId, bumpUpdate]);

  const pushExpertDetail = useCallback((entityId: string, searchQuery: string, displayName?: string) => {
    const id = nextId("expert");
    const item: StreamItem = {
      type: "expert_detail",
      entityId,
      displayName: displayName ?? "Expert",
      data: null,
      loading: true,
      error: null,
      searchQuery,
      id,
      timestamp: Date.now(),
    };
    setItems((prev) => [...prev, item]);

    // Fetch expert detail
    fetch(`/api/discover/entity?entityId=${encodeURIComponent(entityId)}&entityType=expert`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: d.error } as StreamItem : i));
        } else {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, data: d.data, displayName: d.data?.displayName ?? displayName ?? "Expert" } as StreamItem : i));
        }
        bumpUpdate();
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: "Failed to load" } as StreamItem : i));
        bumpUpdate();
      });

    // Emit event for Ossy contextual commentary
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cos:page-event", {
        detail: { type: "discover_expert_viewed", entityId, displayName: displayName ?? entityId },
      }));
    }
  }, [nextId, bumpUpdate]);

  return (
    <DiscoverStreamContext.Provider
      value={{
        items,
        updateCounter,
        pushResults,
        pushFirmDetail,
        pushExpertDetail,
        lastResultsId: lastResultsIdRef.current,
      }}
    >
      {children}
    </DiscoverStreamContext.Provider>
  );
}

export function useDiscoverStream() {
  return useContext(DiscoverStreamContext);
}
