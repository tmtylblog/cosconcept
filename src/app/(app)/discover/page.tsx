"use client";

import { useState } from "react";
import { ArrowRight, Building2, User, BookOpen, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDiscoverResults, type DiscoverCandidate } from "@/hooks/use-discover-results";
import { cn } from "@/lib/utils";

// ─── Conversation starters ───────────────────────────────────
// Problem-framed prompts that inject into Ossy's chat via custom event

const STARTERS = [
  "We keep getting requests outside our core — we need referral partners",
  "We're trying to break into a new industry but lack the credibility",
  "I need to find firms who complement us for a bigger client pitch",
  "We're a boutique losing deals to larger competitors — who can we team up with?",
];

function injectIntoChat(text: string) {
  window.dispatchEvent(new CustomEvent("cos:inject-chat", { detail: { text } }));
}

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

function ResultCard({ match, index }: { match: DiscoverCandidate; index: number }) {
  const tier = getFitTier(match.matchScore);
  const tierCfg = FIT_TIER_CONFIG[tier];
  const entityCfg = ENTITY_CONFIG[match.entityType ?? "firm"];
  const { Icon, iconCls } = entityCfg;

  const profileUrl = `/discover/${match.firmId}${match.explanation ? `?context=${encodeURIComponent(match.explanation)}` : ""}`;

  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:border-cos-electric/30 transition-colors animate-fade-slide-in"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg", iconCls)}>
            <Icon className="h-5 w-5" />
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
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-cos-full border px-2.5 py-0.5 text-xs font-medium",
            tierCfg.className
          )}
        >
          {tierCfg.label}
        </span>
      </div>

      {match.explanation && (
        <p className="mt-3 text-sm text-cos-midnight/80 leading-relaxed">
          {match.explanation}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">
            {skill}
          </span>
        ))}
        {match.industries.slice(0, 2).map((industry) => (
          <span key={industry} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-xs text-cos-warm">
            {industry}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={profileUrl}>
            View Profile
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 animate-pulse"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-cos-lg bg-cos-cloud" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 rounded bg-cos-cloud" />
          <div className="h-3 w-24 rounded bg-cos-cloud" />
        </div>
        <div className="h-5 w-24 rounded-full bg-cos-cloud" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-cos-cloud" />
        <div className="h-3 w-4/5 rounded bg-cos-cloud" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="h-5 w-16 rounded-full bg-cos-cloud" />
        <div className="h-5 w-20 rounded-full bg-cos-cloud" />
        <div className="h-5 w-14 rounded-full bg-cos-cloud" />
      </div>
    </div>
  );
}

// ─── Idle State ───────────────────────────────────────────────

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-cos-2xl bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
        <Sparkles className="h-7 w-7 text-cos-electric" />
      </div>

      <h2 className="mt-5 font-heading text-lg font-bold text-cos-midnight">
        I know this network inside out
      </h2>
      <p className="mt-2 max-w-sm text-sm text-cos-slate leading-relaxed">
        I understand the case studies, experts, and firms here — and I&apos;m standing by
        to help. Tell me about a challenge you&apos;re facing or a problem you&apos;re
        trying to solve, and I&apos;ll find the right people.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-3">
        <span className="text-sm font-medium text-cos-electric">
          Start a conversation with Ossy
        </span>
        <ArrowRight className="h-4 w-4 text-cos-electric" />
      </div>

      <div className="mt-6 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cos-slate">
          Try sharing a challenge
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => injectIntoChat(starter)}
              className="rounded-cos-xl border border-cos-border bg-white px-4 py-3 text-left text-sm text-cos-midnight hover:border-cos-electric/40 hover:bg-cos-electric/5 transition-colors"
            >
              &ldquo;{starter}&rdquo;
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DiscoverPage() {
  const discover = useDiscoverResults();

  if (!discover) return null;

  const { results, searching, searchQuery } = discover;
  const hasResults = results.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Discover
          </h2>
          {hasResults ? (
            <p className="mt-0.5 text-sm text-cos-slate">
              {results.length} result{results.length === 1 ? "" : "s"}
              {searchQuery ? ` for "${searchQuery}"` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-cos-slate">
              Explore the network — tell Ossy about a challenge →
            </p>
          )}
        </div>
        {hasResults && (
          <Button
            variant="ghost"
            size="sm"
            className="text-cos-slate hover:text-cos-midnight"
            onClick={() => discover.clear()}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="mt-6">
        {searching ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        ) : hasResults ? (
          <div className="space-y-3">
            {results.map((match, i) => (
              <ResultCard
                key={`${match.entityType}-${match.entityId}-${i}`}
                match={match}
                index={i}
              />
            ))}
          </div>
        ) : (
          <IdleState />
        )}
      </div>
    </div>
  );
}
