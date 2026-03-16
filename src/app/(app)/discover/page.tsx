"use client";

import { useState, useCallback } from "react";
import { Sparkles, ArrowRight, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiscoverResults, type DiscoverCandidate, type DiscoverFilters } from "@/hooks/use-discover-results";
import { DiscoverFilterSidebar } from "@/components/discover/discover-filters";
import { DiscoverResultsGrid } from "@/components/discover/discover-results";
import { DiscoverDrawer } from "@/components/discover/discover-drawer";
import { cn } from "@/lib/utils";

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

// ─── Active filter chips (read-only display of what Ossy extracted) ─────

function ActiveFilterChips({
  parsedFilters,
  onRemoveFilter,
}: {
  parsedFilters: DiscoverFilters;
  onRemoveFilter: (key: keyof DiscoverFilters, value?: string) => void;
}) {
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
  if (parsedFilters.entityType) {
    const label = parsedFilters.entityType === "case_study" ? "Case Studies" : parsedFilters.entityType === "expert" ? "Experts" : "Firms";
    chips.push({ key: "entityType", value: label, color: "bg-cos-cloud text-cos-slate" });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">
        Filters:
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
  );
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
        Tell Ossy what you&apos;re looking for and your results will appear here.
        The more context you give, the better the matches.
      </p>

      <div
        className="mt-6 flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-3 cursor-pointer hover:bg-cos-electric/10 transition-colors"
        onClick={() => injectIntoChat("Help me find the right partners")}
      >
        <MessageSquare className="h-4 w-4 text-cos-electric" />
        <span className="text-sm font-medium text-cos-electric">
          Start a conversation with Ossy
        </span>
        <ArrowRight className="h-4 w-4 text-cos-electric" />
      </div>

      <div className="mt-8 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cos-slate">
          Or try one of these
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

  const handleFiltersChange = useCallback(
    (newFilters: DiscoverFilters) => {
      if (!discover) return;
      // Update both filters and parsedFilters so the sidebar reflects the change
      discover.setFilters(newFilters);
      discover.setParsedFilters(newFilters);

      // Tell Ossy about the change via chat injection
      const changed = diffFilters(discover.parsedFilters, newFilters);
      if (changed) {
        const msg = describeFilterChange(changed);
        if (msg) {
          if (discover.searchQuery) {
            // Active search — re-search with updated filters
            discover.executeSearch(discover.searchQuery, newFilters);
          }
          injectIntoChat(msg);
        }
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
    parsedFilters,
    stats,
    error,
    clear,
  } = discover;

  const hasResults = results.length > 0 || searching;
  const hasSearched = searchQuery.length > 0;

  return (
    <>
      <div className="flex h-full">
        {/* Filter Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 border-r border-cos-border bg-cos-surface p-4 overflow-y-auto">
          {/* Ossy integration hint */}
          <div
            className="mb-5 flex items-center gap-2 rounded-cos-lg border border-cos-electric/15 bg-cos-electric/5 px-3 py-2.5 cursor-pointer hover:bg-cos-electric/10 transition-colors"
            onClick={() => injectIntoChat("Help me refine my search")}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-cos-electric" />
            <p className="text-[10px] leading-tight text-cos-electric">
              Chat with Ossy to search &amp; refine. Filters update automatically.
            </p>
          </div>

          <DiscoverFilterSidebar
            filters={parsedFilters}
            onFiltersChange={handleFiltersChange}
          />
        </aside>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
            {/* Active filter chips + clear */}
            {hasSearched && (
              <div className="flex items-start justify-between gap-3 mb-1">
                <ActiveFilterChips
                  parsedFilters={parsedFilters}
                  onRemoveFilter={handleRemoveFilter}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-cos-slate hover:text-cos-midnight h-6 text-[10px]"
                  onClick={() => clear()}
                >
                  <X className="mr-0.5 h-3 w-3" />
                  Clear
                </Button>
              </div>
            )}

            {/* Results header */}
            {hasResults && (
              <div className="mb-3">
                <p className="text-xs text-cos-slate">
                  {results.length} result{results.length === 1 ? "" : "s"}
                  {searchQuery ? ` for \u201C${searchQuery}\u201D` : ""}
                  {stats ? ` \u00B7 ${(stats.totalDurationMs / 1000).toFixed(1)}s` : ""}
                </p>
              </div>
            )}

            {/* Results, Error, No Results, or Idle */}
            <div>
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
                  searchQuery=""
                  stats={null}
                  onViewProfile={handleViewProfile}
                />
              ) : hasSearched && !searching ? (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-8 text-center">
                  <p className="text-sm font-medium text-cos-midnight">No matches found</p>
                  <p className="mt-1 text-xs text-cos-slate">
                    Try telling Ossy more about what you need, or adjust the filters.
                  </p>
                  <button
                    onClick={() => injectIntoChat("Can you help me broaden my search?")}
                    className="mt-3 text-xs text-cos-electric underline hover:text-cos-electric/80"
                  >
                    Ask Ossy for help
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

// ─── Helpers ─────────────────────────────────────────────────

function diffFilters(
  prev: DiscoverFilters,
  next: DiscoverFilters
): Partial<DiscoverFilters> | null {
  const diff: Partial<DiscoverFilters> = {};
  let hasDiff = false;

  for (const key of ["skills", "industries", "markets", "categories"] as const) {
    const prevArr = prev[key] ?? [];
    const nextArr = next[key] ?? [];
    const added = nextArr.filter((v) => !prevArr.includes(v));
    const removed = prevArr.filter((v) => !nextArr.includes(v));
    if (added.length > 0 || removed.length > 0) {
      diff[key] = nextArr;
      hasDiff = true;
    }
  }

  if ((prev.sizeBand ?? "") !== (next.sizeBand ?? "")) {
    diff.sizeBand = next.sizeBand;
    hasDiff = true;
  }
  if ((prev.entityType ?? "") !== (next.entityType ?? "")) {
    diff.entityType = next.entityType;
    hasDiff = true;
  }

  return hasDiff ? diff : null;
}

function describeFilterChange(diff: Partial<DiscoverFilters>): string | null {
  const parts: string[] = [];

  if (diff.skills?.length) parts.push(`skills: ${diff.skills.join(", ")}`);
  if (diff.industries?.length) parts.push(`industries: ${diff.industries.join(", ")}`);
  if (diff.markets?.length) parts.push(`markets: ${diff.markets.join(", ")}`);
  if (diff.categories?.length) parts.push(`categories: ${diff.categories.join(", ")}`);
  if (diff.sizeBand) parts.push(`size: ${diff.sizeBand}`);
  if (diff.entityType) parts.push(`type: ${diff.entityType}`);

  if (parts.length === 0) return null;
  return `I updated the filters: ${parts.join(", ")}. Can you refine the search with these?`;
}
