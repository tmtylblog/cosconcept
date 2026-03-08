"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Loader2,
  Globe,
  CheckCircle2,
  Puzzle,
} from "lucide-react";
import type { SolutionPartner } from "@/components/admin/types";
import { SOLUTION_PARTNER_CATEGORIES } from "@/components/admin/constants";

export default function SolutionPartnersTab() {
  const [partners, setPartners] = useState<SolutionPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (searchSubmitted) params.set("q", searchSubmitted);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/admin/knowledge-graph/solution-partners?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPartners(data.partners ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch solution partners:", err);
    } finally {
      setLoading(false);
    }
  }, [searchSubmitted, categoryFilter, page]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchSubmitted(search);
    setPage(1);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCategoryFilter(e.target.value);
    setPage(1);
    setExpandedId(null);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Search + category filter */}
      <div className="flex gap-2">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search solution partners by name or domain..."
            className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </form>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={handleCategoryChange}
          className="rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 text-sm text-cos-midnight transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        >
          <option value="all">All categories</option>
          {Object.entries(SOLUTION_PARTNER_CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {(searchSubmitted || categoryFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSubmitted("");
              setCategoryFilter("all");
              setPage(1);
            }}
            className="rounded-cos-xl border border-cos-border px-4 py-3 text-sm text-cos-slate transition-colors hover:bg-cos-cloud"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between text-xs text-cos-slate">
            <span>
              {total > 0
                ? `Showing ${((page - 1) * limit + 1).toLocaleString()}–${Math.min(
                    page * limit,
                    total
                  ).toLocaleString()} of ${total.toLocaleString()}`
                : "No solution partners found"}
              {searchSubmitted && (
                <span className="ml-1.5 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-cos-electric">
                  &quot;{searchSubmitted}&quot;
                </span>
              )}
            </span>
            {totalPages > 1 && (
              <span>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {/* Partner cards */}
          <div className="space-y-2">
            {partners.map((partner) => {
              const isExpanded = expandedId === partner.id;
              const initial = partner.name?.charAt(0)?.toUpperCase() || "?";
              const categoryLabel =
                SOLUTION_PARTNER_CATEGORIES[partner.category ?? ""] ?? partner.category ?? "Other";

              return (
                <div
                  key={partner.id}
                  className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden transition-all hover:border-cos-electric/20"
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : partner.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
                  >
                    {/* Letter avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-sm font-semibold text-cos-signal">
                      {initial}
                    </div>

                    {/* Name & domain */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-cos-midnight truncate">
                          {partner.name}
                        </span>
                        {partner.isVerified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-cos-signal shrink-0" />
                        )}
                        {partner.category && (
                          <span className="inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold bg-cos-electric/10 text-cos-electric">
                            {categoryLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-cos-slate">
                        <Globe className="h-3 w-3" />
                        <span className="font-mono">{partner.domain}</span>
                      </div>
                    </div>

                    {/* Date */}
                    <span className="hidden md:block text-xs text-cos-slate-light shrink-0">
                      {new Date(partner.createdAt).toLocaleDateString()}
                    </span>

                    {/* Chevron */}
                    <div className="shrink-0 text-cos-slate">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-cos-border px-5 py-4 bg-cos-cloud/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: description */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Description
                          </h4>
                          {partner.description ? (
                            <p className="text-sm text-cos-midnight leading-relaxed">
                              {partner.description}
                            </p>
                          ) : (
                            <p className="text-sm text-cos-slate-light italic">
                              No description available.
                            </p>
                          )}

                          {partner.websiteUrl && (
                            <a
                              href={partner.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-cos-md bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                            >
                              <Globe className="h-3 w-3" />
                              Visit Website
                            </a>
                          )}
                        </div>

                        {/* Right: metadata */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Details
                          </h4>
                          <div className="space-y-1 text-xs text-cos-slate">
                            <p>
                              <span className="font-medium">Domain:</span>{" "}
                              <span className="font-mono">{partner.domain}</span>
                            </p>
                            <p>
                              <span className="font-medium">Category:</span> {categoryLabel}
                            </p>
                            <p>
                              <span className="font-medium">Verified:</span>{" "}
                              {partner.isVerified ? "Yes" : "No"}
                            </p>
                            <p>
                              <span className="font-medium">Added:</span>{" "}
                              {new Date(partner.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {partners.length === 0 && (
              <div className="rounded-cos-xl border border-dashed border-cos-border py-16 text-center">
                <Puzzle className="mx-auto h-10 w-10 text-cos-slate-light mb-3" />
                <p className="text-sm font-medium text-cos-midnight">
                  No solution partners found
                </p>
                <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
                  {searchSubmitted || categoryFilter !== "all"
                    ? "Try adjusting your search or category filter."
                    : "Solution partners are populated from the knowledge graph."}
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-cos-slate">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
