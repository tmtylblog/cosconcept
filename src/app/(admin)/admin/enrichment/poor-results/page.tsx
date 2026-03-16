"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PoorResult {
  id: string;
  sourceUrl: string;
  sourceType: string;
  title: string | null;
  summary: string | null;
  cosAnalysis: unknown;
  autoTags: {
    skills: string[];
    industries: string[];
    services: string[];
    markets: string[];
    languages: string[];
    clientName: string | null;
  } | null;
  statusMessage: string | null;
  firmName: string | null;
  firmId: string;
  markedAt: string;
  createdAt: string;
}

interface ApiResponse {
  results: PoorResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function PoorResultsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (p: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/case-studies/poor-results?page=${p}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      setError("Failed to load poor case study results");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-cos-ember" />
          <h1 className="font-heading text-lg font-semibold text-cos-midnight">
            Poor Case Study Results
          </h1>
        </div>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Case studies marked as &quot;Not a case study&quot; by customers. Review these to improve extraction quality.
        </p>
      </div>

      {/* Stats */}
      {data && !isLoading && (
        <div className="flex items-center gap-4 rounded-cos-lg border border-cos-border/50 bg-cos-surface-raised px-4 py-2.5">
          <p className="text-xs text-cos-slate-dim">
            <span className="font-semibold text-cos-midnight">{data.total}</span> total marked
          </p>
          <p className="text-xs text-cos-slate-dim">
            Page {data.page} of {data.totalPages}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-cos-lg border border-cos-ember/20 bg-cos-ember/5 px-4 py-3 text-sm text-cos-ember">
          {error}
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <div className="space-y-3">
          {data.results.length === 0 && (
            <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
              <Ban className="mx-auto h-8 w-8 text-cos-slate-light" />
              <p className="mt-3 text-sm font-medium text-cos-slate">No poor results yet</p>
              <p className="mt-1 text-xs text-cos-slate-dim">
                When customers mark case studies as &quot;Not a case study&quot;, they will appear here.
              </p>
            </div>
          )}

          {data.results.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const displayUrl = item.sourceUrl
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "")
              .replace(/\/$/, "");

            return (
              <div
                key={item.id}
                className="rounded-cos-xl border border-cos-border/60 bg-cos-surface-raised"
              >
                <div className="flex items-start gap-3 p-4">
                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-cos-slate-dim transition-colors hover:text-cos-midnight"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-cos-midnight">
                          {item.title || displayUrl}
                        </p>
                        {item.firmName && (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-slate-dim">
                            <Building2 className="h-3 w-3" />
                            {item.firmName}
                          </div>
                        )}
                      </div>
                      <p className="shrink-0 text-[10px] text-cos-slate-light">
                        {new Date(item.markedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Tags */}
                    {item.autoTags && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.autoTags.clientName && (
                          <span className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
                            {item.autoTags.clientName}
                          </span>
                        )}
                        {item.autoTags.skills?.slice(0, 3).map((s) => (
                          <span key={s} className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] text-cos-electric">
                            {s}
                          </span>
                        ))}
                        {item.autoTags.industries?.slice(0, 2).map((i) => (
                          <span key={i} className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] text-cos-signal">
                            {i}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Source URL */}
                    {!item.sourceUrl.startsWith("manual:") && !item.sourceUrl.startsWith("uploaded:") && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-cos-electric transition-colors hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span className="max-w-[400px] truncate">{displayUrl}</span>
                      </a>
                    )}

                    {item.statusMessage && (
                      <p className="mt-1 text-[10px] text-cos-slate-dim">
                        Status: {item.statusMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Expanded: cosAnalysis */}
                {isExpanded && (
                  <div className="border-t border-cos-border/30 px-4 py-3">
                    {item.summary && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold uppercase text-cos-slate-dim">Summary</p>
                        <p className="mt-0.5 text-xs text-cos-slate">{item.summary}</p>
                      </div>
                    )}
                    {item.cosAnalysis ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-cos-slate-dim">COS Analysis</p>
                        <pre className="mt-1 max-h-60 overflow-auto rounded-cos-md bg-cos-midnight/5 p-2 text-[10px] text-cos-midnight">
                          {JSON.stringify(item.cosAnalysis, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-[10px] text-cos-slate-light">No COS analysis data available</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-cos-border/30 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Previous
          </Button>
          <span className="text-xs text-cos-slate-dim">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
          >
            Next
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
