"use client";

import { useState, useCallback, useRef } from "react";
import { Search, Loader2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiscoverFilters } from "@/hooks/use-discover-results";

interface DiscoverSearchBarProps {
  onSearch: (query: string) => void;
  searching: boolean;
  searchQuery: string;
  parsedFilters: DiscoverFilters;
  onRemoveFilter: (key: keyof DiscoverFilters, value?: string) => void;
}

export function DiscoverSearchBar({
  onSearch,
  searching,
  searchQuery,
  parsedFilters,
  onRemoveFilter,
}: DiscoverSearchBarProps) {
  const [input, setInput] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim()) {
        onSearch(input.trim());
      }
    },
    [input, onSearch]
  );

  // Collect active filter chips from parsed filters
  const chips: { key: keyof DiscoverFilters; value: string; color: string }[] = [];
  for (const skill of parsedFilters.skills ?? []) {
    chips.push({ key: "skills", value: skill, color: "bg-cos-electric/10 text-cos-electric" });
  }
  for (const industry of parsedFilters.industries ?? []) {
    chips.push({ key: "industries", value: industry, color: "bg-cos-signal/10 text-cos-signal" });
  }
  for (const market of parsedFilters.markets ?? []) {
    chips.push({ key: "markets", value: market, color: "bg-cos-warm/10 text-cos-warm" });
  }
  for (const cat of parsedFilters.categories ?? []) {
    chips.push({ key: "categories", value: cat, color: "bg-cos-midnight/5 text-cos-slate" });
  }
  if (parsedFilters.sizeBand) {
    chips.push({ key: "sizeBand", value: parsedFilters.sizeBand, color: "bg-cos-cloud text-cos-slate" });
  }
  if (parsedFilters.entityType) {
    const label = parsedFilters.entityType === "case_study" ? "Case Studies" : parsedFilters.entityType === "expert" ? "Experts" : "Firms";
    chips.push({ key: "entityType", value: label, color: "bg-cos-cloud text-cos-slate" });
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe who you&apos;re looking for..."
          className="w-full rounded-cos-xl border border-cos-border bg-white pl-10 pr-20 py-3 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searching ? (
            <div className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric/10 px-3 py-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
              <span className="text-xs text-cos-electric">Searching</span>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className={cn(
                "flex items-center gap-1 rounded-cos-lg px-3 py-1.5 text-xs font-medium transition-colors",
                input.trim()
                  ? "bg-cos-electric text-white hover:bg-cos-electric/90"
                  : "bg-cos-cloud text-cos-slate cursor-not-allowed"
              )}
            >
              <Zap className="h-3 w-3" />
              Search
            </button>
          )}
        </div>
      </form>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">
            Active:
          </span>
          {chips.map((chip) => (
            <span
              key={`${chip.key}-${chip.value}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-cos-full px-2 py-0.5 text-[10px] font-medium",
                chip.color
              )}
            >
              {chip.value}
              <button
                onClick={() => onRemoveFilter(chip.key, chip.value)}
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                <X className="h-2 w-2" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
