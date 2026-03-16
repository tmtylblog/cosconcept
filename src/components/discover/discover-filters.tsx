"use client";

import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import type { DiscoverFilters } from "@/hooks/use-discover-results";

interface DiscoverFilterSidebarProps {
  filters: DiscoverFilters;
  onFiltersChange: (filters: DiscoverFilters) => void;
}

const SIZE_OPTIONS = [
  { value: "", label: "Any Size" },
  { value: "micro", label: "Micro (<10)" },
  { value: "small", label: "Small (10-50)" },
  { value: "medium", label: "Medium (50-200)" },
  { value: "large", label: "Large (200+)" },
];

const ENTITY_OPTIONS: { value: DiscoverFilters["entityType"] | ""; label: string }[] = [
  { value: "", label: "All Types" },
  { value: "firm", label: "Firms" },
  { value: "expert", label: "Experts" },
  { value: "case_study", label: "Case Studies" },
];

async function fetchSkillSuggestions(query: string): Promise<string[]> {
  const res = await fetch(`/api/taxonomy/skills/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: { name: string }) => r.name);
}

async function fetchIndustrySuggestions(query: string): Promise<string[]> {
  const res = await fetch(`/api/taxonomy/industries/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: string | { name: string }) => typeof r === "string" ? r : r.name);
}

// Categories are a static list of 30 — fetched once from API
let _categoriesCache: string[] | null = null;

async function loadCategories(): Promise<string[]> {
  if (_categoriesCache) return _categoriesCache;
  const res = await fetch("/api/taxonomy/categories/search");
  if (!res.ok) return [];
  const data = await res.json();
  _categoriesCache = (data.results ?? []).map((r: { name: string }) => r.name);
  return _categoriesCache;
}

export function DiscoverFilterSidebar({ filters, onFiltersChange }: DiscoverFilterSidebarProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [localEntityType, setLocalEntityType] = useState<string>(filters.entityType ?? "");

  // Load categories once
  useEffect(() => {
    loadCategories().then(setCategories);
  }, []);

  // Sync local entity type with external filter changes (from Ossy)
  useEffect(() => {
    setLocalEntityType(filters.entityType ?? "");
  }, [filters.entityType]);

  const update = useCallback(
    (patch: Partial<DiscoverFilters>) => {
      onFiltersChange({ ...filters, ...patch });
    },
    [filters, onFiltersChange]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-cos-slate" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cos-slate">
          Filters
        </h3>
      </div>

      {/* Entity Type */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-cos-midnight">Type</p>
        <div className="space-y-1">
          {ENTITY_OPTIONS.map((opt) => (
            <label
              key={opt.value ?? "all"}
              className="flex items-center gap-2 cursor-pointer text-xs text-cos-midnight"
            >
              <input
                type="radio"
                name="discoverEntityType"
                value={opt.value}
                checked={localEntityType === opt.value}
                onChange={() => {
                  setLocalEntityType(opt.value);
                  update({ entityType: opt.value ? (opt.value as DiscoverFilters["entityType"]) : undefined });
                }}
                className="h-3 w-3 accent-cos-electric"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Skills */}
      <AutocompleteInput
        label="Skills"
        placeholder="Search skills..."
        values={filters.skills ?? []}
        onChange={(skills) => update({ skills })}
        fetchSuggestions={fetchSkillSuggestions}
        maxItems={8}
        color="electric"
      />

      {/* Industries */}
      <AutocompleteInput
        label="Industries"
        placeholder="Search industries..."
        values={filters.industries ?? []}
        onChange={(industries) => update({ industries })}
        fetchSuggestions={fetchIndustrySuggestions}
        maxItems={6}
        color="signal"
      />

      {/* Categories — dropdown since only 30 */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-cos-midnight">Category</p>
        <select
          value={filters.categories?.[0] ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            update({ categories: val ? [val] : [] });
          }}
          className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
        >
          <option value="">Any Category</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Size Band */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-cos-midnight">Size</p>
        <select
          value={filters.sizeBand ?? ""}
          onChange={(e) => update({ sizeBand: e.target.value || undefined })}
          className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
        >
          {SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
