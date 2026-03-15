"use client";

import { useState, useEffect, useCallback } from "react";
import type { Expert, ExpertSpecialistProfile } from "@/types/cos-data";
import { getDivisionColor } from "@/types/cos-data";
import { normalizeLinkedInUrl } from "@/lib/utils";

type ExpertDivision = Expert["division"];

/** Maps DB expert_division enum value to ExpertDivision display label */
function mapDivision(dbDivision: string | null): ExpertDivision {
  switch (dbDivision) {
    case "collective_member": return "Collective Member";
    case "trusted_expert": return "Trusted Expert";
    case "expert": return "Expert";
    default: return "Unknown";
  }
}

interface UseDbExpertsReturn {
  experts: Expert[];
  total: number;
  isLoading: boolean;
  /** Re-fetch the expert list from the server */
  refetch: () => void;
}

/**
 * Fetches expert profiles from the new expertProfiles DB table.
 * Accepts either organizationId (preferred for the firm page) or firmId.
 */
export function useDbExperts(
  organizationId: string | undefined
): UseDbExpertsReturn {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setExperts([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/experts?organizationId=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (!data?.experts) {
          setExperts([]);
          setTotal(0);
          setIsLoading(false);
          return;
        }

        // Map DB expert profile shape to the Expert type used by ExpertCard
        const mapped: Expert[] = data.experts.map(
          (ep: {
            id: string;
            fullName?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            email?: string | null;
            title?: string | null;
            bio?: string | null;
            location?: string | null;
            linkedinUrl?: string | null;
            photoUrl?: string | null;
            division?: string | null;
            expertTier?: string | null;
            isFullyEnriched?: boolean;
            enrichmentStatus?: string | null;
            rosterStatus?: string | null;
            userId?: string | null;
            updatedAt?: string | null;
            topSkills?: string[] | null;
            topIndustries?: string[] | null;
            specialistProfiles?: Array<{
              id: string;
              title?: string | null;
              bodyDescription?: string | null;
              qualityScore?: number | null;
              qualityStatus?: string | null;
              isSearchable?: boolean;
              isPrimary?: boolean;
              source?: string | null;
              skills?: string[] | null;
              industries?: string[] | null;
              services?: string[] | null;
            }>;
          }) => {
            const division = mapDivision(ep.division ?? null);
            const name =
              ep.fullName ||
              [ep.firstName, ep.lastName].filter(Boolean).join(" ") ||
              "Expert";

            const specialistProfiles: ExpertSpecialistProfile[] = (
              ep.specialistProfiles ?? []
            ).map((sp) => ({
              id: sp.id,
              title: sp.title ?? "Untitled",
              summary: sp.bodyDescription ?? "",
              bodyDescription: sp.bodyDescription ?? undefined,
              skills: sp.skills ?? [],
              industries: sp.industries ?? [],
              services: sp.services ?? [],
              qualityScore: sp.qualityScore ?? undefined,
              qualityStatus: (sp.qualityStatus ?? "incomplete") as
                | "strong"
                | "partial"
                | "weak"
                | "incomplete",
              isSearchable: sp.isSearchable,
              isPrimary: sp.isPrimary,
              source: (sp.source ?? undefined) as
                | "ai_generated"
                | "user_created"
                | "ai_suggested_user_confirmed"
                | undefined,
            }));

            return {
              id: ep.id,
              name,
              email: ep.email ?? "",
              role: ep.title ?? "Expert",
              skills: ep.topSkills ?? [],
              industries: ep.topIndustries ?? [],
              hourlyRate: null,
              availability: "Available",
              division,
              divisionColor: getDivisionColor(division),
              linkedinUrl: normalizeLinkedInUrl(ep.linkedinUrl) ?? undefined,
              photoUrl: ep.photoUrl ?? undefined,
              bio: ep.bio ?? undefined,
              location: ep.location ?? undefined,
              profileUrl: `/experts/${ep.id}`,
              expertTier: (ep.expertTier as Expert["expertTier"]) ?? null,
              isFullyEnriched: ep.isFullyEnriched ?? false,
              enrichmentStatus: (ep.enrichmentStatus as Expert["enrichmentStatus"]) ?? "roster",
              rosterStatus: (ep.rosterStatus as Expert["rosterStatus"]) ?? "active",
              userId: ep.userId ?? null,
              updatedAt: ep.updatedAt ?? null,
              specialistProfiles:
                specialistProfiles.length > 0 ? specialistProfiles : undefined,
            } satisfies Expert;
          }
        );

        setExperts(mapped);
        setTotal(mapped.length);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, fetchTrigger]);

  return { experts, total, isLoading, refetch };
}
