"use client";

import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import React from "react";

// ─── Types ───────────────────────────────────────────────

export interface EnrichmentCompanyData {
  name: string;
  industry: string;
  size: string;
  employeeCount: number;
  founded: number | null;
  location: string;
  tags: string[];
  inferredRevenue: string | null;
  linkedinUrl: string | null;
  website: string | null;
}

export interface EnrichmentExtracted {
  clients: string[];
  caseStudyUrls: string[];
  services: string[];
  aboutPitch: string;
  teamMembers: string[];
}

export interface EnrichmentClassification {
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  confidence: number;
}

export interface EnrichmentResult {
  url: string;
  domain: string;
  success: boolean;
  companyCard: string | null;
  companyData: EnrichmentCompanyData | null;
  groundTruth: string | null;
  pagesScraped: number;
  evidenceCategories: string[];
  extracted: EnrichmentExtracted | null;
  classification: EnrichmentClassification | null;
}

export type EnrichmentStatus = "idle" | "loading" | "done" | "failed" | "error";

export type StageStatus = "idle" | "loading" | "done" | "failed";

export interface EnrichmentStages {
  overall: "idle" | "enriching" | "done" | "failed";
  pdl: StageStatus;
  scrape: StageStatus;
  classify: StageStatus;
}

// ─── Helpers ──────────────────────────────────────────────

/** Build context string for Ossy prompt from enrichment data */
function buildContextForOssy(data: Partial<EnrichmentResult>): string {
  const parts: string[] = [
    `[ENRICHMENT RESULTS for ${data.domain || data.url || "unknown"}]`,
  ];
  if (data.companyCard) {
    parts.push(`\n## Company Profile (PDL)\n${data.companyCard}`);
  }
  if (data.groundTruth) {
    parts.push(
      `\n## Ground Truth Evidence (Website Scrape)\n${data.groundTruth}`
    );
  }
  if (data.classification) {
    parts.push(
      `\n## AI Classification\nCategories: ${data.classification.categories.join(", ") || "unknown"}` +
        `\nSkills: ${data.classification.skills.join(", ") || "unknown"}` +
        `\nIndustries: ${data.classification.industries.join(", ") || "unknown"}` +
        `\nMarkets: ${data.classification.markets.join(", ") || "unknown"}` +
        `\nLanguages: ${data.classification.languages.join(", ") || "unknown"}`
    );
  }
  if (data.extracted?.teamMembers?.length) {
    parts.push(
      `\nTeam members detected: ${data.extracted.teamMembers.join(", ")}`
    );
  }
  return parts.join("\n");
}

const INITIAL_STAGES: EnrichmentStages = {
  overall: "idle",
  pdl: "idle",
  scrape: "idle",
  classify: "idle",
};

interface EnrichmentContextValue {
  status: EnrichmentStatus;
  stages: EnrichmentStages;
  result: EnrichmentResult | null;
  /** Full context string for Ossy prompt */
  contextForOssy: string | null;
  /** Trigger enrichment for a URL */
  triggerEnrichment: (url: string) => Promise<void>;
  /** Reset all enrichment state (for testing / new agency simulation) */
  reset: () => void;
}

// ─── Context ─────────────────────────────────────────────

const EnrichmentContext = createContext<EnrichmentContextValue>({
  status: "idle",
  stages: INITIAL_STAGES,
  result: null,
  contextForOssy: null,
  triggerEnrichment: async () => {},
  reset: () => {},
});

export function useEnrichment() {
  return useContext(EnrichmentContext);
}

// ─── Provider ────────────────────────────────────────────

export function EnrichmentProvider({
  children,
  organizationId,
}: {
  children: ReactNode;
  organizationId?: string;
}) {
  const [status, setStatus] = useState<EnrichmentStatus>("idle");
  const [stages, setStages] = useState<EnrichmentStages>(INITIAL_STAGES);
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [contextForOssy, setContextForOssy] = useState<string | null>(null);
  const [enrichedUrl, setEnrichedUrl] = useState<string | null>(null);

  // Ref to track current enrichment run — allows aborting stale runs
  const runIdRef = useRef(0);
  // Track whether we've persisted the current result to DB
  const persistedRef = useRef(false);

  // ─── SessionStorage: save enrichment result so it survives page reloads ───
  const STORAGE_KEY = "cos_enrichment_result";

  // Save result to sessionStorage whenever it changes
  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {
      // quota exceeded or SSR — ignore
    }
  }, [result]);

  // Hydrate from DB on mount, or fall back to sessionStorage
  useEffect(() => {
    if (result) return; // Already have data in memory
    let cancelled = false;

    async function hydrate() {
      // Try sessionStorage first (instant, survives guest→auth reload)
      try {
        const cached = sessionStorage.getItem(STORAGE_KEY);
        if (cached && !cancelled) {
          const enrichmentData = JSON.parse(cached) as EnrichmentResult;
          if (enrichmentData.domain) {
            setResult(enrichmentData);
            setEnrichedUrl(enrichmentData.url);
            setContextForOssy(buildContextForOssy(enrichmentData));
            setStatus(enrichmentData.success ? "done" : "loading");
            if (enrichmentData.success) {
              setStages({ overall: "done", pdl: "done", scrape: "done", classify: "done" });
            }
            // Don't return — still try DB hydration to get latest data
          }
        }
      } catch {
        // sessionStorage unavailable
      }

      // Then try DB if we have an orgId
      if (!organizationId) return;
      try {
        const res = await fetch(`/api/enrich/firm?organizationId=${organizationId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data.enrichmentData) return;

        const enrichmentData = data.enrichmentData as EnrichmentResult;
        setResult(enrichmentData);
        setEnrichedUrl(enrichmentData.url);
        setContextForOssy(buildContextForOssy(enrichmentData));
        setStatus("done");
        setStages({ overall: "done", pdl: "done", scrape: "done", classify: "done" });
        persistedRef.current = true; // DB data is already persisted
      } catch {
        // Silently ignore hydration failures
      }
    }

    hydrate();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // ─── Deferred persist: when organizationId arrives after enrichment completed ───
  useEffect(() => {
    if (!organizationId || !result || !result.success || persistedRef.current) return;

    // organizationId just became available and we have un-persisted enrichment data
    persistedRef.current = true;
    console.log("[Enrichment] Deferred persist — orgId arrived after enrichment");
    fetch("/api/enrich/persist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: result.url,
        domain: result.domain,
        organizationId,
        companyData: result.companyData,
        companyCard: result.companyCard,
        groundTruth: result.groundTruth,
        extracted: result.extracted,
        classification: result.classification,
        pagesScraped: result.pagesScraped,
        evidenceCategories: result.evidenceCategories,
      }),
    }).catch((err) => {
      console.warn("[Enrichment] Deferred persist failed:", err);
      persistedRef.current = false; // Allow retry
    });
  }, [organizationId, result]);

  const reset = useCallback(() => {
    runIdRef.current++;
    persistedRef.current = false;
    setStatus("idle");
    setStages(INITIAL_STAGES);
    setResult(null);
    setContextForOssy(null);
    setEnrichedUrl(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const triggerEnrichment = useCallback(
    async (url: string) => {
      if (enrichedUrl === url) return; // Same URL — skip

      // New enrichment run
      const thisRun = ++runIdRef.current;
      persistedRef.current = false;
      setEnrichedUrl(url);
      setStatus("loading");
      // NOTE: Do NOT setResult(null) here — that causes the firm card to vanish
      // during re-enrichment. The resultShell below will overwrite immediately.
      setStages({
        overall: "enriching",
        pdl: "loading",
        scrape: "loading",
        classify: "idle", // starts after scrape
      });

      const normalized = url.startsWith("http") ? url : `https://${url}`;
      let domain: string;
      try {
        domain = new URL(normalized).hostname.replace(/^www\./, "");
      } catch {
        setStatus("error");
        setStages({ overall: "failed", pdl: "failed", scrape: "failed", classify: "failed" });
        return;
      }

      // Initialize result shell so the dashboard can show the domain immediately
      const resultShell: EnrichmentResult = {
        url: normalized,
        domain,
        success: false,
        companyCard: null,
        companyData: null,
        groundTruth: null,
        pagesScraped: 0,
        evidenceCategories: [],
        extracted: null,
        classification: null,
      };
      setResult(resultShell);

      // Track data across stages — using `any` wrapper to avoid TS narrowing issues in async closures
      const stageData = {
        pdlCompanyData: null as EnrichmentCompanyData | null,
        pdlCompanyCard: null as string | null,
        scrapeExtracted: null as EnrichmentExtracted | null,
        scrapeGroundTruth: null as string | null,
        scrapeRawContent: null as string | null,
        scrapePagesScraped: 0,
        scrapeEvidenceCategories: [] as string[],
        classificationData: null as EnrichmentClassification | null,
      };

      // ─── Stage 1 & 2: PDL + Scrape in parallel ──────────
      const pdlPromise = fetch("/api/enrich/pdl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      })
        .then(async (res) => {
          if (thisRun !== runIdRef.current) return; // stale
          if (!res.ok) throw new Error("PDL failed");
          const data = await res.json();

          stageData.pdlCompanyData = data.companyData;
          stageData.pdlCompanyCard = data.companyCard;

          // Merge PDL data into result
          setResult((prev) => {
            const updated = {
              ...prev!,
              companyData: data.companyData,
              companyCard: data.companyCard,
              success: prev!.success || !!data.companyData,
            };
            setContextForOssy(buildContextForOssy(updated));
            return updated;
          });
          setStages((prev) => ({ ...prev, pdl: "done" }));
          console.log(`[Enrichment] PDL done: ${data.companyData?.name || "no match"}`);
        })
        .catch((err) => {
          if (thisRun !== runIdRef.current) return;
          console.warn("[Enrichment] PDL stage failed:", err);
          setStages((prev) => ({ ...prev, pdl: "failed" }));
        });

      const scrapePromise = fetch("/api/enrich/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized, domain }),
      })
        .then(async (res) => {
          if (thisRun !== runIdRef.current) return;
          if (!res.ok) throw new Error("Scrape failed");
          const data = await res.json();

          stageData.scrapeExtracted = data.extracted;
          stageData.scrapeGroundTruth = data.groundTruth;
          stageData.scrapeRawContent = data.rawContent;
          stageData.scrapePagesScraped = data.pagesScraped;
          stageData.scrapeEvidenceCategories = data.evidenceCategories;

          // Merge scrape data into result
          setResult((prev) => {
            const updated = {
              ...prev!,
              extracted: data.extracted,
              groundTruth: data.groundTruth,
              pagesScraped: data.pagesScraped,
              evidenceCategories: data.evidenceCategories,
              success: prev!.success || !!(data.extracted || data.groundTruth),
            };
            setContextForOssy(buildContextForOssy(updated));
            return updated;
          });
          setStages((prev) => ({ ...prev, scrape: "done" }));
          console.log(
            `[Enrichment] Scrape done: ${data.pagesScraped} pages, ` +
              `${data.extracted?.clients?.length ?? 0} clients`
          );
        })
        .catch((err) => {
          if (thisRun !== runIdRef.current) return;
          console.warn("[Enrichment] Scrape stage failed:", err);
          setStages((prev) => ({ ...prev, scrape: "failed" }));
        });

      // Wait for both PDL + Scrape
      await Promise.allSettled([pdlPromise, scrapePromise]);
      if (thisRun !== runIdRef.current) return; // stale

      // ─── Stage 3: AI Classification ─────────────────────
      // Needs rawContent from scrape and optionally pdlSummary
      if (stageData.scrapeRawContent || stageData.pdlCompanyCard) {
        setStages((prev) => ({ ...prev, classify: "loading" }));

        try {
          const classifyRes = await fetch("/api/enrich/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rawContent: stageData.scrapeRawContent || "",
              pdlSummary: stageData.pdlCompanyCard || undefined,
              services: stageData.scrapeExtracted?.services,
              aboutPitch: stageData.scrapeExtracted?.aboutPitch,
            }),
          });

          if (thisRun !== runIdRef.current) return;

          if (classifyRes.ok) {
            const data = await classifyRes.json();
            stageData.classificationData = data.classification;

            setResult((prev) => {
              const updated = {
                ...prev!,
                classification: data.classification,
                success: true,
              };
              setContextForOssy(buildContextForOssy(updated));
              return updated;
            });
            setStages((prev) => ({ ...prev, classify: "done" }));
            console.log(
              `[Enrichment] Classify done: ${data.classification?.categories?.length ?? 0} categories`
            );
          } else {
            setStages((prev) => ({ ...prev, classify: "failed" }));
          }
        } catch (err) {
          if (thisRun !== runIdRef.current) return;
          console.warn("[Enrichment] Classify stage failed:", err);
          setStages((prev) => ({ ...prev, classify: "failed" }));
        }
      } else {
        // No content to classify
        setStages((prev) => ({ ...prev, classify: "failed" }));
      }

      if (thisRun !== runIdRef.current) return;

      // ─── Check if we got any data at all ────────────────
      const hasAnyData = !!(stageData.pdlCompanyData || stageData.scrapeExtracted || stageData.classificationData);

      if (hasAnyData) {
        setStatus("done");
        setStages((prev) => ({ ...prev, overall: "done" }));
      } else {
        // Nothing found — tell Ossy the URL was bad
        setContextForOssy(
          `[ENRICHMENT FAILED for ${domain}]\n` +
          `The website could not be reached or returned no usable content. ` +
          `PDL lookup found nothing. Jina scrape found nothing meaningful.\n` +
          `The user needs to provide a working website URL, or they can only continue as an individual expert (not a firm).`
        );
        setStatus("failed");
        setStages((prev) => ({ ...prev, overall: "failed" }));
      }

      // ─── Stage 4: Persist to DB (background, best-effort) ──
      // If organizationId isn't available yet, the deferred persist useEffect
      // will handle it when orgId arrives.
      if (organizationId && hasAnyData) {
        persistedRef.current = true;
        fetch("/api/enrich/persist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: normalized,
            domain,
            organizationId,
            companyData: stageData.pdlCompanyData,
            companyCard: stageData.pdlCompanyCard,
            groundTruth: stageData.scrapeGroundTruth,
            extracted: stageData.scrapeExtracted,
            classification: stageData.classificationData,
            pagesScraped: stageData.scrapePagesScraped,
            evidenceCategories: stageData.scrapeEvidenceCategories,
          }),
        }).catch((err) => {
          console.warn("[Enrichment] Persist failed (best-effort):", err);
          persistedRef.current = false; // Allow deferred retry
        });
      }
    },
    [enrichedUrl, organizationId]
  );

  const value: EnrichmentContextValue = {
    status,
    stages,
    result,
    contextForOssy,
    triggerEnrichment,
    reset,
  };

  return React.createElement(
    EnrichmentContext.Provider,
    { value },
    children
  );
}
