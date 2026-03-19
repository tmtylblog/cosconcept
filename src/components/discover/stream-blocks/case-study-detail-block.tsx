"use client";

import {
  BookOpen,
  Building2,
  Globe,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaseStudyDetailData } from "@/hooks/use-discover-stream";

// ─── Props ────────────────────────────────────────────────

interface CaseStudyDetailBlockProps {
  displayName: string;
  data: CaseStudyDetailData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onViewExpert?: (legacyId: string, displayName: string) => void;
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────

function getQueryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// ─── Component ────────────────────────────────────────────

export function CaseStudyDetailBlock({
  displayName,
  data,
  loading,
  error,
  searchQuery,
  onViewExpert,
  onClose,
}: CaseStudyDetailBlockProps) {
  if (loading) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white p-6 shadow-sm">
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cos-signal/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-cos-cloud" />
              <div className="h-3 w-32 rounded bg-cos-cloud" />
            </div>
          </div>
          <div className="h-20 rounded-cos-xl bg-cos-cloud/60" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-cos-cloud" />
            <div className="h-6 w-20 rounded-full bg-cos-cloud" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-ember/20 bg-cos-ember/5 p-6 text-center">
        <p className="text-sm text-cos-ember">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const queryTerms = getQueryTerms(searchQuery);

  const matchingSkills = data.skills.filter((s) =>
    queryTerms.some((t) => s.toLowerCase().includes(t))
  );
  const matchingIndustries = data.industries.filter((ind) =>
    queryTerms.some((t) => ind.toLowerCase().includes(t))
  );

  return (
    <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-cos-border/50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cos-signal/10">
          <BookOpen className="h-5 w-5 text-cos-signal" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-cos-midnight truncate">
            {data.title && data.title !== "Manual Input" ? data.title : (data.clientName ? `Project for ${data.clientName}` : displayName)}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {data.clientName && (
              <span className="inline-flex items-center rounded-cos-full border border-cos-electric/20 bg-cos-electric/5 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
                for {data.clientName}
              </span>
            )}
            {data.sourceUrl && !data.sourceUrl.startsWith("manual:") && !data.sourceUrl.startsWith("uploaded:") && (
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-cos-slate hover:text-cos-electric transition-colors"
              >
                <Globe className="h-3 w-3" />
                Source
              </a>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="shrink-0 text-cos-slate hover:text-cos-midnight p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4 max-h-[450px] overflow-y-auto cos-scrollbar">
        {/* Summary */}
        {data.summary && (
          <p className="text-xs text-cos-midnight/80 leading-relaxed">
            {data.summary}
          </p>
        )}

        {/* No summary fallback */}
        {!data.summary && (
          <p className="text-xs italic text-cos-slate">No summary available for this case study.</p>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Skills Demonstrated
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <span key={s} className={cn(
                  "rounded-cos-full px-2 py-0.5 text-xs",
                  queryTerms.some((t) => s.toLowerCase().includes(t))
                    ? "bg-cos-signal/10 text-cos-signal"
                    : "bg-cos-cloud text-cos-slate"
                )}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Industries */}
        {data.industries.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Industries
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.industries.map((ind) => (
                <span key={ind} className={cn(
                  "rounded-cos-full px-2 py-0.5 text-xs",
                  queryTerms.some((t) => ind.toLowerCase().includes(t))
                    ? "bg-cos-signal/10 text-cos-signal"
                    : "bg-cos-warm/10 text-cos-warm"
                )}>
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Relevance note */}
        {(matchingSkills.length > 0 || matchingIndustries.length > 0) && (
          <div className="rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
            <p className="text-xs text-cos-midnight/80 leading-relaxed">
              {matchingSkills.length > 0 && (
                <>Demonstrates <strong>{matchingSkills.slice(0, 4).join(", ")}</strong> relevant to your search. </>
              )}
              {matchingIndustries.length > 0 && (
                <>Covers the <strong>{matchingIndustries.slice(0, 3).join(", ")}</strong> {matchingIndustries.length === 1 ? "sector" : "sectors"}.</>
              )}
            </p>
          </div>
        )}

        {/* Source Firm */}
        {data.firmName && (
          <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud px-4 py-3">
            <Building2 className="h-4 w-4 shrink-0 text-cos-electric" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-cos-midnight">{data.firmName}</p>
              {data.firmWebsite && (
                <a
                  href={data.firmWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-cos-slate hover:text-cos-electric"
                >
                  {(() => { try { return new URL(data.firmWebsite).hostname; } catch { return data.firmWebsite; } })()}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Contributors */}
        {data.contributors.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              <Users className="inline h-3 w-3 mr-1" />
              Contributors ({data.contributors.length})
            </p>
            <div className="space-y-1.5">
              {data.contributors.map((c) => (
                <button
                  key={c.legacyId}
                  onClick={() => onViewExpert?.(c.legacyId, c.displayName)}
                  className="flex w-full items-center gap-2 rounded-cos-xl border border-cos-border px-3 py-2 text-left hover:border-cos-warm/40 hover:bg-cos-warm/5 transition-colors"
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-cos-warm" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-cos-midnight truncate">{c.displayName}</p>
                    {c.title && (
                      <p className="text-[10px] text-cos-slate truncate">{c.title}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
