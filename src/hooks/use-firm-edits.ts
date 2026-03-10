"use client";

import { useState, useEffect, useCallback } from "react";

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

/**
 * Manages local edit state for firm profile sections.
 * Syncs enrichment data as defaults (user edits take precedence).
 * Provides addTag, removeTag, setFieldEdit helpers.
 */
export function useFirmEdits(enrichmentReady: boolean, defaults: EnrichmentDefaults) {
  const [edits, setEdits] = useState<FirmEdits>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

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

  const addTag = useCallback(
    (field: FirmEditsArrayField, value: string) => {
      if (!value.trim()) return;
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        if (existing.includes(value.trim())) return prev;
        return { ...prev, [field]: [...existing, value.trim()] };
      });
      setEditInput("");
    },
    []
  );

  const removeTag = useCallback(
    (field: FirmEditsArrayField, value: string) => {
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        return { ...prev, [field]: existing.filter((v) => v !== value) };
      });
    },
    []
  );

  const setFieldEdit = useCallback(
    (field: keyof FirmEdits, value: string | string[]) => {
      setEdits((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  return {
    edits,
    editingSection,
    setEditingSection,
    editInput,
    setEditInput,
    addTag,
    removeTag,
    setFieldEdit,
  };
}
