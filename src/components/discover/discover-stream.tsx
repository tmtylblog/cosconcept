"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { Send, Loader2, Sparkles, ArrowUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { useOssyContext } from "@/hooks/use-ossy-context";
import { useDiscoverStream, type StreamItem } from "@/hooks/use-discover-stream";
import { useDiscoverResults, type DiscoverCandidate } from "@/hooks/use-discover-results";
import { ResultCardsBlock } from "@/components/discover/stream-blocks/result-cards-block";
import { FirmDetailBlock } from "@/components/discover/stream-blocks/firm-detail-block";
import { ExpertDetailBlock } from "@/components/discover/stream-blocks/expert-detail-block";
import { ToolResultRenderer } from "@/components/chat/tool-result-renderer";
import { generatePageContextPrompt } from "@/lib/ai/ossy-page-prompts";
import { formatEventsForOssy, type OssyPageEvent } from "@/lib/ossy-events";
import { cn } from "@/lib/utils";

// ─── Conversation starters ───────────────────────────────────

const STARTERS = [
  "We keep getting requests outside our core \u2014 we need referral partners",
  "We\u2019re trying to break into a new industry but lack the credibility",
  "I need to find firms who complement us for a bigger client pitch",
  "We\u2019re a boutique losing deals to larger competitors \u2014 who can we team up with?",
];

// ─── Inline markdown renderer ────────────────────────────────

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// ─── Welcome messages ─────────────────────────────────────────

const discoverWelcomeMessages: UIMessage[] = [
  {
    id: "discover-welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "I\u2019m your partnership scout. Tell me what kind of firms, experts, or capabilities you\u2019re looking for and I\u2019ll search the Collective OS network.\n\nThe more context you give me, the sharper the results. Try describing a specific need, a capability gap, or a deal you\u2019re trying to win.",
      },
    ],
  },
];

// ─── Merged stream item type ──────────────────────────────────

type MergedItem =
  | { kind: "message"; message: UIMessage; id: string }
  | { kind: "content"; item: StreamItem };

// ─── Main Component ───────────────────────────────────────────

export function DiscoverStream() {
  const { data: activeOrg } = useActiveOrganization();
  const { pageContext } = useOssyContext();
  const stream = useDiscoverStream();
  const discover = useDiscoverResults();

  // Destructure discover callbacks to avoid object-identity deps in effects
  const discoverSetResults = discover?.setResults;
  const discoverSetSearching = discover?.setSearching;
  const discoverSearchQuery = discover?.searchQuery ?? "";

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [input, setInput] = useState("");
  const conversationIdRef = useRef<string>(crypto.randomUUID());

  // Track which tool calls we've already intercepted (dedup key = toolCallId or msg.id+partIdx)
  const interceptedRef = useRef<Set<string>>(new Set());

  // ─── Sticky "back to results" breadcrumb ─────────────────
  const resultsAnchorRef = useRef<HTMLDivElement>(null);
  const [showBackToResults, setShowBackToResults] = useState(false);

  // IntersectionObserver to show breadcrumb when most recent results scroll out of view
  useEffect(() => {
    if (!resultsAnchorRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowBackToResults(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(resultsAnchorRef.current);
    return () => observer.disconnect();
  }, [stream?.items.length]);

  // ─── Transport body (always fresh via ref) ────────────────
  const transportBodyRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    const pageContextPrompt = generatePageContextPrompt(pageContext);
    transportBodyRef.current = {
      organizationId: activeOrg?.id ?? "",
      conversationId: conversationIdRef.current,
      firmSection: "discover",
      pageContext: pageContextPrompt || undefined,
    };
  }, [activeOrg?.id, pageContext]);

  // ─── useChat ──────────────────────────────────────────────
  const { messages, sendMessage, status } = useChat({
    messages: discoverWelcomeMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => transportBodyRef.current,
    }),
  });

  // ─── Intercept discover_search results from chat → push to stream ──
  useEffect(() => {
    if (!stream) return;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
        const part = msg.parts[partIdx];
        if (
          part.type.startsWith("tool-") &&
          (part.type === "tool-discover_search" || part.type === "tool-search_partners")
        ) {
          const toolPart = part as unknown as {
            toolCallId?: string;
            state: string;
            args?: { query?: string };
            output?: { candidates?: DiscoverCandidate[]; totalFound?: number };
          };

          // Generate stable dedup key (toolCallId may not exist in AI SDK v6)
          const callId = toolPart.toolCallId ?? `${msg.id}-${partIdx}`;

          if (toolPart.state === "output-available" && !interceptedRef.current.has(callId)) {
            interceptedRef.current.add(callId);
            const candidates = toolPart.output?.candidates ?? [];
            const query = toolPart.args?.query ?? "";

            // Always clear searching state
            discoverSetSearching?.(false);

            // Push results to stream (even if empty — shows empty state)
            stream.pushResults(candidates, query);
            discoverSetResults?.(candidates, query);
          }

          // Signal searching state while tool is in progress
          if (toolPart.state !== "output-available" && !interceptedRef.current.has(callId)) {
            discoverSetSearching?.(true);
          }
        }
      }
    }
  }, [messages, stream, discoverSetResults, discoverSetSearching]);

  // ─── Auto-scroll — triggers on new messages, new items, AND item data loads ──
  const streamUpdateCounter = stream?.updateCounter ?? 0;
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, stream?.items.length, streamUpdateCounter]);

  // ─── Ossy page event: Effect 1 — LISTENER (just queues, never re-registers) ──
  const eventQueueRef = useRef<OssyPageEvent[]>([]);
  const lastProactiveRef = useRef<number>(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const event = (e as CustomEvent<OssyPageEvent>).detail;
      if (!event?.type) return;
      eventQueueRef.current.push(event);
    };
    window.addEventListener("cos:page-event", handler);
    return () => window.removeEventListener("cos:page-event", handler);
  }, []); // No deps — registers once, never re-registers

  // ─── Ossy page event: Effect 2 — POLLING FLUSH (sends when ready) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const queue = eventQueueRef.current;
      if (queue.length === 0) return;

      // Don't send while Ossy is busy
      if (status === "submitted" || status === "streaming") return;

      // Check cooldown — discover events use shorter 2s cooldown
      const hasDiscoverEvent = queue.some(
        (e) => e.type === "discover_firm_viewed" || e.type === "discover_expert_viewed"
      );
      const cooldown = hasDiscoverEvent ? 2000 : 30000;
      if (Date.now() - lastProactiveRef.current < cooldown) return;

      // Flush
      const eventsToSend = [...queue];
      eventQueueRef.current = [];
      lastProactiveRef.current = Date.now();

      const eventText = formatEventsForOssy(eventsToSend);
      sendMessage({ text: eventText });
    }, 2000); // Poll every 2s (faster than ChatPanel's 3s — discover events are user-triggered)

    return () => clearInterval(interval);
  }, [status, sendMessage]);

  // ─── Handle card clicks — dispatch by entity type ──────────
  const handleViewProfile = useCallback(
    (match: DiscoverCandidate) => {
      if (match.entityType === "expert") {
        stream?.pushExpertDetail(match.entityId, discoverSearchQuery, match.displayName);
      } else {
        // firm and case_study both use firm detail view
        stream?.pushFirmDetail(match.entityId, discoverSearchQuery, match.displayName);
      }
    },
    [stream, discoverSearchQuery]
  );

  const handleViewExpert = useCallback(
    (legacyId: string, displayName: string) => {
      stream?.pushExpertDetail(legacyId, discoverSearchQuery, displayName);
    },
    [stream, discoverSearchQuery]
  );

  // ─── Send message handler ────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || status !== "ready") return;
    setInput("");
    sendMessage({ text: trimmed });
  }, [input, status, sendMessage]);

  // ─── Merge messages + stream items by timeline ─────────────
  // Stream items are pushed after specific assistant messages (tool results).
  // We interleave them: for each assistant message that triggered a tool call,
  // we insert the corresponding stream items right after it.
  const mergedItems: MergedItem[] = [];
  const streamItems = stream?.items ?? [];
  let streamIdx = 0;

  for (const msg of messages) {
    mergedItems.push({ kind: "message", message: msg, id: msg.id });

    // After each assistant message, insert any stream items that were created
    // during or shortly after this message (heuristic: check if this message
    // contains a discover_search tool result that we intercepted)
    if (msg.role === "assistant") {
      const hasSearchTool = msg.parts.some(
        (p) => p.type === "tool-discover_search" || p.type === "tool-search_partners"
      );
      if (hasSearchTool) {
        // Insert the next "results" stream item
        while (streamIdx < streamItems.length && streamItems[streamIdx].type === "results") {
          mergedItems.push({ kind: "content", item: streamItems[streamIdx] });
          streamIdx++;
          break; // one results block per search message
        }
      }
    }
  }

  // Append remaining stream items (firm details, expert details, subsequent results)
  while (streamIdx < streamItems.length) {
    mergedItems.push({ kind: "content", item: streamItems[streamIdx] });
    streamIdx++;
  }

  // ─── Idle state detection ─────────────────────────────────
  const hasSearched = discoverSearchQuery.length > 0;
  const isIdle = messages.length <= 1 && streamItems.length === 0 && !hasSearched;

  const scrollToResults = useCallback(() => {
    resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Find the last results block index for the ref
  let lastResultsIdx = -1;
  for (let i = mergedItems.length - 1; i >= 0; i--) {
    if (mergedItems[i].kind === "content" && (mergedItems[i] as { kind: "content"; item: StreamItem }).item.type === "results") {
      lastResultsIdx = i;
      break;
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sticky breadcrumb */}
      {showBackToResults && streamItems.some((i) => i.type === "results") && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-cos-border/50 bg-white/90 backdrop-blur-sm px-4 py-2">
          <button
            onClick={scrollToResults}
            className="flex items-center gap-1.5 text-xs font-medium text-cos-electric hover:text-cos-electric-hover transition-colors"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Back to results
          </button>
        </div>
      )}

      {/* Stream area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex min-h-full flex-col justify-end">
            <div className="space-y-4">
              {/* Idle state */}
              {isIdle && <IdleState onStarterClick={(text) => {
                setInput("");
                sendMessage({ text });
              }} />}

              {/* Merged content */}
              {!isIdle && mergedItems.map((item, idx) => {
                if (item.kind === "message") {
                  return (
                    <MessageBubble
                      key={item.id}
                      message={item.message}
                    />
                  );
                }

                const si = item.item;
                if (si.type === "results") {
                  return (
                    <div key={si.id} ref={idx === lastResultsIdx ? resultsAnchorRef : undefined}>
                      <ResultCardsBlock
                        results={si.results}
                        query={si.query}
                        onViewProfile={handleViewProfile}
                      />
                    </div>
                  );
                }
                if (si.type === "firm_detail") {
                  return (
                    <FirmDetailBlock
                      key={si.id}
                      data={si.data}
                      loading={si.loading}
                      error={si.error}
                      searchQuery={si.searchQuery}
                      onViewExpert={handleViewExpert}
                    />
                  );
                }
                if (si.type === "expert_detail") {
                  return (
                    <ExpertDetailBlock
                      key={si.id}
                      displayName={si.displayName}
                      data={si.data}
                      loading={si.loading}
                      error={si.error}
                      searchQuery={si.searchQuery}
                    />
                  );
                }
                return null;
              })}
            </div>
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>
      </div>

      {/* Chat input — pinned at bottom */}
      <div className="shrink-0 border-t border-cos-border/50 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tell Ossy what you're looking for..."
                rows={1}
                className="w-full resize-none rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 pr-10 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
                style={{ minHeight: "44px", maxHeight: "120px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || status !== "ready"}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-cos-xl bg-cos-electric hover:bg-cos-electric-hover disabled:opacity-40"
            >
              {status === "streaming" || status === "submitted" ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Send className="h-4 w-4 text-white" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-cos-slate-light">
            Ossy searches the Collective OS knowledge graph in real time
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Idle State ───────────────────────────────────────────────

function IdleState({ onStarterClick }: { onStarterClick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-cos-2xl bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
        <Sparkles className="h-7 w-7 text-cos-electric" />
      </div>

      <h2 className="mt-5 font-heading text-lg font-bold text-cos-midnight">
        Discover Your Network
      </h2>
      <p className="mt-2 max-w-sm text-sm text-cos-slate leading-relaxed">
        Tell Ossy what you&apos;re looking for. Results, firm details, and
        expert profiles all appear right here in the conversation.
      </p>

      <div className="mt-8 w-full max-w-lg">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cos-slate">
          Try one of these
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => onStarterClick(starter)}
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

// ─── Message Bubble ──────────────────────────────────────────

function MessageBubble({
  message,
}: {
  message: UIMessage;
}) {
  const text = getMessageText(message);
  const hasToolParts = message.parts.some((p) => p.type.startsWith("tool-"));
  if (!text && !hasToolParts) return null;

  return (
    <div
      className={cn(
        "flex gap-3",
        message.role === "user" && "flex-row-reverse"
      )}
    >
      {message.role === "assistant" && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/15 to-cos-signal/15 mt-0.5">
          <Image
            src="/logo.png"
            alt="Ossy"
            width={22}
            height={22}
            className="h-[22px] w-[22px] object-cover"
          />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-cos-xl px-4 py-3",
          message.role === "assistant"
            ? "rounded-tl-cos-sm bg-white border border-cos-border/50 text-cos-midnight shadow-sm"
            : "ml-auto rounded-tr-cos-sm bg-cos-electric text-white"
        )}
      >
        {message.parts.map((part, partIdx) => {
          if (part.type === "text" && part.text) {
            return (
              <p key={partIdx} className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderInlineMarkdown(part.text)}
              </p>
            );
          }
          // Tool parts: show compact indicator for discover_search
          if (part.type.startsWith("tool-")) {
            const toolPart = part as unknown as {
              type: string;
              toolCallId?: string;
              toolName?: string;
              args?: Record<string, unknown>;
              state: string;
              output?: unknown;
            };
            const toolName = part.type.slice(5);

            if (toolName === "discover_search" || toolName === "search_partners") {
              if (toolPart.state === "output-available") {
                const output = toolPart.output as { candidates?: unknown[]; totalFound?: number } | undefined;
                const count = output?.candidates?.length ?? 0;
                return (
                  <div key={partIdx} className="my-1.5">
                    <div className="flex items-center gap-1.5 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 px-3 py-1.5">
                      <Search className="h-3 w-3 text-cos-electric" />
                      <span className="text-xs font-medium text-cos-electric">
                        {count > 0 ? `${count} match${count === 1 ? "" : "es"} found` : "No matches found"}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={partIdx} className="my-1.5">
                  <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
                    <span className="text-xs font-medium text-cos-electric">Searching the network...</span>
                  </div>
                </div>
              );
            }

            // Other tools: use ToolResultRenderer
            return (
              <div key={partIdx} className="my-1.5">
                <ToolResultRenderer
                  toolInvocation={{
                    type: "tool-invocation",
                    toolInvocationId: toolPart.toolCallId || `${message.id}-${partIdx}`,
                    toolName,
                    args: toolPart.args || {},
                    state: toolPart.state === "output-available" ? "result" : "call",
                    result: toolPart.output,
                  }}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
