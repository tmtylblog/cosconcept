"use client";

import { Building2, User, BookOpen, ArrowRight, X, Star, Users } from "lucide-react";
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
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 hover:border-cos-electric/30 transition-colors animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg", iconCls)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold text-cos-midnight truncate">
              {match.displayName}
            </h3>
            {match.entityType === "firm" ? (
              <p className="mt-0.5 text-xs text-cos-slate truncate">
                {match.categories.slice(0, 2).join(" \u00b7 ") || "Professional Services"}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-cos-slate truncate">{match.firmName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-cos-midnight">
            {match.matchScore}%
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-cos-full border px-2 py-0.5 text-[10px] font-medium",
              tierCfg.className
            )}
          >
            {tierCfg.label}
          </span>
        </div>
      </div>

      {match.explanation && (
        <p className="mt-2 text-xs text-cos-midnight/70 leading-relaxed line-clamp-2">
          {match.explanation}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {match.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">
            {skill}
          </span>
        ))}
        {match.industries.slice(0, 2).map((industry) => (
          <span key={industry} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-[10px] text-cos-warm">
            {industry}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Profile
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        {onDismiss && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(match);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-cos-full text-cos-slate-light hover:bg-cos-cloud hover:text-cos-slate transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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

  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 hover:border-cos-warm/40 transition-colors animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cos-warm/10">
            <User className="h-5 w-5 text-cos-warm" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-sm font-semibold text-cos-midnight truncate">
                {match.displayName}
              </h3>
              {isSpecialist && (
                <span className="inline-flex items-center gap-0.5 rounded-cos-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  <Star className="h-2.5 w-2.5" />
                  Specialist
                </span>
              )}
            </div>
            {match.specialistTitle && (
              <p className="mt-0.5 text-xs font-medium text-cos-midnight/80 truncate">
                {match.specialistTitle}
              </p>
            )}
            {match.subtitle && (
              <p className="mt-0.5 text-[11px] text-cos-slate truncate">at {match.subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-cos-midnight">
            {match.matchScore}%
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-cos-full border px-2 py-0.5 text-[10px] font-medium",
              tierCfg.className
            )}
          >
            {tierCfg.label}
          </span>
        </div>
      </div>

      {match.explanation && (
        <p className="mt-2 text-xs text-cos-midnight/70 leading-relaxed line-clamp-2">
          {match.explanation}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {match.skills.slice(0, 6).map((skill) => (
          <span key={skill} className="rounded-cos-full bg-cos-warm/10 px-2.5 py-0.5 text-[11px] text-cos-warm">
            {skill}
          </span>
        ))}
        {match.industries.slice(0, 2).map((industry) => (
          <span key={industry} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">
            {industry}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Expert
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        {onDismiss && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(match);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-cos-full text-cos-slate-light hover:bg-cos-cloud hover:text-cos-slate transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 hover:border-cos-signal/40 transition-colors animate-slide-up cursor-pointer"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      onClick={() => onViewProfile(match)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-signal/10">
            <BookOpen className="h-4 w-4 text-cos-signal" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold text-cos-midnight truncate">
              {match.displayName}
            </h3>
            <div className="mt-0.5 flex items-center gap-2">
              {match.clientName && (
                <span className="text-xs font-medium text-cos-electric">for {match.clientName}</span>
              )}
              {match.subtitle && (
                <span className="text-[11px] text-cos-slate">by {match.subtitle}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-cos-midnight">
            {match.matchScore}%
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-cos-full border px-2 py-0.5 text-[10px] font-medium",
              tierCfg.className
            )}
          >
            {tierCfg.label}
          </span>
        </div>
      </div>

      {match.summary && (
        <p className="mt-2 text-xs text-cos-midnight/70 leading-relaxed line-clamp-3">
          {match.summary}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {match.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-cos-full bg-cos-signal/10 px-2 py-0.5 text-[10px] text-cos-signal">
            {skill}
          </span>
        ))}
        {match.industries.slice(0, 2).map((industry) => (
          <span key={industry} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-[10px] text-cos-warm">
            {industry}
          </span>
        ))}
        {(match.contributorCount ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-cos-full border border-cos-border px-1.5 py-0.5 text-[10px] text-cos-slate">
            <Users className="h-2.5 w-2.5" />
            {match.contributorCount}
          </span>
        )}
        {match.sourceUrl && (
          <span className="inline-flex items-center gap-0.5 rounded-cos-full border border-cos-border px-1.5 py-0.5 text-[10px] text-cos-slate">
            Source
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(match);
          }}
        >
          View Case Study
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        {onDismiss && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(match);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-cos-full text-cos-slate-light hover:bg-cos-cloud hover:text-cos-slate transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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
  // Use specialized cards when intent matches entity type
  if (searchIntent === "expertise" && match.entityType === "expert") {
    return <ExpertResultCard match={match} index={index} onViewProfile={onViewProfile} onDismiss={onDismiss} />;
  }
  if (searchIntent === "evidence" && match.entityType === "case_study") {
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

  // For non-default intents, group primary results first
  const intent = searchIntent ?? "partner";
  const primaryType = intent === "expertise" ? "expert" : intent === "evidence" ? "case_study" : null;

  if (primaryType) {
    const primary = results.filter((r) => r.entityType === primaryType);
    const secondary = results.filter((r) => r.entityType !== primaryType);

    const primaryLabel = intent === "expertise" ? "Top Experts" : "Relevant Case Studies";
    const secondaryLabel = "Related Results";

    return (
      <div className="space-y-2">
        <p className="text-xs text-cos-slate px-1">
          {results.length} result{results.length === 1 ? "" : "s"}
          {query ? ` for \u201C${query}\u201D` : ""}
        </p>

        {primary.length > 0 && (
          <>
            <SectionHeader label={primaryLabel} count={primary.length} />
            {primary.map((match, i) => (
              <IntentCard
                key={`${match.entityType}-${match.entityId}-${i}`}
                match={match}
                index={i}
                searchIntent={searchIntent}
                onViewProfile={onViewProfile}
                onDismiss={onDismiss}
              />
            ))}
          </>
        )}

        {secondary.length > 0 && (
          <>
            <SectionHeader label={secondaryLabel} count={secondary.length} />
            {secondary.map((match, i) => (
              <IntentCard
                key={`${match.entityType}-${match.entityId}-sec-${i}`}
                match={match}
                index={primary.length + i}
                searchIntent={searchIntent}
                onViewProfile={onViewProfile}
                onDismiss={onDismiss}
              />
            ))}
          </>
        )}
      </div>
    );
  }

  // Default: flat list (partner intent or no intent)
  return (
    <div className="space-y-2">
      <p className="text-xs text-cos-slate px-1">
        {results.length} result{results.length === 1 ? "" : "s"}
        {query ? ` for \u201C${query}\u201D` : ""}
      </p>
      {results.map((match, i) => (
        <ResultCard
          key={`${match.entityType}-${match.entityId}-${i}`}
          match={match}
          index={i}
          onViewProfile={onViewProfile}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
