"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Building2,
  Loader2,
  Globe,
  MapPin,
  Users,
  Tag,
  Database,
} from "lucide-react";
import type { DirectoryFirm } from "@/components/admin/types";

type SourceFilter = "all" | "platform" | "graph";

const SOURCE_OPTIONS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "platform", label: "Platform" },
  { key: "graph", label: "Knowledge Graph" },
];

export default function ServiceProvidersTab() {
  const [firms, setFirms] = useState<DirectoryFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const fetchFirms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (searchSubmitted) params.set("q", searchSubmitted);
      if (source !== "all") params.set("source", source);

      const res = await fetch(`/api/admin/firms?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFirms(data.firms ?? []);
        setTotal(data.total ?? data.totalGraph ?? data.firms?.length ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch firms:", err);
    } finally {
      setLoading(false);
    }
  }, [searchSubmitted, source, page]);

  useEffect(() => {
    fetchFirms();
  }, [fetchFirms]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchSubmitted(search);
    setPage(1);
  }

  function handleSourceChange(s: SourceFilter) {
    setSource(s);
    setPage(1);
    setExpandedId(null);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Source filter buttons */}
      <div className="flex gap-2">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => handleSourceChange(opt.key)}
            className={`flex items-center gap-2 rounded-cos-lg px-4 py-2 text-sm font-medium transition-all ${
              source === opt.key
                ? "bg-cos-electric text-white shadow-sm"
                : "bg-cos-surface text-cos-slate border border-cos-border hover:border-cos-electric/30 hover:text-cos-electric"
            }`}
          >
            {opt.key === "graph" && <Database className="h-3.5 w-3.5" />}
            {opt.key === "platform" && <Building2 className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search firms by name or website..."
          className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
        {searchSubmitted && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSubmitted("");
              setPage(1);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
          >
            {total} result{total !== 1 ? "s" : ""} &times;
          </button>
        )}
      </form>

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
                : "No firms found"}
            </span>
            {totalPages > 1 && (
              <span>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {/* Firm cards */}
          <div className="space-y-2">
            {firms.map((firm) => {
              const isExpanded = expandedId === firm.id;
              const initial = firm.name?.charAt(0)?.toUpperCase() || "?";

              return (
                <div
                  key={firm.id}
                  className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden transition-all hover:border-cos-electric/20"
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : firm.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
                  >
                    {/* Letter avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-sm font-semibold text-cos-electric">
                      {initial}
                    </div>

                    {/* Name & description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-cos-midnight truncate">
                          {firm.name}
                        </span>
                        {firm.firmType && (
                          <span className="inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold bg-cos-electric/10 text-cos-electric">
                            {firm.firmType}
                          </span>
                        )}
                        {firm.source && (
                          <span
                            className={`inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${
                              firm.source === "platform"
                                ? "bg-cos-signal/10 text-cos-signal"
                                : firm.source === "neo4j"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-cos-slate/10 text-cos-slate"
                            }`}
                          >
                            {firm.source === "platform"
                              ? "Platform"
                              : firm.source === "neo4j"
                                ? "Graph"
                                : "Imported"}
                          </span>
                        )}
                      </div>
                      {firm.description && (
                        <p className="mt-0.5 text-xs text-cos-slate truncate max-w-[400px]">
                          {firm.description}
                        </p>
                      )}
                    </div>

                    {/* Chips */}
                    <div className="hidden md:flex items-center gap-3 shrink-0">
                      {firm.industry && (
                        <span className="flex items-center gap-1 text-xs text-cos-slate">
                          <Tag className="h-3 w-3" />
                          {firm.industry}
                        </span>
                      )}
                      {firm.markets && firm.markets.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-cos-slate">
                          <MapPin className="h-3 w-3" />
                          {firm.markets.length}
                        </span>
                      )}
                      {(firm.expertCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-cos-electric">
                          <Users className="h-3 w-3" />
                          {firm.expertCount}
                        </span>
                      )}
                    </div>

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
                        {/* Left column */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Details
                          </h4>
                          {firm.description && (
                            <p className="text-sm text-cos-midnight leading-relaxed">
                              {firm.description}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {firm.website && (
                              <div className="flex items-center gap-1.5 text-cos-slate">
                                <Globe className="h-3 w-3" />
                                <a
                                  href={
                                    firm.website.startsWith("http")
                                      ? firm.website
                                      : `https://${firm.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-cos-electric hover:underline"
                                >
                                  {firm.website}
                                </a>
                              </div>
                            )}
                            {firm.foundedYear && (
                              <div className="text-cos-slate">
                                <span className="font-medium">Founded:</span> {firm.foundedYear}
                              </div>
                            )}
                            {firm.employeeCount && (
                              <div className="text-cos-slate">
                                <span className="font-medium">Employees:</span>{" "}
                                {firm.employeeCount.toLocaleString()}
                              </div>
                            )}
                            {firm.sizeBand && (
                              <div className="text-cos-slate">
                                <span className="font-medium">Size:</span> {firm.sizeBand}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right column */}
                        <div className="space-y-3">
                          {firm.categories.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Categories
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {firm.categories.map((cat) => (
                                  <span
                                    key={cat}
                                    className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric"
                                  >
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                          {firm.industries.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Industries
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {firm.industries.map((ind) => (
                                  <span
                                    key={ind}
                                    className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                                  >
                                    {ind}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                          {firm.markets.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Markets
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {firm.markets.map((mkt) => (
                                  <span
                                    key={mkt}
                                    className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal"
                                  >
                                    {mkt}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Counts
                          </h4>
                          <div className="flex items-center gap-4 text-xs text-cos-slate">
                            {(firm.expertCount ?? 0) > 0 && (
                              <span>
                                <span className="font-medium text-cos-electric">
                                  {firm.expertCount}
                                </span>{" "}
                                expert{firm.expertCount !== 1 ? "s" : ""}
                              </span>
                            )}
                            {(firm.clientCount ?? 0) > 0 && (
                              <span>
                                <span className="font-medium text-cos-warm">
                                  {firm.clientCount}
                                </span>{" "}
                                client{firm.clientCount !== 1 ? "s" : ""}
                              </span>
                            )}
                            {(firm.caseStudyCount ?? 0) > 0 && (
                              <span>
                                <span className="font-medium text-cos-signal">
                                  {firm.caseStudyCount}
                                </span>{" "}
                                case stud{firm.caseStudyCount !== 1 ? "ies" : "y"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {firms.length === 0 && (
              <div className="rounded-cos-xl border border-dashed border-cos-border py-16 text-center">
                <Database className="mx-auto h-10 w-10 text-cos-slate-light mb-3" />
                <p className="text-sm font-medium text-cos-midnight">No firms found</p>
                <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
                  {searchSubmitted
                    ? "Try a different search query."
                    : "No service provider firms have been imported yet."}
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
