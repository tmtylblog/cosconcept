"use client";

import { useState, useEffect, useMemo } from "react";
import type { Expert } from "@/types/cos-data";
import type { LegacyCaseStudy } from "@/types/cos-data";
import { classifyTeamMembersSync } from "@/lib/enrichment/expert-classifier";

interface UseLegacyDataReturn {
  /** Expert profiles for this organization */
  experts: Expert[];
  /** Case studies for this organization */
  caseStudies: LegacyCaseStudy[];
  /** Total expert count (may be more than loaded) */
  totalExperts: number;
  /** Classified expert count (client-facing roles only) */
  classifiedExpertCount: number;
  /** Total case study count (may be more than loaded) */
  totalCaseStudies: number;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Whether any legacy data exists for this org */
  hasLegacyData: boolean;
}

/**
 * Hook to fetch legacy data (experts + case studies) for an organization.
 * Data is read from the legacy JSON files via API endpoints.
 * Returns empty arrays for firms without legacy data.
 */
export function useLegacyData(
  orgName: string | undefined
): UseLegacyDataReturn {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [caseStudies, setCaseStudies] = useState<LegacyCaseStudy[]>([]);
  const [totalExperts, setTotalExperts] = useState(0);
  const [totalCaseStudies, setTotalCaseStudies] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLegacyData, setHasLegacyData] = useState(false);

  useEffect(() => {
    if (!orgName) {
      setExperts([]);
      setCaseStudies([]);
      setTotalExperts(0);
      setTotalCaseStudies(0);
      setHasLegacyData(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const encoded = encodeURIComponent(orgName);

    // Fetch both in parallel
    Promise.all([
      fetch(`/api/legacy/experts?orgName=${encoded}&limit=50`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/legacy/case-studies?orgName=${encoded}&limit=50&status=published`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([expertsRes, csRes]) => {
      if (cancelled) return;

      const loadedExperts: Expert[] = expertsRes?.experts ?? [];
      const loadedCS: LegacyCaseStudy[] = csRes?.caseStudies ?? [];

      setExperts(loadedExperts);
      setCaseStudies(loadedCS);
      setTotalExperts(expertsRes?.total ?? 0);
      setTotalCaseStudies(csRes?.total ?? 0);
      setHasLegacyData(loadedExperts.length > 0 || loadedCS.length > 0);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [orgName]);

  // Classify experts by job title (sync, rule-based)
  const classifiedExpertCount = useMemo(() => {
    if (experts.length === 0) return 0;
    const members = experts.map((e) => ({ name: e.name, role: e.role }));
    const result = classifyTeamMembersSync(members);
    return result.expertCount;
  }, [experts]);

  return {
    experts,
    caseStudies,
    totalExperts,
    classifiedExpertCount,
    totalCaseStudies,
    isLoading,
    hasLegacyData,
  };
}
