"use client";

import {
  Building2,
  Globe,
  ExternalLink,
  Linkedin,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpertDetailData } from "@/hooks/use-discover-stream";

// ─── Props ────────────────────────────────────────────────

interface ExpertDetailBlockProps {
  displayName: string;
  data: ExpertDetailData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────

export function ExpertDetailBlock({
  displayName,
  data,
  loading,
  error,
  searchQuery,
  onClose,
}: ExpertDetailBlockProps) {
  if (loading) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white p-6 shadow-sm">
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cos-warm/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-cos-cloud" />
              <div className="h-3 w-28 rounded bg-cos-cloud" />
            </div>
          </div>
          <div className="h-16 rounded-cos-xl bg-cos-cloud/60" />
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

  // Compute search relevance from skill overlap
  const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cos-warm/10">
          <User className="h-5 w-5 text-cos-warm" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-cos-midnight truncate">
            {data.displayName}
          </h3>
          {data.firmName && (
            <p className="text-xs text-cos-slate truncate">at {data.firmName}</p>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="shrink-0 text-cos-slate hover:text-cos-midnight p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4 max-h-[450px] overflow-y-auto cos-scrollbar">
        {/* Relevance note */}
        {(matchingSkills.length > 0 || matchingIndustries.length > 0) && (
          <div className="rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
            <p className="text-xs font-medium text-cos-signal">
              Relevant to your search
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {matchingSkills.map((s) => (
                <span key={s} className="rounded-cos-full bg-cos-signal/10 px-2 py-0.5 text-[10px] text-cos-signal">
                  {s}
                </span>
              ))}
              {matchingIndustries.map((ind) => (
                <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-[10px] text-cos-warm">
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Firm affiliation */}
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

        {/* Links */}
        <div className="flex flex-wrap gap-2">
          {data.linkedinUrl && (
            <a
              href={data.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-electric hover:text-cos-electric transition-colors"
            >
              <Linkedin className="h-3 w-3" />
              LinkedIn
            </a>
          )}
          {data.languages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate">
              <Globe className="h-3 w-3" />
              {data.languages.join(", ")}
            </span>
          )}
        </div>

        {/* Specialist Profiles */}
        {data.specialistProfiles.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Specialist Profiles
            </p>
            <div className="space-y-2">
              {data.specialistProfiles.map((sp, i) => (
                <div key={i} className="rounded-cos-xl border border-cos-border p-3">
                  {sp.title && (
                    <p className="text-sm font-medium text-cos-midnight">{sp.title}</p>
                  )}
                  {sp.description && (
                    <p className="mt-1 text-xs text-cos-slate leading-relaxed line-clamp-3">
                      {sp.description}
                    </p>
                  )}
                  {sp.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sp.skills.map((s) => (
                        <span key={s} className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-[10px] text-cos-electric">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <span key={s} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">
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
                <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-xs text-cos-warm">
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Case Studies */}
        {data.caseStudies.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Case Studies ({data.caseStudies.length})
            </p>
            <div className="space-y-2">
              {data.caseStudies.map((cs, i) => (
                <div key={cs.legacyId ?? i} className="rounded-cos-xl border border-cos-border p-3">
                  {cs.firmName && (
                    <p className="mb-1 text-[11px] text-cos-slate">by {cs.firmName}</p>
                  )}
                  {cs.summary ? (
                    <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-3">
                      {cs.summary}
                    </p>
                  ) : (
                    <p className="text-xs italic text-cos-slate">No summary</p>
                  )}
                  {(cs.skills.length > 0 || cs.industries.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {cs.skills.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-cos-full bg-cos-cloud px-1.5 py-0.5 text-[10px] text-cos-slate">
                          {s}
                        </span>
                      ))}
                      {cs.industries.slice(0, 2).map((ind) => (
                        <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-1.5 py-0.5 text-[10px] text-cos-warm">
                          {ind}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
