"use client";

import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import React from "react";
import { logOnboardingEventClient } from "@/lib/onboarding/log-client";

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

export type FirmNature = "service_provider" | "product_company" | "brand_or_retailer" | "hybrid" | "unclear";

export interface EnrichmentClassification {
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  confidence: number;
  firmNature?: FirmNature;
}

export interface EnrichmentResult {
  url: string;
  domain: string;
  logoUrl?: string;
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
        `\nLanguages: ${data.classification.languages.join(", ") || "unknown"}` +
        (data.classification.firmNature ? `\nFirm Nature: ${data.classification.firmNature}` : "")
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
  /** Whether the enriched domain is a brand/product company (not a service provider) */
  isBrandDetected: boolean;
  /** Trigger enrichment for a URL. Set forceGapFill=true to re-run even if same URL (fills missing data). */
  triggerEnrichment: (url: string, forceGapFill?: boolean) => Promise<void>;
  /** Reset all enrichment state (for testing / new agency simulation) */
  reset: () => void;
}

// ─── Context ─────────────────────────────────────────────

const EnrichmentContext = createContext<EnrichmentContextValue>({
  status: "idle",
  stages: INITIAL_STAGES,
  result: null,
  contextForOssy: null,
  isBrandDetected: false,
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
  // Auto-retry: track whether we've attempted gap-fill after hydration
  const autoRetryDoneRef = useRef(false);
  const wasHydratedRef = useRef(false);

  // ─── Storage: save enrichment result to survive page reloads + browser close ───
  const STORAGE_KEY = "cos_enrichment_result";

  // Save result to BOTH localStorage and sessionStorage whenever it changes
  useEffect(() => {
    if (!result) return;
    try {
      const json = JSON.stringify(result);
      localStorage.setItem(STORAGE_KEY, json);
      sessionStorage.setItem(STORAGE_KEY, json);
    } catch {
      // quota exceeded or SSR — ignore
    }
  }, [result]);

  // Hydrate from localStorage/sessionStorage on mount, then try DB
  useEffect(() => {
    if (result) return; // Already have data in memory
    let cancelled = false;

    async function hydrate() {
      // Try localStorage first (survives browser close), then sessionStorage
      try {
        const cached = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
        if (cached && !cancelled) {
          const enrichmentData = JSON.parse(cached) as EnrichmentResult;
          if (enrichmentData.domain) {
            wasHydratedRef.current = true;
            setResult(enrichmentData);
            setEnrichedUrl(enrichmentData.url);
            setContextForOssy(buildContextForOssy(enrichmentData));
            // Ensure domain key is set in both storages for guest preference DB sync
            try {
              localStorage.setItem("cos_guest_domain", enrichmentData.domain);
              sessionStorage.setItem("cos_guest_domain", enrichmentData.domain);
            } catch { /* ignore */ }

            // Set accurate status based on ACTUAL data quality
            // Use the same strict criteria as auto-retry and lookup gap-fill
            const ed = enrichmentData;
            const cd = ed.companyData;
            const hydHasRealPdl = !!(cd && (
              (cd.employeeCount ?? 0) > 0 || cd.size || cd.location || cd.inferredRevenue
            ));
            const hydHasScrape = !!(
              (ed.extracted?.services?.length) ||
              (ed.extracted?.clients?.length) ||
              ed.extracted?.aboutPitch ||
              ed.groundTruth
            );
            const hydHasClassify = !!(
              ed.classification?.categories?.length &&
              ed.classification?.skills?.length
            );
            const isComplete = hydHasRealPdl && hydHasScrape && hydHasClassify;
            const hasAnyRealData = hydHasRealPdl || hydHasScrape || hydHasClassify;

            if (isComplete) {
              // All three stages have real data — show as done
              setStatus("done");
              setStages({ overall: "done", pdl: "done", scrape: "done", classify: "done" });
            } else if (hasAnyRealData) {
              // Partial data — show what we have, auto-retry will fill gaps
              setStatus("done");
              setStages({
                overall: "done",
                pdl: hydHasRealPdl ? "done" : "idle",
                scrape: hydHasScrape ? "done" : "idle",
                classify: hydHasClassify ? "done" : "idle",
              });
            } else {
              // No real data at all — show enriching state while auto-retry fills it
              setStatus("loading");
              setStages({
                overall: "enriching",
                pdl: "loading",
                scrape: "loading",
                classify: "idle",
              });
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
    autoRetryDoneRef.current = false;
    wasHydratedRef.current = false;
    setStatus("idle");
    setStages(INITIAL_STAGES);
    setResult(null);
    setContextForOssy(null);
    setEnrichedUrl(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("cos_guest_domain");
      sessionStorage.removeItem("cos_guest_domain");
    } catch { /* ignore */ }
  }, []);

  const triggerEnrichment = useCallback(
    async (url: string, forceGapFill?: boolean) => {
      if (enrichedUrl === url && !forceGapFill) return; // Same URL — skip (unless gap-filling)

      // New enrichment run
      const thisRun = ++runIdRef.current;
      persistedRef.current = false;
      setEnrichedUrl(url);
      setStatus("loading");
      logOnboardingEventClient({ stage: "domain_submitted", event: "domain_entered", domain: url, metadata: { isGuest: !organizationId } });
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

      // Persist domain to both storages so guest preferences can sync to DB
      // localStorage survives browser close; sessionStorage is for same-tab backup
      try {
        localStorage.setItem("cos_guest_domain", domain);
        sessionStorage.setItem("cos_guest_domain", domain);
      } catch { /* ignore */ }

      // Initialize result shell so the dashboard can show the domain immediately
      const resultShell: EnrichmentResult = {
        url: normalized,
        domain,
        logoUrl: `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`,
        success: false,
        companyCard: null,
        companyData: null,
        groundTruth: null,
        pagesScraped: 0,
        evidenceCategories: [],
        extracted: null,
        classification: null,
      };
      // During gap-fill, preserve existing data so cards don't flash empty
      if (forceGapFill) {
        setResult((prev) => (prev?.domain === domain ? prev : resultShell));
      } else {
        setResult(resultShell);
      }

      // ─── Stage 0: Check our own data first (saves paid API credits) ───
      // Seed from cache if available, then only call paid APIs for missing pieces
      let needsPdl = true;
      let needsScrape = true;
      let needsClassify = true;

      // Track data across stages
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

      try {
        const lookupRes = await fetch("/api/enrich/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });

        if (thisRun !== runIdRef.current) return; // stale

        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          if (lookupData.found && lookupData.data) {
            const cached = lookupData.data as EnrichmentResult;
            cached.domain = cached.domain || domain;
            cached.url = cached.url || normalized;
            cached.logoUrl = cached.logoUrl || `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;

            // Seed result with cached data immediately so cards appear
            setResult(cached);
            setContextForOssy(buildContextForOssy(cached));

            // Check what we already have vs what's missing
            // companyData must have REAL PDL content — not just a name from the graph
            const cd = cached.companyData;
            const hasRealPdlData = cd && (
              cd.employeeCount > 0 || cd.size || cd.location || cd.inferredRevenue || cd.founded
            );
            if (hasRealPdlData) {
              needsPdl = false;
              stageData.pdlCompanyData = cd;
              stageData.pdlCompanyCard = cached.companyCard;
              setStages((prev) => ({ ...prev, pdl: "done" }));
              console.log("[Enrichment] Using cached PDL data:", cd.name, cd.size, cd.location, cd.employeeCount);
            } else {
              console.log("[Enrichment] Cached companyData is incomplete, will call PDL:", JSON.stringify(cd));
            }
            // Scrape: require REAL content — not just an empty extracted object
            const hasRealScrapeData = !!(
              (cached.extracted?.services?.length) ||
              (cached.extracted?.clients?.length) ||
              cached.extracted?.aboutPitch ||
              cached.groundTruth
            );
            if (hasRealScrapeData) {
              needsScrape = false;
              stageData.scrapeExtracted = cached.extracted;
              stageData.scrapeGroundTruth = cached.groundTruth as string | null;
              stageData.scrapePagesScraped = cached.pagesScraped || 0;
              stageData.scrapeEvidenceCategories = cached.evidenceCategories || [];
              setStages((prev) => ({ ...prev, scrape: "done" }));
            } else {
              console.log("[Enrichment] Cached scrape data is empty/minimal, will re-scrape");
            }
            // Classification: require both categories AND skills to count as complete
            if (cached.classification && (cached.classification.categories?.length ?? 0) > 0 && (cached.classification.skills?.length ?? 0) > 0) {
              needsClassify = false;
              stageData.classificationData = cached.classification;
              setStages((prev) => ({ ...prev, classify: "done" }));
            }

            // If everything is complete, return immediately
            if (!needsPdl && !needsScrape && !needsClassify) {
              console.log(`[Enrichment] Full cache HIT (${lookupData.source}) for ${domain}`);
              logOnboardingEventClient({ stage: "cache_lookup", event: "cache_hit_full", domain, metadata: { source: lookupData.source } });
              setStatus("done");
              setStages({ overall: "done", pdl: "done", scrape: "done", classify: "done" });
              persistedRef.current = true;
              return;
            }

            const gaps = [needsPdl && "PDL", needsScrape && "Scrape", needsClassify && "Classify"].filter(Boolean) as string[];
            logOnboardingEventClient({ stage: "cache_lookup", event: "cache_hit_partial", domain, metadata: { source: lookupData.source, gaps } });
            console.log(
              `[Enrichment] Partial cache HIT (${lookupData.source}) for ${domain} — gaps: ${gaps.join(", ")}`
            );
          }
        }
      } catch (lookupErr) {
        console.warn("[Enrichment] Lookup check failed, proceeding with paid APIs:", lookupErr);
      }
      // Log cache miss if we still need everything
      if (needsPdl && needsScrape && needsClassify) {
        logOnboardingEventClient({ stage: "cache_lookup", event: "cache_miss", domain });
      }

      if (thisRun !== runIdRef.current) return; // stale

      // Update stage indicators for stages we'll skip vs run
      setStages((prev) => ({
        ...prev,
        pdl: needsPdl ? "loading" : prev.pdl,
        scrape: needsScrape ? "loading" : prev.scrape,
        classify: needsClassify ? "idle" : prev.classify,
      }));

      // ─── Stage 1 & 2: PDL + Scrape in parallel (only if needed) ──
      const parallelPromises: Promise<void>[] = [];

      if (needsPdl) {
        parallelPromises.push(
          fetch("/api/enrich/pdl", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain }),
          })
            .then(async (res) => {
              if (thisRun !== runIdRef.current) return;
              if (!res.ok) throw new Error(`PDL failed: ${res.status}`);
              const data = await res.json();
              console.log("[Enrichment] PDL response companyData:", JSON.stringify(data.companyData));

              stageData.pdlCompanyData = data.companyData;
              stageData.pdlCompanyCard = data.companyCard;

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
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "pdl_done", domain, metadata: { status: "done" } });
              console.log(`[Enrichment] PDL done: ${data.companyData?.name || "no match"}`);
            })
            .catch((err) => {
              if (thisRun !== runIdRef.current) return;
              console.warn("[Enrichment] PDL stage failed:", err);
              setStages((prev) => ({ ...prev, pdl: "failed" }));
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "pdl_failed", domain, metadata: { status: "failed" } });
            })
        );
      }

      if (needsScrape) {
        parallelPromises.push(
          fetch("/api/enrich/scrape", {
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
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "scrape_done", domain, metadata: { status: "done" } });
              console.log(
                `[Enrichment] Scrape done: ${data.pagesScraped} pages, ` +
                  `${data.extracted?.clients?.length ?? 0} clients`
              );
            })
            .catch((err) => {
              if (thisRun !== runIdRef.current) return;
              console.warn("[Enrichment] Scrape stage failed:", err);
              setStages((prev) => ({ ...prev, scrape: "failed" }));
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "scrape_failed", domain, metadata: { status: "failed" } });
            })
        );
      }

      // Wait for parallel stages
      if (parallelPromises.length > 0) {
        await Promise.allSettled(parallelPromises);
      }
      if (thisRun !== runIdRef.current) return; // stale

      // ─── Stage 3: AI Classification (only if needed) ──────
      if (needsClassify) {
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
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "classify_done", domain, metadata: { status: "done" } });
              console.log(
                `[Enrichment] Classify done: ${data.classification?.categories?.length ?? 0} categories`
              );
            } else {
              console.warn(`[Enrichment] Classify returned ${classifyRes.status} — check if auth is required`);
              setStages((prev) => ({ ...prev, classify: "failed" }));
              logOnboardingEventClient({ stage: "enrichment_stage_done", event: "classify_failed", domain, metadata: { status: "failed", httpStatus: classifyRes.status } });
            }
          } catch (err) {
            if (thisRun !== runIdRef.current) return;
            console.warn("[Enrichment] Classify stage failed:", err);
            setStages((prev) => ({ ...prev, classify: "failed" }));
            logOnboardingEventClient({ stage: "enrichment_stage_done", event: "classify_failed", domain, metadata: { status: "failed" } });
          }
        } else {
          // No content to classify
          setStages((prev) => ({ ...prev, classify: "failed" }));
        }
      }

      if (thisRun !== runIdRef.current) return;

      // ─── Check if we got any data at all ────────────────
      const hasAnyData = !!(stageData.pdlCompanyData || stageData.scrapeExtracted || stageData.classificationData);

      if (hasAnyData) {
        setStatus("done");
        setStages((prev) => ({ ...prev, overall: "done" }));
        logOnboardingEventClient({
          stage: "enrichment_complete", event: "enrichment_succeeded", domain,
          metadata: {
            stagesCompleted: [
              stageData.pdlCompanyData && "pdl",
              stageData.scrapeExtracted && "scrape",
              stageData.classificationData && "classify",
            ].filter(Boolean),
          },
        });
      } else {
        setContextForOssy(
          `[ENRICHMENT FAILED for ${domain}]\n` +
          `The website could not be reached or returned no usable content. ` +
          `PDL lookup found nothing. Jina scrape found nothing meaningful.\n` +
          `The user needs to provide a working website URL, or they can only continue as an individual expert (not a firm).`
        );
        setStatus("failed");
        setStages((prev) => ({ ...prev, overall: "failed" }));
        logOnboardingEventClient({ stage: "enrichment_complete", event: "enrichment_failed", domain });
      }

      // ─── Stage 4: Persist to DB (background, best-effort) ──

      // 4a. Always write to domain-keyed cache (works for guests AND auth users)
      // This ensures any future enrichment of the same domain gets instant results.
      if (hasAnyData) {
        const cachePayload = {
          url: normalized,
          domain,
          companyData: stageData.pdlCompanyData,
          companyCard: stageData.pdlCompanyCard,
          groundTruth: stageData.scrapeGroundTruth,
          extracted: stageData.scrapeExtracted,
          classification: stageData.classificationData,
          pagesScraped: stageData.scrapePagesScraped,
          evidenceCategories: stageData.scrapeEvidenceCategories,
        };
        fetch("/api/enrich/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cachePayload),
        }).catch((err) => {
          console.warn("[Enrichment] Cache write failed (best-effort):", err);
        });
      }

      // 4b. Auth users: also persist to service_firms + Neo4j graph
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
          persistedRef.current = false;
        });
      }
    },
    [enrichedUrl, organizationId]
  );

  // ─── Auto-retry: if hydrated result is incomplete, re-trigger missing stages ───
  // NOTE: We intentionally do NOT check stages.overall === "enriching" here because
  // hydration may set it to "enriching" cosmetically (to show the progress banner)
  // without actually running any enrichment. The autoRetryDoneRef guard prevents
  // infinite loops and wasHydratedRef ensures this only fires after hydration.
  useEffect(() => {
    if (!wasHydratedRef.current) return; // Only after hydration, not regular enrichment
    if (autoRetryDoneRef.current) return; // Only retry once per mount
    if (!result?.domain) return;

    // Check data completeness — same criteria as the lookup gap-fill logic
    const cd = result.companyData;
    const hasRealPdl = cd && (
      (cd.employeeCount ?? 0) > 0 || cd.size || cd.location || cd.inferredRevenue
    );
    // Scrape: require real content, not just a non-null object with empty arrays
    const hasScrape = !!(
      (result.extracted?.services?.length) ||
      (result.extracted?.clients?.length) ||
      result.extracted?.aboutPitch ||
      result.groundTruth
    );
    // Classification: require both categories AND skills
    const hasClassify = !!(
      result.classification?.categories?.length &&
      result.classification?.skills?.length
    );

    if (!hasRealPdl || !hasScrape || !hasClassify) {
      autoRetryDoneRef.current = true;
      const gaps = [
        !hasRealPdl && "PDL",
        !hasScrape && "Scrape",
        !hasClassify && "Classify",
      ].filter(Boolean);
      console.log(
        `[Enrichment] Hydrated result incomplete for ${result.domain} — auto-retrying gaps: ${gaps.join(", ")}`
      );
      triggerEnrichment(result.url || result.domain, true);
    }
  }, [result, stages.overall, triggerEnrichment]);

  const firmNature = result?.classification?.firmNature;
  const isBrandDetected = firmNature === "brand_or_retailer" || firmNature === "product_company";

  const value: EnrichmentContextValue = {
    status,
    stages,
    result,
    contextForOssy,
    isBrandDetected,
    triggerEnrichment,
    reset,
  };

  return React.createElement(
    EnrichmentContext.Provider,
    { value },
    children
  );
}
