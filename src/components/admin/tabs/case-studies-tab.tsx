"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  FileText,
  Loader2,
  Building2,
} from "lucide-react";
import type { CaseStudyRecord } from "@/components/admin/types";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  published: { bg: "bg-cos-signal/10", text: "text-cos-signal" },
  draft: { bg: "bg-cos-warm/10", text: "text-cos-warm" },
  pending: { bg: "bg-cos-slate/10", text: "text-cos-slate" },
  rejected: { bg: "bg-cos-ember/10", text: "text-cos-ember" },
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z]+;/g, " ").trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

export default function CaseStudiesTab() {
  const [caseStudies, setCaseStudies] = useState<CaseStudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const fetchCaseStudies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (searchSubmitted) params.set("q", searchSubmitted);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/knowledge-graph/case-studies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCaseStudies(data.caseStudies ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch case studies:", err);
    } finally {
      setLoading(false);
    }
  }, [searchSubmitted, statusFilter, page]);

  useEffect(() => {
    fetchCaseStudies();
  }, [fetchCaseStudies]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchSubmitted(search);
    setPage(1);
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value);
    setPage(1);
    setExpandedId(null);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Search + filters */}
      <div className="flex gap-2">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case studies by content, firm, industry, or skill..."
            className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </form>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={handleStatusChange}
          className="rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 text-sm text-cos-midnight transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        {(searchSubmitted || statusFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSubmitted("");
              setStatusFilter("all");
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
                : "No case studies found"}
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

          {/* Case study cards */}
          <div className="space-y-2">
            {caseStudies.map((cs) => {
              const isExpanded = expandedId === cs.id;
              const contentPreview = cs.content ? truncate(stripHtml(cs.content), 200) : null;
              const statusColor = STATUS_COLORS[cs.status] ?? STATUS_COLORS.pending;

              return (
                <div
                  key={cs.id}
                  className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden transition-all hover:border-cos-electric/20"
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : cs.id)}
                    className="w-full flex items-start gap-4 px-5 py-3.5 text-left"
                  >
                    {/* Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-warm/20 to-cos-ember/10 text-cos-warm mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Author org */}
                        {cs.authorOrgName && (
                          <span className="flex items-center gap-1 text-xs font-medium text-cos-electric">
                            <Building2 className="h-3 w-3" />
                            {cs.authorOrgName}
                          </span>
                        )}
                        {/* Status */}
                        <span
                          className={`inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${statusColor.bg} ${statusColor.text}`}
                        >
                          {cs.status}
                        </span>
                      </div>

                      {/* Content preview */}
                      {contentPreview && (
                        <p className="mt-1 text-sm text-cos-slate leading-relaxed line-clamp-2">
                          {contentPreview}
                        </p>
                      )}

                      {/* Tags row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Client companies */}
                        {cs.clientCompanies &&
                          cs.clientCompanies.slice(0, 3).map((cc) => (
                            <span
                              key={cc.id}
                              className="rounded-cos-pill bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                            >
                              {cc.name}
                            </span>
                          ))}
                        {cs.clientCompanies && cs.clientCompanies.length > 3 && (
                          <span className="text-[10px] text-cos-slate">
                            +{cs.clientCompanies.length - 3} more
                          </span>
                        )}

                        {/* Industries */}
                        {cs.industries &&
                          cs.industries.slice(0, 2).map((ind) => (
                            <span
                              key={ind.id}
                              className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                            >
                              {ind.name}
                            </span>
                          ))}

                        {/* Skills (first 2) */}
                        {cs.skills &&
                          cs.skills.slice(0, 2).map((sk) => (
                            <span
                              key={sk.id}
                              className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal"
                            >
                              {sk.name}
                            </span>
                          ))}
                      </div>
                    </div>

                    {/* Date + chevron */}
                    <div className="shrink-0 flex items-center gap-3">
                      <span className="hidden md:block text-xs text-cos-slate-light">
                        {new Date(cs.createdAt).toLocaleDateString()}
                      </span>
                      <div className="text-cos-slate">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-cos-border px-5 py-4 bg-cos-cloud/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: full content */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Full Content
                          </h4>
                          {cs.content ? (
                            <p className="text-sm text-cos-midnight leading-relaxed whitespace-pre-wrap">
                              {stripHtml(cs.content)}
                            </p>
                          ) : (
                            <p className="text-sm text-cos-slate-light italic">
                              No content available.
                            </p>
                          )}
                        </div>

                        {/* Right: metadata */}
                        <div className="space-y-3">
                          {/* Author */}
                          {cs.authorOrgName && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Author Firm
                              </h4>
                              <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-3 flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-cos-electric" />
                                <span className="text-sm font-medium text-cos-midnight">
                                  {cs.authorOrgName}
                                </span>
                              </div>
                            </>
                          )}

                          {/* Client companies */}
                          {cs.clientCompanies && cs.clientCompanies.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Client Companies
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cs.clientCompanies.map((cc) => (
                                  <span
                                    key={cc.id}
                                    className="rounded-cos-pill bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
                                  >
                                    {cc.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Industries */}
                          {cs.industries && cs.industries.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Industries
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cs.industries.map((ind) => (
                                  <span
                                    key={ind.id}
                                    className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                                  >
                                    {ind.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Skills */}
                          {cs.skills && cs.skills.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Skills
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cs.skills.map((sk) => (
                                  <span
                                    key={sk.id}
                                    className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal"
                                  >
                                    {sk.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Markets */}
                          {cs.markets && cs.markets.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Markets
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cs.markets.map((mkt) => (
                                  <span
                                    key={mkt}
                                    className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric"
                                  >
                                    {mkt}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Experts */}
                          {cs.expertUsers && cs.expertUsers.length > 0 && (
                            <>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                                Experts Involved
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cs.expertUsers.map((eu) => (
                                  <span
                                    key={eu.id}
                                    className="rounded-cos-pill bg-cos-slate/10 px-2 py-0.5 text-[10px] font-medium text-cos-slate"
                                  >
                                    {eu.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Metadata */}
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Metadata
                          </h4>
                          <div className="space-y-1 text-xs text-cos-slate">
                            {cs.sourceId && (
                              <p>
                                <span className="font-medium">Source ID:</span>{" "}
                                <span className="font-mono">{cs.sourceId}</span>
                              </p>
                            )}
                            <p>
                              <span className="font-medium">Status:</span> {cs.status}
                            </p>
                            <p>
                              <span className="font-medium">Created:</span>{" "}
                              {new Date(cs.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {caseStudies.length === 0 && (
              <div className="rounded-cos-xl border border-dashed border-cos-border py-16 text-center">
                <FileText className="mx-auto h-10 w-10 text-cos-slate-light mb-3" />
                <p className="text-sm font-medium text-cos-midnight">No case studies found</p>
                <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
                  {searchSubmitted || statusFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Case studies are populated from the knowledge graph enrichment pipeline."}
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
