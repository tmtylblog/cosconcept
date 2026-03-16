"use client";

import { useState, useCallback } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiscoverResults, type DiscoverCandidate, type DiscoverFilters } from "@/hooks/use-discover-results";
import { DiscoverSearchBar } from "@/components/discover/discover-search-bar";
import { DiscoverFilterSidebar } from "@/components/discover/discover-filters";
import { DiscoverResultsGrid } from "@/components/discover/discover-results";
import { DiscoverDrawer } from "@/components/discover/discover-drawer";

// ─── Conversation starters ───────────────────────────────────
const STARTERS = [
  "We keep getting requests outside our core \u2014 we need referral partners",
  "We\u2019re trying to break into a new industry but lack the credibility",
  "I need to find firms who complement us for a bigger client pitch",
  "We\u2019re a boutique losing deals to larger competitors \u2014 who can we team up with?",
];

function injectIntoChat(text: string) {
  window.dispatchEvent(new CustomEvent("cos:inject-chat", { detail: { text } }));
}

// ─── Idle State ───────────────────────────────────────────────

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-cos-2xl bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
        <Sparkles className="h-7 w-7 text-cos-electric" />
      </div>

      <h2 className="mt-5 font-heading text-lg font-bold text-cos-midnight">
        Discover Your Network
      </h2>
      <p className="mt-2 max-w-sm text-sm text-cos-slate leading-relaxed">
        Search for partners by describing what you need, or use the filters on the left.
        Ossy is standing by to help refine your search.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-3 cursor-pointer hover:bg-cos-electric/10 transition-colors"
        onClick={() => injectIntoChat("Help me find the right partners")}
      >
        <span className="text-sm font-medium text-cos-electric">
          Or ask Ossy for help
        </span>
        <ArrowRight className="h-4 w-4 text-cos-electric" />
      </div>

      <div className="mt-6 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cos-slate">
          Try a search
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => injectIntoChat(starter)}
              className="rounded-cos-xl border border-cos-border bg-white px-4 py-3 text-left text-sm text-cos-midnight hover:border-cos-electric/40 hover:bg-cos-electric/5 transition-colors"
            >
              &ldquo;{starter}&rdquo;
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DiscoverPage() {
  const discover = useDiscoverResults();
  const [drawerMatch, setDrawerMatch] = useState<DiscoverCandidate | null>(null);

  const handleSearch = useCallback(
    (query: string) => {
      discover?.executeSearch(query);
    },
    [discover]
  );

  const handleFiltersChange = useCallback(
    (newFilters: DiscoverFilters) => {
      if (!discover) return;
      discover.setFilters(newFilters);
      if (discover.searchQuery) {
        discover.executeSearch(discover.searchQuery, newFilters);
      }
    },
    [discover]
  );

  const handleRemoveFilter = useCallback(
    (key: keyof DiscoverFilters, value?: string) => {
      if (!discover) return;
      const updated = { ...discover.parsedFilters };
      if (Array.isArray(updated[key]) && value) {
        (updated[key] as string[]) = (updated[key] as string[]).filter(
          (v: string) => v !== value
        );
        if ((updated[key] as string[]).length === 0) delete updated[key];
      } else {
        delete updated[key];
      }
      discover.setFilters(updated);
      if (discover.searchQuery) {
        discover.executeSearch(discover.searchQuery, updated);
      }
    },
    [discover]
  );

  const handleViewProfile = useCallback((match: DiscoverCandidate) => {
    setDrawerMatch(match);
  }, []);

  if (!discover) return null;

  const {
    results,
    searching,
    searchQuery,
    filters,
    parsedFilters,
    stats,
    error,
    clear,
  } = discover;

  const hasResults = results.length > 0 || searching;
  const hasSearched = searchQuery.length > 0;

  // Merge parsed filters into sidebar display
  const displayFilters: DiscoverFilters = {
    ...filters,
    skills: [...new Set([...(filters.skills ?? []), ...(parsedFilters.skills ?? [])])],
    industries: [...new Set([...(filters.industries ?? []), ...(parsedFilters.industries ?? [])])],
    markets: [...new Set([...(filters.markets ?? []), ...(parsedFilters.markets ?? [])])],
    categories: [...new Set([...(filters.categories ?? []), ...(parsedFilters.categories ?? [])])],
    sizeBand: filters.sizeBand ?? parsedFilters.sizeBand,
    entityType: filters.entityType ?? parsedFilters.entityType,
  };

  return (
    <>
      <div className="flex h-full">
        {/* Filter Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 border-r border-cos-border bg-cos-surface p-4 overflow-y-auto">
          <DiscoverFilterSidebar
            filters={displayFilters}
            onFiltersChange={handleFiltersChange}
          />
        </aside>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
            {/* Search Bar */}
            <DiscoverSearchBar
              onSearch={handleSearch}
              searching={searching}
              searchQuery={searchQuery}
              parsedFilters={parsedFilters}
              onRemoveFilter={handleRemoveFilter}
            />

            {/* Header with clear */}
            {hasResults && (
              <div className="mt-4 flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold text-cos-midnight">
                  Results
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-cos-slate hover:text-cos-midnight h-7 text-xs"
                  onClick={() => clear()}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              </div>
            )}

            {/* Results, Error, No Results, or Idle */}
            <div className="mt-3">
              {error ? (
                <div className="rounded-cos-xl border border-red-200 bg-red-50 p-6 text-center">
                  <p className="text-sm font-medium text-red-700">Search failed</p>
                  <p className="mt-1 text-xs text-red-600">{error}</p>
                  <button
                    onClick={() => clear()}
                    className="mt-3 text-xs text-red-600 underline hover:text-red-800"
                  >
                    Try again
                  </button>
                </div>
              ) : hasResults ? (
                <DiscoverResultsGrid
                  results={results}
                  searching={searching}
                  searchQuery={searchQuery}
                  stats={stats}
                  onViewProfile={handleViewProfile}
                />
              ) : hasSearched && !searching ? (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-8 text-center">
                  <p className="text-sm font-medium text-cos-midnight">No matches found</p>
                  <p className="mt-1 text-xs text-cos-slate">
                    Try broadening your search or removing some filters.
                  </p>
                  <button
                    onClick={() => clear()}
                    className="mt-3 text-xs text-cos-electric underline hover:text-cos-electric/80"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <IdleState />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {drawerMatch && (
        <DiscoverDrawer
          result={{
            entityType: drawerMatch.entityType,
            entityId: drawerMatch.entityId,
            displayName: drawerMatch.displayName,
            totalScore: drawerMatch.matchScore / 100,
            preview: {
              categories: drawerMatch.categories,
              topServices: [],
              topSkills: drawerMatch.skills,
              industries: drawerMatch.industries,
              website: drawerMatch.website,
            },
          }}
          onClose={() => setDrawerMatch(null)}
          onNavigate={() => {}}
          searchQuery={searchQuery}
        />
      )}
    </>
  );
}
