"use client";

import { Building2, User, BookOpen, ArrowRight } from "lucide-react";
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

// ─── Entity config ────────────────────────────────────────────

const ENTITY_CONFIG = {
  firm: { Icon: Building2, iconCls: "bg-cos-electric/10 text-cos-electric" },
  expert: { Icon: User, iconCls: "bg-cos-warm/10 text-cos-warm" },
  case_study: { Icon: BookOpen, iconCls: "bg-cos-signal/10 text-cos-signal" },
} as const;

// ─── Result Card ─────────────────────────────────────────────

interface ResultCardProps {
  match: DiscoverCandidate;
  index: number;
  onViewProfile: (match: DiscoverCandidate) => void;
}

function ResultCard({ match, index, onViewProfile }: ResultCardProps) {
  const tier = getFitTier(match.matchScore);
  const tierCfg = FIT_TIER_CONFIG[tier];
  const entityCfg = ENTITY_CONFIG[match.entityType ?? "firm"];
  const { Icon, iconCls } = entityCfg;

  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 hover:border-cos-electric/30 transition-colors animate-fade-slide-in cursor-pointer"
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

      <div className="mt-3">
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
      </div>
    </div>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 animate-pulse"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-cos-lg bg-cos-cloud" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 rounded bg-cos-cloud" />
          <div className="h-3 w-24 rounded bg-cos-cloud" />
        </div>
        <div className="h-5 w-20 rounded-full bg-cos-cloud" />
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="h-3 w-full rounded bg-cos-cloud" />
        <div className="h-3 w-4/5 rounded bg-cos-cloud" />
      </div>
      <div className="mt-2 flex gap-1">
        <div className="h-4 w-14 rounded-full bg-cos-cloud" />
        <div className="h-4 w-18 rounded-full bg-cos-cloud" />
        <div className="h-4 w-12 rounded-full bg-cos-cloud" />
      </div>
    </div>
  );
}

// ─── Results Grid ─────────────────────────────────────────────

interface DiscoverResultsGridProps {
  results: DiscoverCandidate[];
  searching: boolean;
  searchQuery: string;
  stats: { layer1Candidates: number; layer2Candidates: number; layer3Ranked: number; totalDurationMs: number } | null;
  onViewProfile: (match: DiscoverCandidate) => void;
}

export function DiscoverResultsGrid({
  results,
  searching,
  searchQuery,
  stats,
  onViewProfile,
}: DiscoverResultsGridProps) {
  if (searching) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-cos-slate">
          {results.length} result{results.length === 1 ? "" : "s"}
          {searchQuery ? ` for \u201C${searchQuery}\u201D` : ""}
        </p>
        {stats && (
          <p className="text-[10px] text-cos-slate-light">
            {(stats.totalDurationMs / 1000).toFixed(1)}s
          </p>
        )}
      </div>
      <div className="space-y-2">
        {results.map((match, i) => (
          <ResultCard
            key={`${match.entityType}-${match.entityId}-${i}`}
            match={match}
            index={i}
            onViewProfile={onViewProfile}
          />
        ))}
      </div>
    </div>
  );
}
