"use client";

import { Building2, User, BookOpen, ArrowRight, X, Star, Users, FileText, ExternalLink, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DiscoverCandidate } from "@/hooks/use-discover-results";

// ─── Fit tier logic ───────────────────────────────────────────

type FitTier = "strong" | "good" | "exploring";

function getFitTier(score: number): FitTier {
  if (score >= 75) return "strong";
  if (score >= 50) return "good";
  return "exploring";
}

const FIT_TIER_CONFIG: Record<FitTier, { label: string; className: string }> = {
  strong: {
    label: "Strong Fit",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  good: {
    label: "Good Fit",
    className: "border-cos-electric/20 bg-cos-electric/5 text-cos-electric",
  },
  exploring: {
    label: "Worth Exploring",
    className: "border-cos-border bg-cos-cloud text-cos-slate",
  },
};

const ENTITY_CONFIG = {
  firm: { Icon: Building2, iconCls: "bg-cos-electric/10 text-cos-electric", accentBorder: "border-l-cos-electric" },
  expert: { Icon: User, iconCls: "bg-cos-warm/10 text-cos-warm", accentBorder: "border-l-cos-warm" },
  case_study: { Icon: BookOpen, iconCls: "bg-cos-signal/10 text-cos-signal", accentBorder: "border-l-cos-signal" },
} as const;

// ─── Standard Result Card ─────────────────────────────────────

function ResultCard({
  match,
  index,
  onViewProfile,
  onDismiss,
}: {
  match: DiscoverCandidate;
  index: number;
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}) {
  const tier = getFitTier(match.matchScore);
  const tierCfg = FIT_TIER_CONFIG[tier];
  const entityCfg = ENTITY_CONFIG[match.entityType ?? "firm"];
  const { Icon, iconCls, accentBorder } = entityCfg;

  // Match score color — bold, saturated, unmistakable
  const scoreColor = match.matchScore >= 80
    ? "text-emerald-600"
    : match.matchScore >= 60
      ? "text-cos-electric"
      : "text-cos-slate";
  const scoreBarColor = match.matchScore >= 80
    ? "bg-emerald-500"
    : match.matchScore >= 60
      ? "bg-cos-electric"
      : "bg-cos-slate-light";

  return (
    <div
      className={cn(
        "group relative rounded-cos-xl border bg-white p-0 overflow-hidden transition-all duration-300 animate-slide-up cursor-pointer",
        "hover:shadow-[0_8px_30px_rgba(31,134,161,0.12)] hover:-translate-y-0.5",
        "border-cos-border/60 hover:border-cos-electric/40",
      )}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Accent bar — bold 4px stripe colored by entity */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5", accentBorder.replace("border-l-", "bg-"))} />

      <div className="pl-5 pr-5 pt-5 pb-4">
        {/* Header: Icon + Name + Category badge + Match score */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-cos-xl transition-transform duration-300 group-hover:scale-105",
              iconCls
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className="font-heading text-base font-bold text-cos-midnight truncate leading-tight">
                {match.displayName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {match.categories.length > 0 && (
                  <span className="rounded-cos-pill bg-cos-midnight/8 px-2.5 py-0.5 text-[10px] font-semibold text-cos-midnight/70 uppercase tracking-wider">
                    {match.categories[0]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Match score — dramatic, confident */}
          <div className="shrink-0 flex flex-col items-end">
            <div className="flex items-baseline gap-0.5">
              <span className={cn("font-heading text-2xl font-extrabold tracking-tight", scoreColor)}>
                {match.matchScore}
              </span>
              <span className={cn("text-xs font-bold", scoreColor)}>%</span>
            </div>
            <div className="mt-1 h-1.5 w-20 rounded-full bg-cos-cloud-dim overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", scoreBarColor)}
                style={{ width: `${match.matchScore}%` }}
              />
            </div>
            <p className="text-[8px] text-cos-slate-light mt-1 uppercase tracking-[0.15em] font-semibold">
              Proprietary Fit Score
            </p>
          </div>
        </div>

        {/* Explanation */}
        {match.explanation && (
          <p className="mt-2.5 text-[13px] text-cos-slate leading-relaxed line-clamp-2 pl-[3.625rem]">
            {match.explanation}
          </p>
        )}

        {/* Skill pills — refined, airy */}
        <div className="mt-3.5 flex flex-wrap gap-1.5 pl-[3.625rem]">
          {match.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="rounded-cos-pill border border-cos-border/70 bg-cos-cloud/50 px-3 py-1 text-[11px] font-medium text-cos-midnight/80">
              {skill}
            </span>
          ))}
          {match.skills.length > 4 && (
            <span className="rounded-cos-pill border border-cos-border/50 bg-transparent px-3 py-1 text-[11px] text-cos-slate">
              +{match.skills.length - 4} more
            </span>
          )}
        </div>

        {/* Stats + Industries + CTA — clean divider */}
        <div className="mt-4 flex items-center justify-between border-t border-cos-border/30 pt-3 pl-[3.625rem]">
          <div className="flex items-center gap-5 text-[11px] text-cos-slate">
            {(match.caseStudyCount ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 font-medium">
                <FileText className="h-3.5 w-3.5 text-cos-signal" />
                {match.caseStudyCount} Case {match.caseStudyCount === 1 ? "Study" : "Studies"}
              </span>
            )}
            {match.industries.length > 0 && (
              <span className="text-cos-slate-light">
                {match.industries.slice(0, 3).join(" \u2022 ")}
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 text-[11px] font-semibold bg-cos-electric text-white hover:bg-cos-electric-hover shadow-sm transition-all duration-200 group-hover:shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(match);
            }}
          >
            View Profile
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Expert Card (expertise intent) ────────────────────────────

function ExpertResultCard({
  match,
  index,
  onViewProfile,
  onDismiss,
}: {
  match: DiscoverCandidate;
  index: number;
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}) {
  const tier = getFitTier(match.matchScore);
  const tierCfg = FIT_TIER_CONFIG[tier];
  const isSpecialist = (match.specialistProfileCount ?? 0) > 0;

  const spCount = match.specialistProfileCount ?? 0;

  return (
    <div
      className="group relative rounded-cos-xl border border-cos-border/60 bg-white overflow-hidden transition-all duration-300 animate-slide-up cursor-pointer hover:shadow-[0_8px_30px_rgba(243,175,61,0.10)] hover:-translate-y-0.5 hover:border-cos-warm/40"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Warm accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cos-warm transition-all duration-300 group-hover:w-1.5" />

      <div className="pl-5 pr-5 pt-5 pb-4">
        {/* Header: Avatar + Name/Title + Specialist badge */}
        <div className="flex items-start gap-4">
          {/* Avatar — gradient circle with personality */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-warm/25 to-cos-warm/5 border-2 border-cos-warm/20 transition-transform duration-300 group-hover:scale-105">
            <User className="h-6 w-6 text-cos-warm/70" />
            {spCount > 0 && (
              <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-cos-warm text-white text-[9px] font-bold shadow-sm">
                {spCount}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-base font-bold text-cos-midnight leading-tight">
              {match.displayName}
            </h3>
            {match.specialistTitle && (
              <p className="mt-0.5 text-[13px] font-medium italic text-cos-warm">
                {match.specialistTitle}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {(match.firmName || match.subtitle) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cos-electric">
                  <Building2 className="h-3 w-3" />
                  {match.firmName || match.subtitle}
                </span>
              )}
              {spCount > 0 && (
                <span className="rounded-cos-pill bg-cos-warm/10 border border-cos-warm/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cos-warm">
                  {spCount} Specialist {spCount > 1 ? "Profiles" : "Profile"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Specialty pills */}
        <div className="mt-3 flex flex-wrap gap-1.5 pl-[4.5rem]">
          {match.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="rounded-cos-pill border border-cos-midnight/12 bg-cos-midnight/5 px-3 py-1 text-[11px] font-semibold text-cos-midnight/75 uppercase tracking-wide">
              {skill}
            </span>
          ))}
        </div>

        {/* Bio excerpt — editorial left-border quote style */}
        {(match.explanation || match.summary) && (
          <div className="mt-3 pl-[4.5rem]">
            <p className="border-l-2 border-cos-warm/30 pl-3 text-[13px] italic text-cos-midnight/60 leading-relaxed line-clamp-2">
              {match.explanation || match.summary}
            </p>
          </div>
        )}

        {/* Industries + CTA */}
        <div className="mt-4 flex items-center justify-between border-t border-cos-border/30 pt-3 pl-[4.5rem]">
          <div className="text-[11px] text-cos-slate">
            {match.industries.length > 0 && (
              <span>
                <span className="font-semibold uppercase tracking-wider text-[10px] text-cos-slate-light mr-1.5">Industries:</span>
                {match.industries.slice(0, 3).join(", ")}
              </span>
            )}
            {match.skills.length > 3 && (
              <span className="ml-4">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-cos-slate-light mr-1.5">Skills:</span>
                {match.skills.slice(3, 6).join(" \u2022 ")}
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 text-[11px] font-semibold bg-cos-warm text-white hover:bg-cos-warm-dim shadow-sm transition-all duration-200 group-hover:shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(match);
            }}
          >
            View Expert
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Case Study Card (evidence intent) ─────────────────────────

function CaseStudyResultCard({
  match,
  index,
  onViewProfile,
  onDismiss,
}: {
  match: DiscoverCandidate;
  index: number;
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}) {
  const tier = getFitTier(match.matchScore);
  const tierCfg = FIT_TIER_CONFIG[tier];

  return (
    <div
      className="group relative rounded-cos-xl border border-cos-border/60 bg-white overflow-hidden transition-all duration-300 animate-slide-up cursor-pointer hover:shadow-[0_8px_30px_rgba(96,185,191,0.12)] hover:-translate-y-0.5 hover:border-cos-signal/40"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Signal green accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cos-signal transition-all duration-300 group-hover:w-1.5" />

      <div className="pl-5 pr-5 pt-5 pb-4">
        {/* Header: Icon + Title + Client + Firm */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-cos-xl bg-cos-signal/10 border border-cos-signal/15 transition-transform duration-300 group-hover:scale-105">
            <Briefcase className="h-5 w-5 text-cos-signal" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="font-heading text-base font-bold text-cos-midnight leading-tight">
              {match.displayName}
            </h3>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {match.clientName && (
                <span className="text-[13px] text-cos-slate">
                  for <span className="font-semibold text-cos-midnight">{match.clientName}</span>
                </span>
              )}
              {match.firmName && match.firmName !== match.displayName && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cos-signal">
                  <Building2 className="h-3 w-3" />
                  {match.firmName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary — editorial quote block */}
        {match.summary && (
          <div className="mt-3 ml-[3.625rem] rounded-cos-lg bg-cos-signal/[0.04] border-l-3 border-cos-signal/25 px-4 py-3">
            <p className="text-[13px] text-cos-midnight/65 leading-relaxed line-clamp-3">
              {match.summary}
            </p>
          </div>
        )}

        {/* Skill pills + Industries */}
        <div className="mt-3.5 flex flex-wrap gap-1.5 ml-[3.625rem]">
          {match.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="rounded-cos-pill border border-cos-midnight/10 bg-cos-midnight/5 px-3 py-1 text-[11px] font-semibold text-cos-midnight/70 uppercase tracking-wide">
              {skill}
            </span>
          ))}
          {match.industries.slice(0, 2).map((industry) => (
            <span key={industry} className="rounded-cos-pill border border-cos-signal/20 bg-cos-signal/5 px-3 py-1 text-[11px] text-cos-signal">
              {industry}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-cos-border/30 pt-3 ml-[3.625rem]">
          <div className="flex items-center gap-3">
            {match.sourceUrl && (
              <a
                href={match.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cos-electric hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                View Source
              </a>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 text-[11px] font-semibold bg-cos-signal text-white hover:bg-cos-signal-dim shadow-sm transition-all duration-200 group-hover:shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(match);
            }}
          >
            View Case Study
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-1 pt-4 pb-2">
      <div className="h-px flex-1 bg-gradient-to-r from-cos-border to-transparent" />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-cos-midnight/40 shrink-0">
        {label} <span className="text-cos-electric">({count})</span>
      </p>
      <div className="h-px flex-1 bg-gradient-to-l from-cos-border to-transparent" />
    </div>
  );
}

// ─── Intent-aware card renderer ──────────────────────────────────

function IntentCard({
  match,
  index,
  searchIntent,
  onViewProfile,
  onDismiss,
}: {
  match: DiscoverCandidate;
  index: number;
  searchIntent?: "partner" | "expertise" | "evidence";
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}) {
  // Always use entity-type-specific cards — experts and case studies
  // should look distinct from firms regardless of search intent
  if (match.entityType === "expert") {
    return <ExpertResultCard match={match} index={index} onViewProfile={onViewProfile} onDismiss={onDismiss} />;
  }
  if (match.entityType === "case_study") {
    return <CaseStudyResultCard match={match} index={index} onViewProfile={onViewProfile} onDismiss={onDismiss} />;
  }
  return <ResultCard match={match} index={index} onViewProfile={onViewProfile} onDismiss={onDismiss} />;
}

// ─── Results Block ────────────────────────────────────────────

interface ResultCardsBlockProps {
  results: DiscoverCandidate[];
  query: string;
  searchIntent?: "partner" | "expertise" | "evidence";
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}

export function ResultCardsBlock({ results, query, searchIntent, onViewProfile, onDismiss }: ResultCardsBlockProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6 text-center animate-slide-up">
        <p className="text-sm font-medium text-cos-midnight">No matches found</p>
        <p className="mt-1 text-xs text-cos-slate">
          Try describing what you need differently, or ask Ossy to broaden the search.
        </p>
      </div>
    );
  }

  // Split into own-firm results and partner results
  const ownResults = results.filter((r) => r.isOwn);
  const partnerResults = results.filter((r) => !r.isOwn);

  // For non-default intents, group primary results first (within each section)
  const intent = searchIntent ?? "partner";
  const primaryType = intent === "expertise" ? "expert" : intent === "evidence" ? "case_study" : null;

  const renderResults = (items: DiscoverCandidate[], startIndex: number) => {
    if (primaryType) {
      const primary = items.filter((r) => r.entityType === primaryType);
      const secondary = items.filter((r) => r.entityType !== primaryType);
      const primaryLabel = intent === "expertise" ? "Top Experts" : "Relevant Case Studies";
      return (
        <>
          {primary.length > 0 && (
            <>
              <SectionHeader label={primaryLabel} count={primary.length} />
              {primary.map((match, i) => (
                <IntentCard key={`${match.entityType}-${match.entityId}-${i}`} match={match} index={startIndex + i} searchIntent={searchIntent} onViewProfile={onViewProfile} onDismiss={onDismiss} />
              ))}
            </>
          )}
          {secondary.length > 0 && secondary.map((match, i) => (
            <IntentCard key={`${match.entityType}-${match.entityId}-sec-${i}`} match={match} index={startIndex + primary.length + i} searchIntent={searchIntent} onViewProfile={onViewProfile} onDismiss={onDismiss} />
          ))}
        </>
      );
    }
    // Group by entity type with section headers for mixed results
    const experts = items.filter((r) => r.entityType === "expert");
    const cases = items.filter((r) => r.entityType === "case_study");
    const firms = items.filter((r) => r.entityType === "firm" || !r.entityType);
    let idx = startIndex;

    return (
      <>
        {experts.length > 0 && (
          <>
            <SectionHeader label="Top Experts" count={experts.length} />
            {experts.map((match, i) => (
              <ExpertResultCard key={`expert-${match.entityId}-${i}`} match={match} index={idx++} onViewProfile={onViewProfile} onDismiss={onDismiss} />
            ))}
          </>
        )}
        {cases.length > 0 && (
          <>
            <SectionHeader label="Relevant Case Studies" count={cases.length} />
            {cases.map((match, i) => (
              <CaseStudyResultCard key={`cs-${match.entityId}-${i}`} match={match} index={idx++} onViewProfile={onViewProfile} onDismiss={onDismiss} />
            ))}
          </>
        )}
        {firms.length > 0 && (
          <>
            {(experts.length > 0 || cases.length > 0) && (
              <SectionHeader label="Partner Firms" count={firms.length} />
            )}
            {firms.map((match, i) => (
              <ResultCard key={`firm-${match.entityId}-${i}`} match={match} index={idx++} onViewProfile={onViewProfile} onDismiss={onDismiss} />
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-cos-slate px-1">
        {results.length} result{results.length === 1 ? "" : "s"}
        {query ? ` for \u201C${query}\u201D` : ""}
      </p>

      {/* Own firm results first */}
      {ownResults.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-1 pt-1">
            <div className="h-px flex-1 bg-cos-electric/20" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cos-electric">
              Your Team ({ownResults.length})
            </span>
            <div className="h-px flex-1 bg-cos-electric/20" />
          </div>
          {renderResults(ownResults, 0)}
        </>
      )}

      {/* Partner results */}
      {partnerResults.length > 0 && (
        <>
          {ownResults.length > 0 && (
            <div className="flex items-center gap-2 px-1 pt-2">
              <div className="h-px flex-1 bg-cos-signal/20" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cos-signal">
                Partner Matches ({partnerResults.length})
              </span>
              <div className="h-px flex-1 bg-cos-signal/20" />
            </div>
          )}
          {renderResults(partnerResults, ownResults.length)}
        </>
      )}
    </div>
  );
}
