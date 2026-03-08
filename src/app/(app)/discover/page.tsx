"use client";

import { useState, useCallback } from "react";
import { Search, Filter, Sparkles, Building2, ArrowRight, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { useActiveOrganization } from "@/lib/auth-client";

interface MatchCandidate {
  firmId: string;
  firmName: string;
  totalScore: number;
  structuredScore: number;
  vectorScore: number;
  llmScore?: number;
  matchExplanation?: string;
  bidirectionalFit?: { theyWantUs: number; weWantThem: number };
  preview: {
    categories: string[];
    topServices: string[];
    topSkills: string[];
    industries: string[];
    website?: string;
  };
}

interface SearchStats {
  layer1Candidates: number;
  layer2Candidates: number;
  layer3Ranked: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
}

export default function DiscoverPage() {
  const { canUse } = usePlan();
  const canSearch = canUse("canSearchNetwork");
  const { data: activeOrg } = useActiveOrganization();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MatchCandidate[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [requestingPartnership, setRequestingPartnership] = useState<string | null>(null);
  const [partnershipRequested, setPartnershipRequested] = useState<Set<string>>(new Set());

  const handleRequestPartnership = useCallback(
    async (targetFirmId: string) => {
      if (!activeOrg?.id) return;
      const firmId = `firm_${activeOrg.id}`;
      setRequestingPartnership(targetFirmId);

      try {
        const res = await fetch("/api/partnerships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmId, targetFirmId }),
        });

        if (res.ok || res.status === 409) {
          setPartnershipRequested((prev) => new Set(prev).add(targetFirmId));
        }
      } catch {
        /* ignore */
      } finally {
        setRequestingPartnership(null);
      }
    },
    [activeOrg?.id]
  );

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.candidates ?? []);
        setStats(data.stats ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [query]);

  if (!canSearch) {
    return (
      <div className="p-6">
        <UpgradePrompt
          feature="Network Search"
          description="Search the entire Collective OS network to find firms that match your ideal partner profile."
          requiredPlan="pro"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Discover Partners
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Search the network for firms that complement your services.
        </p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
        className="flex items-center gap-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud px-4 py-2.5 focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
          <Search className="h-4 w-4 text-cos-slate" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try: &quot;Shopify agency in APAC&quot; or &quot;B2B SaaS marketing partner&quot;"
            className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setHasSearched(false);
              }}
              className="text-cos-slate-light hover:text-cos-midnight"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          Filters
          <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </Button>
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? "Searching..." : "Search"}
        </Button>
      </form>

      {/* Filters panel (collapsible) */}
      {showFilters && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
          <p className="text-xs text-cos-slate">
            Filter controls coming soon. For now, use natural language in the
            search bar — Ossy understands skills, industries, locations, and firm
            types.
          </p>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 text-xs text-cos-slate">
          <span>{stats.layer3Ranked} results</span>
          <span>from {stats.layer1Candidates} candidates</span>
          <span>{stats.totalDurationMs}ms</span>
          <span>~${stats.estimatedCostUsd.toFixed(4)} cost</span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-3">
          {results.map((match) => (
            <MatchCard
              key={match.firmId}
              match={match}
              onRequestPartnership={handleRequestPartnership}
              requesting={requestingPartnership === match.firmId}
              requested={partnershipRequested.has(match.firmId)}
            />
          ))}
        </div>
      ) : hasSearched && !searching ? (
        <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-12 text-center">
          <Search className="h-8 w-8 text-cos-slate-light" />
          <h3 className="mt-3 font-heading text-sm font-semibold text-cos-midnight">
            No matches found
          </h3>
          <p className="mt-1 max-w-xs text-xs text-cos-slate">
            Try broadening your search. Use different skills, industries, or
            remove geographic constraints.
          </p>
        </div>
      ) : !hasSearched ? (
        <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Sparkles className="h-6 w-6 text-cos-electric" />
          </div>
          <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
            Search the Network
          </h3>
          <p className="mt-1 max-w-xs text-xs text-cos-slate">
            Describe what you need in natural language. Ossy will find firms that
            complement your capabilities using AI-powered matching.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              "Shopify agency in APAC",
              "B2B SaaS marketing partner",
              "Fractional CFO for startups",
              "UX design for healthcare",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuery(suggestion);
                }}
                className="rounded-cos-lg border border-cos-border bg-cos-cloud px-3 py-1.5 text-xs text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Match Card ──────────────────────────────────────────

function MatchCard({
  match,
  onRequestPartnership,
  requesting,
  requested,
}: {
  match: MatchCandidate;
  onRequestPartnership: (firmId: string) => void;
  requesting: boolean;
  requested: boolean;
}) {
  const scorePercent = Math.round(match.totalScore * 100);

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:border-cos-electric/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <Building2 className="h-5 w-5 text-cos-electric" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-cos-midnight">
              {match.firmName}
            </h3>
            <p className="mt-0.5 text-xs text-cos-slate">
              {match.preview.categories.slice(0, 2).join(" · ") || "Professional Services"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`inline-flex items-center rounded-cos-full px-2 py-0.5 text-xs font-medium ${
              scorePercent >= 80
                ? "bg-green-100 text-green-700"
                : scorePercent >= 60
                  ? "bg-cos-electric/10 text-cos-electric"
                  : "bg-cos-cloud text-cos-slate"
            }`}
          >
            {scorePercent}% match
          </div>
        </div>
      </div>

      {/* Match explanation */}
      {match.matchExplanation && (
        <p className="mt-3 text-sm text-cos-midnight/80">
          {match.matchExplanation}
        </p>
      )}

      {/* Skills and industries */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.preview.topSkills.slice(0, 5).map((skill) => (
          <span
            key={skill}
            className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate"
          >
            {skill}
          </span>
        ))}
        {match.preview.industries.slice(0, 3).map((industry) => (
          <span
            key={industry}
            className="rounded-cos-full bg-cos-accent-warm/10 px-2 py-0.5 text-xs text-cos-accent-warm"
          >
            {industry}
          </span>
        ))}
      </div>

      {/* Bidirectional fit */}
      {match.bidirectionalFit && (
        <div className="mt-3 flex items-center gap-4 text-xs text-cos-slate">
          <span>
            They want you: {Math.round(match.bidirectionalFit.theyWantUs * 100)}%
          </span>
          <span>
            You want them: {Math.round(match.bidirectionalFit.weWantThem * 100)}%
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" size="sm">
          View Profile
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={requested ? "text-cos-signal" : "text-cos-slate"}
          disabled={requesting || requested}
          onClick={() => onRequestPartnership(match.firmId)}
        >
          {requested
            ? "Requested ✓"
            : requesting
              ? "Requesting..."
              : "Request Partnership"}
        </Button>
      </div>
    </div>
  );
}
