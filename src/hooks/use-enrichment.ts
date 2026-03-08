"use client";

import { createContext, useContext, useCallback, useState, useEffect } from "react";
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
  companyCard: string | null;
  companyData: EnrichmentCompanyData | null;
  groundTruth: string | null;
  pagesScraped: number;
  evidenceCategories: string[];
  extracted: EnrichmentExtracted | null;
  classification: EnrichmentClassification | null;
}

export type EnrichmentStatus = "idle" | "loading" | "done" | "error";

// ─── Helpers ──────────────────────────────────────────────

/** Build context string for Ossy prompt from enrichment data */
function buildContextForOssy(data: EnrichmentResult): string {
  const parts: string[] = [
    `[ENRICHMENT RESULTS for ${data.domain || data.url}]`,
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

interface EnrichmentContextValue {
  status: EnrichmentStatus;
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
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [contextForOssy, setContextForOssy] = useState<string | null>(null);
  const [enrichedUrl, setEnrichedUrl] = useState<string | null>(null);

  // Hydrate from DB on mount — if enrichment was done previously, load it
  useEffect(() => {
    if (!organizationId || result) return;
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch(`/api/enrich/firm?organizationId=${organizationId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.enrichmentData) return;

        const enrichmentData = data.enrichmentData as EnrichmentResult;
        setResult(enrichmentData);
        setEnrichedUrl(enrichmentData.url);
        setContextForOssy(buildContextForOssy(enrichmentData));
        setStatus("done");
      } catch {
        // Silently ignore hydration failures
      }
    }

    hydrate();
    return () => { cancelled = true; };
  }, [organizationId, result]);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setContextForOssy(null);
    setEnrichedUrl(null);
  }, []);

  const triggerEnrichment = useCallback(
    async (url: string) => {
      if (enrichedUrl === url) return; // Already enriched
      setEnrichedUrl(url);
      setStatus("loading");

      try {
        const res = await fetch("/api/enrich/website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, organizationId }),
        });

        if (!res.ok) throw new Error("Enrichment failed");

        const data: EnrichmentResult = await res.json();
        setResult(data);
        setContextForOssy(buildContextForOssy(data));
        setStatus("done");

        console.log(
          `[Enrichment] Done: PDL ${data.companyCard ? "found" : "miss"}, ` +
            `${data.pagesScraped} pages scraped, ` +
            `${data.classification?.categories.length ?? 0} categories classified`
        );
      } catch (err) {
        console.error("[Enrichment] Failed:", err);
        setStatus("error");
      }
    },
    [enrichedUrl, organizationId]
  );

  const value: EnrichmentContextValue = {
    status,
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
