"use client";

import { Building2, User, BookOpen, ArrowRight, X } from "lucide-react";
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

// ─── Result Card ─────────────────────────────────────────────

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
                {match.categories.slice(0, 2).join(" · ") || "Professional Services"}
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

// ─── Results Block ────────────────────────────────────────────

interface ResultCardsBlockProps {
  results: DiscoverCandidate[];
  query: string;
  onViewProfile: (match: DiscoverCandidate) => void;
  onDismiss?: (match: DiscoverCandidate) => void;
}

export function ResultCardsBlock({ results, query, onViewProfile, onDismiss }: ResultCardsBlockProps) {
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
