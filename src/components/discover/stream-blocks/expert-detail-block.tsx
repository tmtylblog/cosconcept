"use client";

import { useState } from "react";
import {
  Building2,
  Globe,
  Linkedin,
  User,
  X,
  Sparkles,
  ExternalLink,
  Presentation,
  ChevronDown,
  Briefcase,
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

// ─── Helpers ──────────────────────────────────────────────

function getQueryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
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

  const queryTerms = getQueryTerms(searchQuery);

  // Compute search relevance from skill overlap
  const matchingSkills = data.skills.filter((s) =>
    queryTerms.some((t) => s.toLowerCase().includes(t))
  );
  const matchingIndustries = data.industries.filter((ind) =>
    queryTerms.some((t) => ind.toLowerCase().includes(t))
  );

  // Find specialist profiles that match the search
  const matchingProfiles = data.specialistProfiles.filter((sp) => {
    const titleMatch = sp.title && queryTerms.some((t) => sp.title!.toLowerCase().includes(t));
    const skillMatch = sp.skills.some((s) => queryTerms.some((t) => s.toLowerCase().includes(t)));
    return titleMatch || skillMatch;
  });
  const nonMatchingProfiles = data.specialistProfiles.filter((sp) => !matchingProfiles.includes(sp));

  // Sort case studies: relevant first
  const caseStudiesWithRelevance = data.caseStudies.map((cs) => {
    const csMatchingSkills = cs.skills.filter((s) => queryTerms.some((t) => s.toLowerCase().includes(t)));
    const csMatchingIndustries = cs.industries.filter((i) => queryTerms.some((t) => i.toLowerCase().includes(t)));
    return { ...cs, relevanceScore: csMatchingSkills.length + csMatchingIndustries.length, csMatchingSkills, csMatchingIndustries };
  });
  caseStudiesWithRelevance.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const hasAnyRelevance = matchingSkills.length > 0 || matchingIndustries.length > 0 || matchingProfiles.length > 0;

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
        {/* Relevance paragraph */}
        {hasAnyRelevance && (
          <div className="rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
            <p className="text-xs text-cos-midnight/80 leading-relaxed">
              {matchingProfiles.length > 0 ? (
                <>Specialist in <strong>{matchingProfiles.map(sp => sp.title).filter(Boolean).join(", ")}</strong> — directly relevant to your search for &quot;{searchQuery}&quot;.{" "}
                {matchingSkills.length > 0 && <>Brings expertise in {matchingSkills.slice(0, 4).join(", ")}. </>}
                {matchingIndustries.length > 0 && <>Active in the {matchingIndustries.slice(0, 3).join(", ")} {matchingIndustries.length === 1 ? "sector" : "sectors"}.</>}
                </>
              ) : matchingSkills.length > 0 ? (
                <>Brings <strong>{matchingSkills.slice(0, 4).join(", ")}</strong> experience relevant to your search for &quot;{searchQuery}&quot;.{" "}
                {matchingIndustries.length > 0 && <>Works across {matchingIndustries.slice(0, 3).join(", ")}.</>}
                </>
              ) : (
                <>Industry background in <strong>{matchingIndustries.slice(0, 3).join(", ")}</strong> aligns with your search for &quot;{searchQuery}&quot;.</>
              )}
            </p>
          </div>
        )}

        {/* No search match note */}
        {!hasAnyRelevance && searchQuery && (
          <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/50 px-4 py-3">
            <p className="text-[11px] text-cos-slate">
              No specialist profiles directly matching &quot;{searchQuery}&quot;
              {data.industries.length > 0 && (
                <>, but has experience in {data.industries.slice(0, 3).join(", ")}</>
              )}
            </p>
          </div>
        )}

        {/* Professional Summary — bio or AI-generated summary */}
        {(data.bio || data.pdlSummary || data.hiddenSummary) && (
          <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/30 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              About
            </p>
            <p className="text-xs text-cos-midnight/80 leading-relaxed">
              {data.bio || data.pdlSummary || data.hiddenSummary}
            </p>
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

        {/* Matching Specialist Profiles (highlighted) */}
        {matchingProfiles.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-signal">
              <Sparkles className="inline h-3 w-3 mr-1" />
              Matching Specialist Profiles
            </p>
            <div className="space-y-2">
              {matchingProfiles.map((sp, i) => (
                <div key={i} className="rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    {sp.title && (
                      <p className="text-sm font-medium text-cos-midnight">{sp.title}</p>
                    )}
                    {sp.slideUrl && (
                      <a
                        href={sp.slideUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-cos-full border border-cos-electric/30 bg-cos-electric/10 px-2.5 py-1 text-[10px] font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                      >
                        <Presentation className="h-3 w-3" />
                        View Slides
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  {sp.description && (
                    <p className="mt-1 text-xs text-cos-slate leading-relaxed line-clamp-3">
                      {sp.description}
                    </p>
                  )}
                  {sp.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sp.skills.map((s) => (
                        <span key={s} className={cn(
                          "rounded-cos-full px-2 py-0.5 text-[10px]",
                          queryTerms.some((t) => s.toLowerCase().includes(t))
                            ? "bg-cos-signal/10 text-cos-signal"
                            : "bg-cos-electric/10 text-cos-electric"
                        )}>
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

        {/* Other Specialist Profiles */}
        {nonMatchingProfiles.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              {matchingProfiles.length > 0 ? "Other Specialist Profiles" : "Specialist Profiles"}
            </p>
            <div className="space-y-2">
              {nonMatchingProfiles.map((sp, i) => (
                <div key={i} className="rounded-cos-xl border border-cos-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    {sp.title && (
                      <p className="text-sm font-medium text-cos-midnight">{sp.title}</p>
                    )}
                    {sp.slideUrl && (
                      <a
                        href={sp.slideUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-cos-full border border-cos-electric/30 bg-cos-electric/10 px-2.5 py-1 text-[10px] font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                      >
                        <Presentation className="h-3 w-3" />
                        View Slides
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
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

        {/* Work History */}
        <WorkHistorySection workHistory={data.workHistory ?? []} queryTerms={queryTerms} />

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Skills
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

        {/* Case Studies (sorted by relevance) */}
        {caseStudiesWithRelevance.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
              Case Studies ({caseStudiesWithRelevance.length})
            </p>
            <div className="space-y-2">
              {caseStudiesWithRelevance.map((cs, i) => (
                <div key={cs.legacyId ?? i} className={cn(
                  "rounded-cos-xl border p-3",
                  cs.relevanceScore > 0 ? "border-cos-signal/20 bg-cos-signal/5" : "border-cos-border"
                )}>
                  {cs.relevanceScore > 0 && (
                    <p className="mb-1 text-[10px] font-medium text-cos-signal">
                      Relevant: demonstrates {[...cs.csMatchingSkills, ...cs.csMatchingIndustries].join(", ")}
                    </p>
                  )}
                  {cs.clientName && (
                    <p className="text-[11px] font-semibold text-cos-electric mb-0.5">
                      for {cs.clientName}
                    </p>
                  )}
                  {cs.title && cs.title !== "Manual Input" && (
                    <p className="text-[11px] font-medium text-cos-midnight mb-1">
                      {cs.title}
                    </p>
                  )}
                  {(!cs.title || cs.title === "Manual Input") && !cs.clientName && cs.firmName && (
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
                        <span key={s} className={cn(
                          "rounded-cos-full px-1.5 py-0.5 text-[10px]",
                          queryTerms.some((t) => s.toLowerCase().includes(t))
                            ? "bg-cos-signal/10 text-cos-signal"
                            : "bg-cos-cloud text-cos-slate"
                        )}>
                          {s}
                        </span>
                      ))}
                      {cs.industries.slice(0, 2).map((ind) => (
                        <span key={ind} className={cn(
                          "rounded-cos-full px-1.5 py-0.5 text-[10px]",
                          queryTerms.some((t) => ind.toLowerCase().includes(t))
                            ? "bg-cos-signal/10 text-cos-signal"
                            : "bg-cos-warm/10 text-cos-warm"
                        )}>
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

// ─── Work History Section ────────────────────────────────

function WorkHistorySection({
  workHistory,
  queryTerms,
}: {
  workHistory: Array<{ company: string; title: string; industry: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean }>;
  queryTerms: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (workHistory.length === 0) return null;

  const INITIAL_SHOW = 4;
  const visible = expanded ? workHistory : workHistory.slice(0, INITIAL_SHOW);
  const hasMore = workHistory.length > INITIAL_SHOW;

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
        Work History ({workHistory.length} positions)
      </p>
      <div className="space-y-1.5">
        {visible.map((wh, i) => (
          <div key={i} className={cn(
            "rounded-cos-xl border px-3 py-2",
            queryTerms.some(t => wh.title.toLowerCase().includes(t) || wh.company.toLowerCase().includes(t))
              ? "border-cos-signal/20 bg-cos-signal/5"
              : "border-cos-border"
          )}>
            <p className="text-xs font-medium text-cos-midnight">{wh.title}</p>
            <p className="text-[10px] text-cos-slate">
              {wh.company}
              {wh.isCurrent && <span className="ml-1 text-cos-signal font-medium">Current</span>}
              {!wh.isCurrent && wh.startDate && (
                <span className="ml-1">{wh.startDate}{wh.endDate ? ` \u2014 ${wh.endDate}` : ""}</span>
              )}
            </p>
            {wh.industry && (
              <span className="mt-1 inline-block rounded-cos-full bg-cos-warm/10 px-1.5 py-0.5 text-[9px] text-cos-warm">
                {wh.industry}
              </span>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-cos-electric hover:text-cos-electric/80 transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : `Show all ${workHistory.length} positions`}
        </button>
      )}
    </div>
  );
}
