"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { DiscoverCandidate } from "@/hooks/use-discover-results";

// ─── Types ────────────────────────────────────────────────

/** Context from the search result card — preserved when clicking through to detail */
export interface MatchContext {
  matchScore: number;
  explanation: string;
  categories: string[];
  skills: string[];
  industries: string[];
  caseStudyCount?: number;
}

/** Searcher's own firm profile for self-reference in detail views */
export interface SearcherProfile {
  firmName: string;
  categories: string[];
  skills: string[];
  industries: string[];
  caseStudyCount: number;
}

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
  caseStudies: Array<{
    legacyId: string;
    title?: string | null;
    summary: string | null;
    sourceUrl?: string | null;
    clientName?: string | null;
    skills: string[];
    industries: string[];
  }>;
  experts: Array<{
    legacyId: string;
    displayName: string;
    title: string | null;
    hiddenSummary?: string | null;
    skills?: string[];
    specialistTitles?: string[];
    workHistory?: Array<{ company: string; title: string; isCurrent: boolean }>;
  }>;
  directClients?: Array<{ name: string; industry: string | null }>;
}

interface ExpertDetailData {
  legacyId: string;
  displayName: string;
  email: string | null;
  linkedinUrl: string | null;
  hiddenSummary: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  specialistProfiles: Array<{ title: string | null; description: string | null; skills: string[] }>;
  caseStudies: Array<{ legacyId: string; title?: string | null; summary: string | null; clientName?: string | null; firmName: string | null; skills: string[]; industries: string[] }>;
  workHistory?: Array<{ company: string; title: string; industry: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean }>;
}

interface CaseStudyDetailData {
  entityId: string;
  title: string | null;
  summary: string | null;
  sourceUrl: string | null;
  clientName: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  skills: string[];
  industries: string[];
  contributors: Array<{ legacyId: string; displayName: string; title: string | null }>;
}

export type StreamItem =
  | { type: "results"; results: DiscoverCandidate[]; query: string; id: string; timestamp: number }
  | { type: "firm_detail"; entityId: string; matchContext?: MatchContext; searcherProfile?: SearcherProfile; data: FirmDetailData | null; loading: boolean; error: string | null; searchQuery: string; id: string; timestamp: number }
  | { type: "expert_detail"; entityId: string; displayName: string; searcherProfile?: SearcherProfile; data: ExpertDetailData | null; loading: boolean; error: string | null; searchQuery: string; id: string; timestamp: number }
  | { type: "case_study_detail"; entityId: string; displayName: string; data: CaseStudyDetailData | null; loading: boolean; error: string | null; searchQuery: string; id: string; timestamp: number };

export type { FirmDetailData, ExpertDetailData, CaseStudyDetailData };

interface DiscoverStreamContextValue {
  items: StreamItem[];
  /** Increments on every item mutation (push, load complete, error). Use as scroll trigger. */
  updateCounter: number;
  pushResults: (results: DiscoverCandidate[], query: string) => void;
  pushFirmDetail: (candidate: DiscoverCandidate, searchQuery: string) => void;
  pushExpertDetail: (entityId: string, searchQuery: string, displayName?: string) => void;
  pushCaseStudyDetail: (entityId: string, searchQuery: string, displayName?: string) => void;
  /** Remove a stream item by ID (for closing detail blocks) */
  removeItem: (id: string) => void;
  lastResultsId: string | null;
  /** Set the current user's org ID for self-reference in detail views */
  setSearcherOrgId: (orgId: string) => void;
}

const DiscoverStreamContext = createContext<DiscoverStreamContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────

export function DiscoverStreamProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);
  const bumpUpdate = useCallback(() => setUpdateCounter((c) => c + 1), []);
  const lastResultsIdRef = useRef<string | null>(null);
  const idCounter = useRef(0);
  const searcherOrgIdRef = useRef<string | null>(null);
  const setSearcherOrgId = useCallback((orgId: string) => { searcherOrgIdRef.current = orgId; }, []);

  const nextId = useCallback((prefix: string) => {
    idCounter.current++;
    return `${prefix}_${idCounter.current}_${Date.now()}`;
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      // Clean up shownEntitiesRef so the entity can be re-opened
      if (item) {
        const key = item.type === "firm_detail" ? `firm:${item.entityId}` :
                    item.type === "expert_detail" ? `expert:${item.entityId}` :
                    item.type === "case_study_detail" ? `case_study:${item.entityId}` : null;
        if (key) shownEntitiesRef.current.delete(key);
      }
      return prev.filter((i) => i.id !== id);
    });
    bumpUpdate();
  }, [bumpUpdate]);

  const pushResults = useCallback((results: DiscoverCandidate[], query: string) => {
    const id = nextId("results");
    lastResultsIdRef.current = id;
    setItems((prev) => [...prev, { type: "results", results, query, id, timestamp: Date.now() }]);
    bumpUpdate();
  }, [nextId, bumpUpdate]);

  // Track shown entity IDs to prevent duplicates
  const shownEntitiesRef = useRef<Set<string>>(new Set());

  const pushFirmDetail = useCallback((candidate: DiscoverCandidate, searchQuery: string) => {
    const entityId = candidate.entityId;
    // Prevent duplicate detail blocks for the same entity
    const key = `firm:${entityId}`;
    if (shownEntitiesRef.current.has(key)) return;
    shownEntitiesRef.current.add(key);

    // Preserve search context for the detail view
    const matchContext: MatchContext = {
      matchScore: candidate.matchScore,
      explanation: candidate.explanation,
      categories: candidate.categories,
      skills: candidate.skills,
      industries: candidate.industries,
      caseStudyCount: candidate.caseStudyCount,
    };

    const id = nextId("firm");
    const item: StreamItem = {
      type: "firm_detail",
      entityId,
      matchContext,
      data: null,
      loading: true,
      error: null,
      searchQuery,
      id,
      timestamp: Date.now(),
    };
    setItems((prev) => [...prev, item]);

    // Fetch firm detail, then emit enriched event for Ossy
    const sfp = searcherOrgIdRef.current ? `&searcherOrgId=${encodeURIComponent(searcherOrgIdRef.current)}` : "";
    fetch(`/api/discover/entity?entityId=${encodeURIComponent(entityId)}&entityType=firm${sfp}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: d.error } as StreamItem : i));
        } else {
          let data = d.data as FirmDetailData;

          // Merge with matchContext when API data is sparse
          if (data.categories.length === 0 && matchContext.categories.length > 0) {
            data = { ...data, categories: matchContext.categories };
          }
          if (data.skills.length === 0 && matchContext.skills.length > 0) {
            data = { ...data, skills: matchContext.skills };
          }
          if (data.industries.length === 0 && matchContext.industries.length > 0) {
            data = { ...data, industries: matchContext.industries };
          }

          const searcherProfile = d.searcherProfile as SearcherProfile | undefined;
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, data, ...(searcherProfile ? { searcherProfile } : {}) } as StreamItem : i));

          // Emit enriched event with actual data for Ossy commentary
          if (typeof window !== "undefined" && data) {
            const parts: string[] = [];
            if (data.description) parts.push(data.description.slice(0, 200));
            if (data.categories.length) parts.push(`Categories: ${data.categories.join(", ")}`);
            if (data.skills.length) parts.push(`Skills: ${data.skills.slice(0, 8).join(", ")}`);
            if (data.industries.length) parts.push(`Industries: ${data.industries.slice(0, 5).join(", ")}`);
            if (data.caseStudies.length) parts.push(`${data.caseStudies.length} case studies`);
            if (data.experts.length) parts.push(`Key people: ${data.experts.slice(0, 4).map((e) => `${e.displayName}${e.title ? ` (${e.title})` : ""}`).join(", ")}`);
            if (data.markets.length) parts.push(`Markets: ${data.markets.join(", ")}`);

            window.dispatchEvent(new CustomEvent("cos:page-event", {
              detail: {
                type: "discover_firm_viewed",
                entityId,
                displayName: data.name ?? candidate.displayName ?? entityId,
                dataSummary: parts.join(". "),
              },
            }));
          }
        }
        bumpUpdate();
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: "Failed to load" } as StreamItem : i));
        bumpUpdate();
      });
  }, [nextId, bumpUpdate]);

  const pushExpertDetail = useCallback((entityId: string, searchQuery: string, displayName?: string) => {
    // Prevent duplicate detail blocks for the same entity
    const key = `expert:${entityId}`;
    if (shownEntitiesRef.current.has(key)) return;
    shownEntitiesRef.current.add(key);

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

    // Fetch expert detail, then emit enriched event for Ossy
    const sfpE = searcherOrgIdRef.current ? `&searcherOrgId=${encodeURIComponent(searcherOrgIdRef.current)}` : "";
    fetch(`/api/discover/entity?entityId=${encodeURIComponent(entityId)}&entityType=expert${sfpE}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: d.error } as StreamItem : i));
        } else {
          const data = d.data as ExpertDetailData;
          const searcherProfileE = d.searcherProfile as SearcherProfile | undefined;
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, data, displayName: data?.displayName ?? displayName ?? "Expert", ...(searcherProfileE ? { searcherProfile: searcherProfileE } : {}) } as StreamItem : i));

          // Emit enriched event with actual data for Ossy commentary
          if (typeof window !== "undefined" && data) {
            const parts: string[] = [];
            if (data.firmName) parts.push(`Works at ${data.firmName}`);
            if (data.skills.length) parts.push(`Skills: ${data.skills.slice(0, 8).join(", ")}`);
            if (data.industries.length) parts.push(`Industries: ${data.industries.slice(0, 5).join(", ")}`);
            if (data.specialistProfiles.length) {
              const titles = data.specialistProfiles.map((sp) => sp.title).filter(Boolean).slice(0, 3);
              if (titles.length) parts.push(`Specialist roles: ${titles.join(", ")}`);
            }
            if (data.caseStudies.length) parts.push(`${data.caseStudies.length} case studies`);
            if (data.markets.length) parts.push(`Markets: ${data.markets.join(", ")}`);

            window.dispatchEvent(new CustomEvent("cos:page-event", {
              detail: {
                type: "discover_expert_viewed",
                entityId,
                displayName: data.displayName ?? displayName ?? entityId,
                dataSummary: parts.join(". "),
              },
            }));
          }
        }
        bumpUpdate();
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: "Failed to load" } as StreamItem : i));
        bumpUpdate();
      });
  }, [nextId, bumpUpdate]);

  const pushCaseStudyDetail = useCallback((entityId: string, searchQuery: string, displayName?: string) => {
    // Prevent duplicate detail blocks for the same entity
    const key = `case_study:${entityId}`;
    if (shownEntitiesRef.current.has(key)) return;
    shownEntitiesRef.current.add(key);

    const id = nextId("case_study");
    const item: StreamItem = {
      type: "case_study_detail",
      entityId,
      displayName: displayName ?? "Case Study",
      data: null,
      loading: true,
      error: null,
      searchQuery,
      id,
      timestamp: Date.now(),
    };
    setItems((prev) => [...prev, item]);

    // Fetch case study detail
    fetch(`/api/discover/entity?entityId=${encodeURIComponent(entityId)}&entityType=case_study`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: d.error } as StreamItem : i));
        } else {
          const data = d.data as CaseStudyDetailData;
          setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, data, displayName: data?.title ?? displayName ?? "Case Study" } as StreamItem : i));

          // Emit enriched event for Ossy commentary
          if (typeof window !== "undefined" && data) {
            const parts: string[] = [];
            if (data.clientName) parts.push(`Client: ${data.clientName}`);
            if (data.firmName) parts.push(`By ${data.firmName}`);
            if (data.skills.length) parts.push(`Skills: ${data.skills.slice(0, 6).join(", ")}`);
            if (data.industries.length) parts.push(`Industries: ${data.industries.slice(0, 4).join(", ")}`);
            if (data.contributors.length) parts.push(`${data.contributors.length} contributors`);

            window.dispatchEvent(new CustomEvent("cos:page-event", {
              detail: {
                type: "discover_case_study_viewed",
                entityId,
                displayName: data.title ?? displayName ?? entityId,
                dataSummary: parts.join(". "),
              },
            }));
          }
        }
        bumpUpdate();
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, loading: false, error: "Failed to load" } as StreamItem : i));
        bumpUpdate();
      });
  }, [nextId, bumpUpdate]);

  return (
    <DiscoverStreamContext.Provider
      value={{
        items,
        updateCounter,
        pushResults,
        pushFirmDetail,
        pushExpertDetail,
        pushCaseStudyDetail,
        removeItem,
        lastResultsId: lastResultsIdRef.current,
        setSearcherOrgId,
      }}
    >
      {children}
    </DiscoverStreamContext.Provider>
  );
}

export function useDiscoverStream() {
  return useContext(DiscoverStreamContext);
}
