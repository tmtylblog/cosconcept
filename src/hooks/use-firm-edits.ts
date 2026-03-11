"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/** Local edit overrides — user edits take precedence over enrichment data */
export interface FirmEdits {
  aboutPitch?: string;
  services?: string[];
  clients?: string[];
  categories?: string[];
  skills?: string[];
  industries?: string[];
  markets?: string[];
  languages?: string[];
}

type FirmEditsArrayField = Exclude<keyof FirmEdits, "aboutPitch">;

interface EnrichmentDefaults {
  services?: string[];
  clients?: string[];
  categories?: string[];
  skills?: string[];
  industries?: string[];
  markets?: string[];
  languages?: string[];
  aboutPitch?: string;
}

/** Map local field names → API field names (for the update-profile-field util) */
const FIELD_TO_API: Record<string, string> = {
  categories: "firmCategory",
  // All others match 1:1
  services: "services",
  clients: "clients",
  skills: "skills",
  industries: "industries",
  markets: "markets",
  languages: "languages",
};

/**
 * Manages local edit state for firm profile sections.
 * Syncs enrichment data as defaults (user edits take precedence).
 * Persists changes to /api/profile/update on every add/remove/edit.
 */
export function useFirmEdits(
  enrichmentReady: boolean,
  defaults: EnrichmentDefaults,
  organizationId?: string
) {
  const [edits, setEdits] = useState<FirmEdits>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Debounce timer for aboutPitch
  const pitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync enrichment data as defaults when enrichment completes
  useEffect(() => {
    if (enrichmentReady) {
      setEdits((prev) => ({
        ...prev,
        services: prev.services ?? defaults.services,
        clients: prev.clients ?? defaults.clients,
        categories: prev.categories ?? defaults.categories,
        skills: prev.skills ?? defaults.skills,
        industries: prev.industries ?? defaults.industries,
        markets: prev.markets ?? defaults.markets,
        languages: prev.languages ?? defaults.languages,
        aboutPitch: prev.aboutPitch ?? defaults.aboutPitch,
      }));
    }
  }, [enrichmentReady, defaults]);

  // ─── Persist helper ──────────────────────────────────────
  const persistField = useCallback(
    async (field: string, value: string | string[]) => {
      const apiField = FIELD_TO_API[field] || field;
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: apiField, value, organizationId }),
        });
        if (!res.ok) {
          console.error(`[useFirmEdits] Failed to persist ${field}:`, await res.text());
          return false;
        }
        return true;
      } catch (err) {
        console.error(`[useFirmEdits] Persist error for ${field}:`, err);
        return false;
      }
    },
    [organizationId]
  );

  const addTag = useCallback(
    (field: FirmEditsArrayField, value: string) => {
      if (!value.trim()) return;
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        if (existing.some((e) => e.toLowerCase() === value.trim().toLowerCase())) return prev;
        const updated = [...existing, value.trim()];
        // Persist async (fire-and-forget with revert on failure)
        persistField(field, updated).then((ok) => {
          if (!ok) {
            // Revert
            setEdits((curr) => ({ ...curr, [field]: existing }));
          }
        });
        return { ...prev, [field]: updated };
      });
      setEditInput("");
    },
    [persistField]
  );

  const removeTag = useCallback(
    (field: FirmEditsArrayField, value: string) => {
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        const updated = existing.filter((v) => v !== value);
        // Persist async with revert on failure
        persistField(field, updated).then((ok) => {
          if (!ok) {
            setEdits((curr) => ({ ...curr, [field]: existing }));
          }
        });
        return { ...prev, [field]: updated };
      });
    },
    [persistField]
  );

  const setFieldEdit = useCallback(
    (field: keyof FirmEdits, value: string | string[]) => {
      setEdits((prev) => ({ ...prev, [field]: value }));

      // Debounce aboutPitch persistence (user is typing)
      if (field === "aboutPitch" && typeof value === "string") {
        if (pitchTimerRef.current) clearTimeout(pitchTimerRef.current);
        pitchTimerRef.current = setTimeout(() => {
          setSaving(true);
          persistField(field, value).finally(() => setSaving(false));
        }, 500);
      } else {
        // Array fields persist immediately
        persistField(field, value);
      }
    },
    [persistField]
  );

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (pitchTimerRef.current) clearTimeout(pitchTimerRef.current);
    };
  }, []);

  return {
    edits,
    editingSection,
    setEditingSection,
    editInput,
    setEditInput,
    addTag,
    removeTag,
    setFieldEdit,
    saving,
  };
}
