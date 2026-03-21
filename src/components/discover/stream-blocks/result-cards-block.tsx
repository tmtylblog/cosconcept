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
  firm: { Icon: Building2, iconCls: "bg-cos-electric/10 text-cos-electric" },
  expert: { Icon: User, iconCls: "bg-cos-warm/10 text-cos-warm" },
  case_study: { Icon: BookOpen, iconCls: "bg-cos-signal/10 text-cos-signal" },
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
  const { Icon, iconCls } = entityCfg;

  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:shadow-md hover:border-cos-electric/30 transition-all animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Header: Icon + Name + Category badge + Match score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg", iconCls)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-[15px] font-bold text-cos-midnight truncate">
                {match.displayName}
              </h3>
              {match.categories.length > 0 && (
                <span className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-[10px] font-semibold text-cos-electric uppercase tracking-wide">
                  {match.categories[0]}
                </span>
              )}
            </div>
            {match.explanation && (
              <p className="mt-1 text-xs text-cos-slate leading-relaxed line-clamp-2">
                {match.explanation}
              </p>
            )}
          </div>
        </div>
        {/* Match score with mini progress bar */}
        <div className="shrink-0 text-right">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-cos-midnight">{match.matchScore}%</span>
          </div>
          <div className="mt-0.5 h-1 w-16 rounded-full bg-cos-cloud overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", match.matchScore >= 75 ? "bg-green-500" : match.matchScore >= 50 ? "bg-cos-electric" : "bg-cos-slate-light")}
              style={{ width: `${match.matchScore}%` }}
            />
          </div>
          <p className="text-[9px] text-cos-slate-light mt-0.5 uppercase tracking-wide">Match</p>
        </div>
      </div>

      {/* Skill pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-cos-full border border-cos-border bg-white px-2.5 py-1 text-[11px] text-cos-midnight">
            {skill}
          </span>
        ))}
        {match.skills.length > 4 && (
          <span className="rounded-cos-full border border-cos-border bg-white px-2.5 py-1 text-[11px] text-cos-slate">
            +{match.skills.length - 4} more
          </span>
        )}
      </div>

      {/* Stats row + Industries + CTA */}
      <div className="mt-3 flex items-center justify-between border-t border-cos-border/50 pt-3">
        <div className="flex items-center gap-4 text-[11px] text-cos-slate">
          {(match.caseStudyCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {match.caseStudyCount} Case Studies
            </span>
          )}
          {match.industries.length > 0 && (
            <span>{match.industries.slice(0, 3).join(" \u00b7 ")}</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-medium"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Profile
        </Button>
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
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:shadow-md hover:border-cos-warm/40 transition-all animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Header: Avatar + Name/Title + Firm badge + Specialist count */}
      <div className="flex items-start gap-4">
        {/* Avatar placeholder */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-warm/20 to-cos-warm/5 border border-cos-warm/20">
          <User className="h-7 w-7 text-cos-warm/60" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading text-[15px] font-bold text-cos-midnight">
              {match.displayName}
            </h3>
            {/* Firm affiliation badge */}
            {(match.firmName || match.subtitle) && (
              <span className="inline-flex items-center gap-1 rounded-cos-md bg-cos-cloud border border-cos-border px-2 py-0.5 text-[10px] font-semibold text-cos-slate uppercase tracking-wide">
                <Building2 className="h-2.5 w-2.5" />
                {match.firmName || match.subtitle}
              </span>
            )}
          </div>

          {/* Title / Specialist title */}
          {match.specialistTitle && (
            <p className="mt-0.5 text-xs font-medium italic text-cos-midnight/70">
              {match.specialistTitle}
            </p>
          )}

          {/* Specialty pills */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {match.skills.slice(0, 3).map((skill) => (
              <span key={skill} className="rounded-cos-full border border-cos-warm/30 bg-cos-warm/10 px-2.5 py-1 text-[11px] font-medium text-cos-warm">
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Specialist profile count badge */}
        {spCount > 0 && (
          <div className="shrink-0 rounded-cos-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center">
            <p className="text-sm font-bold text-amber-700">{spCount}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-600">
              Specialist{spCount > 1 ? " Profiles" : " Profile"}
            </p>
          </div>
        )}
      </div>

      {/* Bio / explanation */}
      {(match.explanation || match.summary) && (
        <p className="mt-3 text-xs text-cos-midnight/70 leading-relaxed line-clamp-2">
          {match.explanation || match.summary}
        </p>
      )}

      {/* Industries + Skills row */}
      {match.industries.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-cos-slate">
          <span className="font-semibold uppercase tracking-wide text-cos-slate-light text-[10px]">Industries:</span>
          <span>{match.industries.slice(0, 3).join(", ")}</span>
        </div>
      )}

      {match.skills.length > 3 && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-cos-slate">
          <span className="font-semibold uppercase tracking-wide text-cos-slate-light text-[10px]">Skills:</span>
          <span>{match.skills.slice(3, 7).join("  \u00b7  ")}</span>
        </div>
      )}

      {/* CTA */}
      <div className="mt-3 flex items-center justify-end border-t border-cos-border/50 pt-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-medium border-cos-midnight/20 text-cos-midnight hover:bg-cos-midnight hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Expert
        </Button>
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
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:shadow-md hover:border-cos-signal/40 transition-all animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      {/* Header: Icon + Title + Client + Firm badge */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-signal/10 border border-cos-signal/20">
          <Briefcase className="h-5 w-5 text-cos-signal" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-[15px] font-bold text-cos-midnight">
            {match.displayName}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            {match.clientName && (
              <span className="text-xs text-cos-slate">
                for <span className="font-medium text-cos-midnight">{match.clientName}</span>
              </span>
            )}
            {match.firmName && match.firmName !== match.displayName && (
              <span className="inline-flex items-center gap-1 rounded-cos-md bg-cos-cloud border border-cos-border px-2 py-0.5 text-[10px] font-semibold text-cos-slate uppercase tracking-wide">
                <Building2 className="h-2.5 w-2.5" />
                {match.firmName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Skill pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-cos-full border border-cos-signal/30 bg-cos-signal/5 px-2.5 py-1 text-[11px] font-medium text-cos-signal">
            {skill}
          </span>
        ))}
      </div>

      {/* Summary quote block */}
      {match.summary && (
        <div className="mt-3 border-l-2 border-cos-signal/30 pl-3 py-1">
          <p className="text-xs text-cos-midnight/70 leading-relaxed line-clamp-3 italic">
            {match.summary}
          </p>
        </div>
      )}

      {/* Footer: Industries + Source + CTA */}
      <div className="mt-3 flex items-center justify-between border-t border-cos-border/50 pt-3">
        <div className="flex items-center gap-2 flex-wrap">
          {match.industries.slice(0, 2).map((industry) => (
            <span key={industry} className="rounded-cos-full bg-cos-cloud border border-cos-border px-2 py-0.5 text-[10px] text-cos-slate">
              {industry}
            </span>
          ))}
          {match.sourceUrl && (
            <a
              href={match.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-cos-electric hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Source
            </a>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-medium border-cos-signal/30 text-cos-signal hover:bg-cos-signal hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Case Study
        </Button>
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light px-1 pt-2 pb-1">
      {label} ({count})
    </p>
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
