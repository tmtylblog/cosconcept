"use client";

import { useRef, useEffect, useCallback } from "react";
import { Sparkles, ArrowUp, MessageSquare, ArrowRight } from "lucide-react";
import { useDiscoverStream, type StreamItem } from "@/hooks/use-discover-stream";
import { useDiscoverResults, type DiscoverCandidate } from "@/hooks/use-discover-results";
import { ResultCardsBlock } from "@/components/discover/stream-blocks/result-cards-block";
import { FirmDetailBlock } from "@/components/discover/stream-blocks/firm-detail-block";
import { ExpertDetailBlock } from "@/components/discover/stream-blocks/expert-detail-block";

// ─── Conversation starters ───────────────────────────────────

const STARTERS = [
  "We keep getting requests outside our core \u2014 we need referral partners",
  "We\u2019re trying to break into a new industry but lack the credibility",
  "I need to find firms who complement us for a bigger client pitch",
  "We\u2019re a boutique losing deals to larger competitors \u2014 who can we team up with?",
];

function injectIntoChat(text: string) {
  window.dispatchEvent(new CustomEvent("cos:inject-chat", { detail: { text } }));
}

// ─── Content Feed (no chat, no input — just results + details) ──

export function DiscoverStream() {
  const stream = useDiscoverStream();
  const discover = useDiscoverResults();

  const discoverSearchQuery = discover?.searchQuery ?? "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // ─── Sticky "back to results" breadcrumb ─────────────────
  const resultsAnchorRef = useRef<HTMLDivElement>(null);

  // ─── Auto-scroll on new content or data loads ──────────────
  const streamUpdateCounter = stream?.updateCounter ?? 0;
  const streamItemCount = stream?.items.length ?? 0;
  const resultCount = discover?.results.length ?? 0;

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamItemCount, streamUpdateCounter, resultCount]);

  // ─── Handle card clicks — dispatch by entity type + scroll to detail ──
  const handleViewProfile = useCallback(
    (match: DiscoverCandidate) => {
      if (match.entityType === "expert") {
        stream?.pushExpertDetail(match.entityId, discoverSearchQuery, match.displayName);
      } else {
        stream?.pushFirmDetail(match.entityId, discoverSearchQuery, match.displayName);
      }
      // Force scroll to bottom where the new detail block will appear
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    [stream, discoverSearchQuery]
  );

  const handleViewExpert = useCallback(
    (legacyId: string, displayName: string) => {
      stream?.pushExpertDetail(legacyId, discoverSearchQuery, displayName);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    [stream, discoverSearchQuery]
  );

  const scrollToResults = useCallback(() => {
    resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (!discover) return null;

  const { results, searching, searchQuery, error } = discover;
  const streamItems = stream?.items ?? [];
  const hasResults = results.length > 0 || searching;
  const hasSearched = searchQuery.length > 0;
  const isIdle = !hasResults && !hasSearched && streamItems.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Stream area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {/* Idle state */}
          {isIdle && <IdleState />}

          {/* Error */}
          {error && (
            <div className="rounded-cos-xl border border-red-200 bg-red-50 p-6 text-center mb-4">
              <p className="text-sm font-medium text-red-700">Search failed</p>
              <p className="mt-1 text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Searching skeleton */}
          {searching && (
            <div className="space-y-3 mb-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-cos-lg bg-cos-cloud" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-36 rounded bg-cos-cloud" />
                      <div className="h-3 w-24 rounded bg-cos-cloud" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search results (only when not actively searching) */}
          {!searching && results.length > 0 && (
            <div ref={resultsAnchorRef} className="mb-4">
              <ResultCardsBlock
                results={results}
                query={searchQuery}
                onViewProfile={handleViewProfile}
              />
            </div>
          )}

          {/* No results (only after search completes with zero results) */}
          {hasSearched && !searching && results.length === 0 && !error && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-8 text-center mb-4">
              <p className="text-sm font-medium text-cos-midnight">No matches found</p>
              <p className="mt-1 text-xs text-cos-slate">
                Try telling Ossy more about what you need, or adjust your search.
              </p>
              <button
                onClick={() => injectIntoChat("Can you help me broaden my search?")}
                className="mt-3 text-xs text-cos-electric underline hover:text-cos-electric/80"
              >
                Ask Ossy for help
              </button>
            </div>
          )}

          {/* Stream items: firm details, expert details */}
          {streamItems.map((si) => {
            if (si.type === "results") return null; // Results rendered above from discover context
            if (si.type === "firm_detail") {
              return (
                <div key={si.id} className="mb-4">
                  <FirmDetailBlock
                    data={si.data}
                    loading={si.loading}
                    error={si.error}
                    searchQuery={si.searchQuery}
                    onViewExpert={handleViewExpert}
                  />
                </div>
              );
            }
            if (si.type === "expert_detail") {
              return (
                <div key={si.id} className="mb-4">
                  <ExpertDetailBlock
                    displayName={si.displayName}
                    data={si.data}
                    loading={si.loading}
                    error={si.error}
                    searchQuery={si.searchQuery}
                  />
                </div>
              );
            }
            return null;
          })}

          <div ref={bottomRef} className="h-1" />
        </div>
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
        Discover Your Network
      </h2>
      <p className="mt-2 max-w-sm text-sm text-cos-slate leading-relaxed">
        Tell Ossy what you&apos;re looking for and your results will appear here.
        The more context you give, the better the matches.
      </p>

      <div
        className="mt-6 flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-3 cursor-pointer hover:bg-cos-electric/10 transition-colors"
        onClick={() => injectIntoChat("Help me find the right partners")}
      >
        <MessageSquare className="h-4 w-4 text-cos-electric" />
        <span className="text-sm font-medium text-cos-electric">
          Start a conversation with Ossy
        </span>
        <ArrowRight className="h-4 w-4 text-cos-electric" />
      </div>

      <div className="mt-8 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cos-slate">
          Or try one of these
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
