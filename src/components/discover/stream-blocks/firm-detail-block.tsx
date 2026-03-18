"use client";

import { useState } from "react";
import {
  Building2,
  Globe,
  ExternalLink,
  Linkedin,
  Users,
  User,
  ChevronRight,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FirmDetailData, MatchContext } from "@/hooks/use-discover-stream";

// ─── Types ────────────────────────────────────────────────

type TabId = "overview" | "case_studies" | "experts";

interface FirmDetailBlockProps {
  data: FirmDetailData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  matchContext?: MatchContext;
  onViewExpert?: (legacyId: string, displayName: string) => void;
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────

function getQueryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

type FitTier = "strong" | "good" | "exploring";

function getFitTier(score: number): FitTier {
  if (score >= 75) return "strong";
  if (score >= 50) return "good";
  return "exploring";
}

const FIT_TIER_STYLE: Record<FitTier, { label: string; bg: string; text: string; border: string }> = {
  strong: { label: "Strong Fit", bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  good: { label: "Good Fit", bg: "bg-cos-electric/5", text: "text-cos-electric", border: "border-cos-electric/20" },
  exploring: { label: "Worth Exploring", bg: "bg-cos-cloud", text: "text-cos-slate", border: "border-cos-border" },
};

function computeCaseStudyRelevance(
  cs: { skills: string[]; industries: string[] },
  queryTerms: string[]
): string | null {
  const matchingSkills = cs.skills.filter((s) =>
    queryTerms.some((t) => s.toLowerCase().includes(t))
  );
  const matchingIndustries = cs.industries.filter((i) =>
    queryTerms.some((t) => i.toLowerCase().includes(t))
  );
  if (matchingSkills.length === 0 && matchingIndustries.length === 0) return null;
  const parts: string[] = [];
  if (matchingSkills.length) parts.push(`demonstrates ${matchingSkills.join(", ")}`);
  if (matchingIndustries.length) parts.push(`in ${matchingIndustries.join(", ")}`);
  return `Relevant: ${parts.join(" ")}`;
}

function computeExpertRelevance(
  exp: { skills?: string[]; specialistTitles?: string[] },
  queryTerms: string[]
): { matchingSkills: string[]; matchingTitles: string[] } {
  const matchingSkills = (exp.skills ?? []).filter((s) =>
    queryTerms.some((t) => s.toLowerCase().includes(t))
  );
  const matchingTitles = (exp.specialistTitles ?? []).filter((t) =>
    queryTerms.some((q) => t.toLowerCase().includes(q))
  );
  return { matchingSkills, matchingTitles };
}

/** Generate a synthetic summary when a case study has no summary */
function synthesizeCaseStudySummary(cs: { skills: string[]; industries: string[] }): string {
  const parts: string[] = [];
  if (cs.skills.length) parts.push(cs.skills.slice(0, 3).join(", "));
  if (cs.industries.length) parts.push(`in ${cs.industries.slice(0, 2).join(" and ")}`);
  if (parts.length === 0) return "Project details available";
  return `Project demonstrating ${parts.join(" ")}`;
}

/** Generate a summary line for an expert */
function synthesizeExpertSummary(exp: { title: string | null; hiddenSummary?: string | null; skills?: string[]; specialistTitles?: string[] }): string | null {
  if (exp.hiddenSummary) return exp.hiddenSummary;
  if (exp.specialistTitles?.length) return exp.specialistTitles[0];
  if (exp.title) return exp.title;
  if (exp.skills?.length) return exp.skills.slice(0, 3).join(", ");
  return null;
}

// ─── Component ────────────────────────────────────────────

export function FirmDetailBlock({
  data,
  loading,
  error,
  searchQuery,
  matchContext,
  onViewExpert,
  onClose,
}: FirmDetailBlockProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (loading) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white p-6 shadow-sm">
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-cos-lg bg-cos-cloud" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-cos-cloud" />
              <div className="h-3 w-32 rounded bg-cos-cloud" />
            </div>
          </div>
          <div className="h-20 rounded-cos-xl bg-cos-cloud/60" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-cos-cloud" />
            <div className="h-6 w-20 rounded-full bg-cos-cloud" />
            <div className="h-6 w-14 rounded-full bg-cos-cloud" />
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

  // Build tabs — only show tabs with real content
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    ...(data.caseStudies.length > 0
      ? [{ id: "case_studies" as const, label: "Case Studies", count: data.caseStudies.length }]
      : []),
    ...(data.experts.length > 0
      ? [{ id: "experts" as const, label: "Experts", count: data.experts.length }]
      : []),
  ];

  // If active tab was hidden, reset to overview
  const validTabIds = tabs.map((t) => t.id);
  const currentTab = validTabIds.includes(activeTab) ? activeTab : "overview";

  const tier = matchContext ? getFitTier(matchContext.matchScore) : null;
  const tierStyle = tier ? FIT_TIER_STYLE[tier] : null;

  return (
    <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-cos-border/50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
          <Building2 className="h-5 w-5 text-cos-electric" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-cos-midnight truncate">
            {data.name}
          </h3>
          <p className="text-xs text-cos-slate truncate">
            {data.categories.slice(0, 3).join(" · ") || "Professional Services"}
            {data.sizeBand && ` · ${data.sizeBand.replace(/_/g, " ")}`}
          </p>
        </div>
        {/* Match score badge */}
        {matchContext && tierStyle && (
          <div className={cn("shrink-0 rounded-cos-full border px-2.5 py-1 text-[11px] font-semibold", tierStyle.bg, tierStyle.text, tierStyle.border)}>
            {matchContext.matchScore}% {tierStyle.label}
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="shrink-0 text-cos-slate hover:text-cos-midnight p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Match explanation banner */}
      {matchContext?.explanation && (
        <div className="border-b border-cos-border/50 bg-cos-electric/5 px-5 py-3">
          <p className="text-xs leading-relaxed text-cos-midnight/80">
            {matchContext.explanation}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-cos-border/50 px-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative px-3 py-2.5 text-xs font-medium transition-colors",
              currentTab === tab.id
                ? "text-cos-electric"
                : "text-cos-slate hover:text-cos-midnight"
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">{tab.count}</span>
            )}
            {currentTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cos-electric rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto cos-scrollbar">
        {currentTab === "overview" && (
          <OverviewTab data={data} searchQuery={searchQuery} matchContext={matchContext} onViewExpert={onViewExpert} />
        )}
        {currentTab === "case_studies" && (
          <CaseStudiesTab caseStudies={data.caseStudies} searchQuery={searchQuery} />
        )}
        {currentTab === "experts" && (
          <ExpertsTab experts={data.experts} searchQuery={searchQuery} onViewExpert={onViewExpert} />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────

function OverviewTab({
  data,
  searchQuery,
  matchContext,
  onViewExpert,
}: {
  data: FirmDetailData;
  searchQuery: string;
  matchContext?: MatchContext;
  onViewExpert?: (legacyId: string, displayName: string) => void;
}) {
  const queryTerms = getQueryTerms(searchQuery);

  // Find experts with matching specialist profiles
  const specialistMatches = data.experts
    .filter((exp) => {
      const rel = computeExpertRelevance(exp, queryTerms);
      return rel.matchingTitles.length > 0 || rel.matchingSkills.length > 0;
    })
    .slice(0, 4);

  return (
    <>
      {/* Description */}
      {data.description && (
        <p className="text-sm text-cos-midnight/80 leading-relaxed">
          {data.description}
        </p>
      )}

      {/* Quick facts */}
      <div className="flex flex-wrap gap-2">
        {data.website && (
          <a
            href={data.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-electric hover:text-cos-electric transition-colors"
          >
            <Globe className="h-3 w-3" />
            {(() => { try { return new URL(data.website).hostname; } catch { return data.website; } })()}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
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
        {data.sizeBand && (
          <span className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate">
            <Users className="h-3 w-3" />
            {data.sizeBand.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Specialist Capabilities (search-relevant) */}
      {specialistMatches.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-signal">
            <Sparkles className="inline h-3 w-3 mr-1" />
            Specialist Capabilities Matching Your Search
          </p>
          <div className="space-y-1.5">
            {specialistMatches.map((exp) => {
              const rel = computeExpertRelevance(exp, queryTerms);
              return (
                <button
                  key={exp.legacyId}
                  onClick={() => onViewExpert?.(exp.legacyId, exp.displayName)}
                  className="flex w-full items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-3 py-2 text-left hover:border-cos-signal/40 transition-colors"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full bg-cos-signal/10">
                    <User className="h-3.5 w-3.5 text-cos-signal" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-cos-midnight">
                      {exp.displayName}
                    </p>
                    {rel.matchingTitles.length > 0 && (
                      <p className="truncate text-[10px] text-cos-signal">{rel.matchingTitles[0]}</p>
                    )}
                    {rel.matchingSkills.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-0.5">
                        {rel.matchingSkills.slice(0, 3).map((s) => (
                          <span key={s} className="rounded-cos-full bg-cos-signal/10 px-1.5 py-0.5 text-[9px] text-cos-signal">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Key Experts */}
      {data.experts.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
            Key Experts
          </p>
          <div className="space-y-1.5">
            {data.experts.slice(0, 3).map((exp) => {
              const summary = synthesizeExpertSummary(exp);
              return (
                <button
                  key={exp.legacyId}
                  onClick={() => onViewExpert?.(exp.legacyId, exp.displayName)}
                  className="flex w-full items-center gap-2 rounded-cos-xl border border-cos-border px-3 py-2 text-left hover:border-cos-warm/40 hover:bg-cos-warm/5 transition-colors"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full bg-cos-warm/10">
                    <User className="h-3.5 w-3.5 text-cos-warm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-cos-midnight">
                      {exp.displayName}
                    </p>
                    {summary && (
                      <p className="truncate text-[10px] italic text-cos-slate">{summary}</p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Case Studies with relevance */}
      {data.caseStudies.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
            Recent Case Studies
          </p>
          <div className="space-y-1.5">
            {data.caseStudies.slice(0, 2).map((cs, i) => {
              const relevance = computeCaseStudyRelevance(cs, queryTerms);
              const displaySummary = cs.summary || synthesizeCaseStudySummary(cs);
              return (
                <div key={cs.legacyId ?? i} className="rounded-cos-xl border border-cos-border p-3">
                  {relevance && (
                    <p className="mb-1.5 text-[10px] font-medium text-cos-signal">{relevance}</p>
                  )}
                  <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-2">
                    {displaySummary}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
                    {cs.sourceUrl && (
                      <a
                        href={cs.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                      >
                        View
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
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
            {data.skills.slice(0, 12).map((s) => (
              <span key={s} className={cn(
                "rounded-cos-full px-2 py-0.5 text-xs",
                queryTerms.some((t) => s.toLowerCase().includes(t))
                  ? "bg-cos-signal/10 text-cos-signal"
                  : "bg-cos-cloud text-cos-slate"
              )}>
                {s}
              </span>
            ))}
            {data.skills.length > 12 && (
              <span className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate-light">
                +{data.skills.length - 12}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Categories */}
      {data.categories.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Categories</p>
          <div className="flex flex-wrap gap-1.5">
            {data.categories.map((c) => (
              <span key={c} className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Industries */}
      {data.industries.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Industries</p>
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

      {/* Markets */}
      {data.markets.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Markets</p>
          <div className="flex flex-wrap gap-1.5">
            {data.markets.map((m) => (
              <span key={m} className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{m}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Case Studies Tab ─────────────────────────────────────

function CaseStudiesTab({
  caseStudies,
  searchQuery,
}: {
  caseStudies: FirmDetailData["caseStudies"];
  searchQuery: string;
}) {
  if (caseStudies.length === 0) {
    return <p className="text-sm italic text-cos-slate py-4 text-center">No case studies available.</p>;
  }

  const queryTerms = getQueryTerms(searchQuery);

  // Sort: relevant case studies first
  const sorted = [...caseStudies].sort((a, b) => {
    const aRel = computeCaseStudyRelevance(a, queryTerms);
    const bRel = computeCaseStudyRelevance(b, queryTerms);
    if (aRel && !bRel) return -1;
    if (!aRel && bRel) return 1;
    return 0;
  });

  const relevantCount = sorted.filter((cs) => computeCaseStudyRelevance(cs, queryTerms)).length;
  const hasNonRelevant = relevantCount < sorted.length && relevantCount > 0;

  return (
    <div className="space-y-2">
      {sorted.map((cs, i) => {
        const relevance = computeCaseStudyRelevance(cs, queryTerms);
        const displaySummary = cs.summary || synthesizeCaseStudySummary(cs);
        return (
          <div key={cs.legacyId ?? i} className={cn(
            "rounded-cos-xl border p-3",
            relevance ? "border-cos-signal/20 bg-cos-signal/5" : "border-cos-border"
          )}>
            {relevance && (
              <p className="mb-1.5 text-[10px] font-medium text-cos-signal">{relevance}</p>
            )}
            <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-3">
              {displaySummary}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {cs.skills.slice(0, 4).map((s) => (
                <span key={s} className={cn(
                  "rounded-cos-full px-1.5 py-0.5 text-[10px]",
                  queryTerms.some((t) => s.toLowerCase().includes(t))
                    ? "bg-cos-signal/10 text-cos-signal"
                    : "bg-cos-cloud text-cos-slate"
                )}>
                  {s}
                </span>
              ))}
              {cs.industries.slice(0, 3).map((ind) => (
                <span key={ind} className={cn(
                  "rounded-cos-full px-1.5 py-0.5 text-[10px]",
                  queryTerms.some((t) => ind.toLowerCase().includes(t))
                    ? "bg-cos-signal/10 text-cos-signal"
                    : "bg-cos-warm/10 text-cos-warm"
                )}>
                  {ind}
                </span>
              ))}
              {cs.sourceUrl && (
                <a
                  href={cs.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                >
                  View Case Study
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        );
      })}
      {hasNonRelevant && searchQuery && (
        <p className="text-[11px] text-cos-slate-light italic text-center pt-1">
          {sorted.length - relevantCount} case {sorted.length - relevantCount === 1 ? "study doesn&apos;t" : "studies don&apos;t"} directly match your search for &quot;{searchQuery}&quot;
        </p>
      )}
      {relevantCount === 0 && searchQuery && sorted.length > 0 && (
        <p className="text-[11px] text-cos-slate-light italic text-center pt-1">
          This firm has {sorted.length} case {sorted.length === 1 ? "study" : "studies"}, but none directly match your search for &quot;{searchQuery}&quot;
        </p>
      )}
    </div>
  );
}

// ─── Experts Tab ──────────────────────────────────────────

function ExpertsTab({
  experts,
  searchQuery,
  onViewExpert,
}: {
  experts: FirmDetailData["experts"];
  searchQuery: string;
  onViewExpert?: (legacyId: string, displayName: string) => void;
}) {
  if (experts.length === 0) {
    return <p className="text-sm italic text-cos-slate py-4 text-center">No experts listed.</p>;
  }

  const queryTerms = getQueryTerms(searchQuery);

  // Sort: most relevant experts first
  const sorted = [...experts].sort((a, b) => {
    const aRel = computeExpertRelevance(a, queryTerms);
    const bRel = computeExpertRelevance(b, queryTerms);
    const aScore = aRel.matchingSkills.length + aRel.matchingTitles.length * 2;
    const bScore = bRel.matchingSkills.length + bRel.matchingTitles.length * 2;
    return bScore - aScore;
  });

  return (
    <div className="space-y-1.5">
      {sorted.map((exp) => {
        const rel = computeExpertRelevance(exp, queryTerms);
        const isRelevant = rel.matchingSkills.length > 0 || rel.matchingTitles.length > 0;
        const summary = synthesizeExpertSummary(exp);
        return (
          <button
            key={exp.legacyId}
            onClick={() => onViewExpert?.(exp.legacyId, exp.displayName)}
            className={cn(
              "flex w-full items-center gap-2 rounded-cos-xl border px-3 py-2 text-left transition-colors",
              isRelevant
                ? "border-cos-signal/20 bg-cos-signal/5 hover:border-cos-signal/40"
                : "border-cos-border hover:border-cos-warm/40 hover:bg-cos-warm/5"
            )}
          >
            <div className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full",
              isRelevant ? "bg-cos-signal/10" : "bg-cos-warm/10"
            )}>
              <User className={cn("h-3.5 w-3.5", isRelevant ? "text-cos-signal" : "text-cos-warm")} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-cos-midnight">
                {exp.displayName}
              </p>
              {summary && (
                <p className="truncate text-[10px] italic text-cos-slate">{summary}</p>
              )}
              {rel.matchingSkills.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {rel.matchingSkills.slice(0, 3).map((s) => (
                    <span key={s} className="rounded-cos-full bg-cos-signal/10 px-1.5 py-0.5 text-[9px] text-cos-signal">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
          </button>
        );
      })}
    </div>
  );
}
