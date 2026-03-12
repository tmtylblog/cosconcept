"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Building2, Sparkles, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDiscoverResults } from "@/hooks/use-discover-results";
import { useActiveOrganization } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Conversation starters ───────────────────────────────────
// Clicking injects text into Ossy's chat via a custom event

const STARTERS = [
  "Find me a Shopify agency in APAC",
  "Who complements our services in B2B SaaS?",
  "Looking for a fractional CFO to refer clients to",
  "Find UX design partners for healthcare projects",
];

function injectIntoChat(text: string) {
  // Dispatch a custom event the ChatPanel listens for
  window.dispatchEvent(new CustomEvent("cos:inject-chat", { detail: { text } }));
}

// ─── Match Card ──────────────────────────────────────────────

function MatchCard({
  match,
  onRequestPartnership,
  requesting,
  requested,
  index,
}: {
  match: NonNullable<ReturnType<typeof useDiscoverResults>>["results"][number];
  onRequestPartnership: (firmId: string) => void;
  requesting: boolean;
  requested: boolean;
  index: number;
}) {
  const score = match.matchScore;

  return (
    <div
      className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:border-cos-electric/30 transition-colors animate-fade-slide-in"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <Building2 className="h-5 w-5 text-cos-electric" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold text-cos-midnight truncate">
              {match.firmName}
            </h3>
            <p className="mt-0.5 text-xs text-cos-slate truncate">
              {match.categories.slice(0, 2).join(" · ") || "Professional Services"}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 inline-flex items-center rounded-cos-full px-2 py-0.5 text-xs font-medium",
            score >= 80
              ? "bg-green-100 text-green-700"
              : score >= 60
                ? "bg-cos-electric/10 text-cos-electric"
                : "bg-cos-cloud text-cos-slate"
          )}
        >
          {score}% match
        </div>
      </div>

      {match.explanation && (
        <p className="mt-3 text-sm text-cos-midnight/80 leading-relaxed">
          {match.explanation}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.skills.slice(0, 4).map((skill) => (
          <span
            key={skill}
            className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate"
          >
            {skill}
          </span>
        ))}
        {match.industries.slice(0, 2).map((industry) => (
          <span
            key={industry}
            className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-xs text-cos-warm"
          >
            {industry}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/discover/${match.firmId}`}>
            View Profile
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={requested ? "text-cos-signal" : "text-cos-slate"}
          disabled={requesting || requested}
          onClick={() => onRequestPartnership(match.firmId)}
        >
          {requested ? "Requested ✓" : requesting ? "Requesting..." : "Request Partnership"}
        </Button>
      </div>
    </div>
  );
}

// ─── Skeleton Card ───────────────────────────────────────────

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
        <div className="h-5 w-16 rounded-full bg-cos-cloud" />
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

// ─── Empty / Idle State ──────────────────────────────────────

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-cos-2xl bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
        <Sparkles className="h-7 w-7 text-cos-electric" />
      </div>

      <h2 className="mt-5 font-heading text-lg font-bold text-cos-midnight">
        Tell Ossy what you&apos;re looking for
      </h2>
      <p className="mt-2 max-w-sm text-sm text-cos-slate leading-relaxed">
        Ask Ossy in the panel on the right. She&apos;ll ask a couple of questions
        and find the best-fit partners from the network.
      </p>

      {/* Arrow hint */}
      <div className="mt-6 flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-3">
        <span className="text-sm font-medium text-cos-electric">
          Start a conversation with Ossy
        </span>
        <ArrowRight className="h-4 w-4 text-cos-electric" />
      </div>

      {/* Conversation starters */}
      <div className="mt-6 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium text-cos-slate uppercase tracking-wide">
          Try asking
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

// ─── Page ────────────────────────────────────────────────────

export default function DiscoverPage() {
  const discover = useDiscoverResults();
  const { data: activeOrg } = useActiveOrganization();
  const [requestingPartnership, setRequestingPartnership] = useState<string | null>(null);
  const [partnershipRequested, setPartnershipRequested] = useState<Set<string>>(new Set());

  const handleRequestPartnership = useCallback(
    async (targetFirmId: string) => {
      if (!activeOrg?.id) return;
      const firmId = `firm_${activeOrg.id}`;
      setRequestingPartnership(targetFirmId);
      try {
        const res = await fetch("/api/partnerships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmId, targetFirmId }),
        });
        if (res.ok || res.status === 409) {
          setPartnershipRequested((prev) => new Set(prev).add(targetFirmId));
        }
      } catch {
        /* ignore */
      } finally {
        setRequestingPartnership(null);
      }
    },
    [activeOrg?.id]
  );

  if (!discover) return null;

  const { results, searching, searchQuery } = discover;
  const hasResults = results.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Discover Partners
          </h2>
          {hasResults ? (
            <p className="mt-0.5 text-sm text-cos-slate">
              {results.length} match{results.length === 1 ? "" : "es"}
              {searchQuery ? ` for "${searchQuery}"` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-cos-slate">
              AI-powered partner matching — just ask Ossy →
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

      {/* Content area */}
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
              <MatchCard
                key={match.firmId}
                match={match}
                index={i}
                onRequestPartnership={handleRequestPartnership}
                requesting={requestingPartnership === match.firmId}
                requested={partnershipRequested.has(match.firmId)}
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
