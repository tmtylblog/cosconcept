"use client";

import { createContext, useContext, useCallback, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import React from "react";

// ─── Types ───────────────────────────────────────────────

export interface ProfileData {
  // Firm fields (from serviceFirms.enrichmentData.confirmed)
  firmCategory?: string;
  services?: string[];
  clients?: string[];
  skills?: string[];
  markets?: string[];
  languages?: string[];
  industries?: string[];
  // v2 partner preference fields (new 5-question flow)
  partnershipPhilosophy?: string;
  capabilityGaps?: string[];
  dealBreaker?: string;
  geographyPreference?: string;
  // Shared between v1 & v2
  preferredPartnerTypes?: string[];
  // v1 legacy partner preference fields (from partnerPreferences.rawOnboardingData JSONB)
  preferredPartnerSize?: string[];
  requiredPartnerIndustries?: string[];
  preferredPartnerLocations?: string[];
  partnershipModels?: string[];
  dealBreakers?: string[];
  growthGoals?: string;
  desiredPartnerServices?: string[];
  idealPartnerClientSize?: string | string[];
  idealProjectSize?: string | string[];
  typicalHourlyRates?: string;
  partnershipRole?: string;
}

interface ProfileContextValue {
  data: ProfileData;
  /** Update a single field — instant local state update */
  updateField: (field: string, value: string | string[]) => void;
  /** Whether initial hydration is complete */
  hydrated: boolean;
}

// ─── Context ─────────────────────────────────────────────

const ProfileContext = createContext<ProfileContextValue>({
  data: {},
  updateField: () => {},
  hydrated: false,
});

export function useProfile() {
  return useContext(ProfileContext);
}

// ─── Provider ────────────────────────────────────────────

export function ProfileProvider({
  children,
  organizationId,
  isAuthenticated = false,
}: {
  children: ReactNode;
  organizationId?: string;
  isAuthenticated?: boolean;
}) {
  const [data, setData] = useState<ProfileData>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from DB on mount. When authenticated but orgId is missing
  // (e.g. hard refresh), the server resolves org from the session.
  useEffect(() => {
    if (!isAuthenticated) {
      setHydrated(true);
      return;
    }
    let cancelled = false;

    async function hydrate() {
      try {
        const params = organizationId
          ? `?organizationId=${organizationId}`
          : "";
        const res = await fetch(`/api/profile${params}`);
        if (!res.ok) return;
        const profile = await res.json();
        if (cancelled) return;
        setData(profile);
      } catch {
        // Silently ignore hydration failures
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrate();
    return () => { cancelled = true; };
  }, [organizationId, isAuthenticated]);

  const updateField = useCallback((field: string, value: string | string[]) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const contextValue = useMemo<ProfileContextValue>(() => ({
    data,
    updateField,
    hydrated,
  }), [data, updateField, hydrated]);

  return React.createElement(
    ProfileContext.Provider,
    { value: contextValue },
    children
  );
}
