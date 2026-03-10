"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { Send, Mic, Loader2, Globe, FileText, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useProfile } from "@/hooks/use-profile";
import { useGuestData } from "@/hooks/use-guest-data";
import { cn } from "@/lib/utils";
import { ToolResultRenderer } from "@/components/chat/tool-result-renderer";

const GUEST_MESSAGE_LIMIT = 30;

/** Render basic inline markdown: **bold** and *italic* as React elements */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Split on **bold** and *italic* patterns
  const parts: React.ReactNode[] = [];
  // Match **bold**, then *italic* (order matters — bold first to avoid conflicts)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

/**
 * Detect whether a block of text looks like a call transcript.
 * Signals: timestamps (00:00 / 00:00:00), speaker labels (Name: or SPEAKER_01:),
 * and length > 400 characters. Needs 2+ signals to trigger.
 */
function looksLikeTranscript(text: string): boolean {
  if (text.length < 400) return false;
  let signals = 0;
  if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(text)) signals++; // timestamps
  if (/^[A-Z][A-Za-z\s]{1,30}:/m.test(text)) signals++; // speaker labels (e.g. "John:", "Host:")
  if (/\bSPEAKER_\d+\b/i.test(text)) signals++; // auto speaker labels
  if (text.split("\n").length > 10) signals++; // many lines
  return signals >= 2;
}

/** Simple URL regex — catches common website URLs in user messages */
const URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,10}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function extractUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  if (!matches) return null;
  // Filter out common false positives
  const real = matches.find(
    (m) =>
      m.includes(".") &&
      !m.startsWith("e.g.") &&
      !m.match(/^\d+\.\d+/) &&
      m.length > 5
  );
  return real || null;
}

/** Default welcome for guests / landing page — asks for firm domain */
const guestWelcomeMessages: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm Ossy, your AI growth consultant. Drop your firm's website or domain below and I'll start researching your company right away.",
      },
    ],
  },
];

/** Default welcome for authenticated post-onboarding users (before personalized greeting loads) */
const authWelcomeMessages: UIMessage[] = [
  {
    id: "welcome-auth",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Welcome back! I'm ready to help you discover partners and grow your business. Try searching for partners on the Discover page, or ask me anything about your partnership strategy.",
      },
    ],
  },
];

// ─── Onboarding question map (field → bolded question text) ────────
const ONBOARDING_QUESTIONS: { field: string; question: string }[] = [
  { field: "desiredPartnerServices", question: "what services would you love to bring in from a partner? Things you don't do in-house but your clients need?" },
  { field: "requiredPartnerIndustries", question: "what industry experience is critical when you're looking for a partner?" },
  { field: "idealPartnerClientSize", question: "what size companies do your ideal partners typically serve?" },
  { field: "preferredPartnerLocations", question: "where should your ideal partners be located? Or are you open to remote?" },
  { field: "preferredPartnerTypes", question: "what types of firms are you interested in partnering with?" },
  { field: "preferredPartnerSize", question: "what size partner firm do you prefer working with?" },
  { field: "idealProjectSize", question: "what project size does your ideal partner typically handle?" },
  { field: "typicalHourlyRates", question: "what hourly rate ranges are typical for partner subcontractors in your world?" },
  { field: "partnershipRole", question: "are you looking to find work through partners, share opportunities with others, or both?" },
];

interface ChatPanelProps {
  isGuest?: boolean;
  isOnboarding?: boolean;
  missingFields?: string[];
  answeredCount?: number;
  onRequestLogin?: () => void;
}

export function ChatPanel({ isGuest, isOnboarding, missingFields, answeredCount, onRequestLogin }: ChatPanelProps) {
  const { data: activeOrg } = useActiveOrganization();
  const {
    status: enrichmentStatus,
    contextForOssy,
    triggerEnrichment,
    isBrandDetected,
  } = useEnrichment();
  const { updateField: updateProfileField } = useProfile();
  const { guestPreferences, setGuestPreference, setGuestMessages, forceFlushToDb } = useGuestData();
  const [input, setInput] = useState("");
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [guestMessageCount, setGuestMessageCount] = useState(0);

  // ─── Detect returning guest with all 9 prefs (read directly from localStorage) ───
  // Must read from localStorage here because GuestDataProvider hasn't hydrated yet
  const PREF_FIELDS = [
    "desiredPartnerServices", "requiredPartnerIndustries", "idealPartnerClientSize",
    "preferredPartnerLocations", "preferredPartnerTypes", "preferredPartnerSize",
    "idealProjectSize", "typicalHourlyRates", "partnershipRole",
  ];
  const [allPrefsComplete] = useState(() => {
    if (!isGuest || typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem("cos_guest_preferences") || sessionStorage.getItem("cos_guest_preferences");
      if (!raw) return false;
      const prefs = JSON.parse(raw) as Record<string, unknown>;
      const count = PREF_FIELDS.filter((f) => {
        const v = prefs[f];
        return v != null && (Array.isArray(v) ? v.length > 0 : v !== "");
      }).length;
      return count >= 9;
    } catch { return false; }
  });

  const [showLoginPrompt, setShowLoginPrompt] = useState(allPrefsComplete);

  // For guests, restore saved messages from sessionStorage synchronously
  // so they're available before useChat initializes on first render.
  // BUT: if all 9 prefs are complete (returning guest), use a fixed welcome-back
  // message instead of trying to restore the old conversation.
  const welcomeBackMessages: UIMessage[] = [
    {
      id: "welcome-back",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Welcome back! All your preferences are saved and visible on your screen. The only step left is to **create a free account** to unlock partner matching — just click the button below.",
        },
      ],
    },
  ];

  // Build onboarding welcome dynamically based on what's already answered
  const onboardingWelcomeMessages: UIMessage[] = (() => {
    const answered = answeredCount ?? 0;
    const missing = missingFields ?? [];

    // Find the next unanswered question
    const nextQ = ONBOARDING_QUESTIONS.find((q) => missing.includes(q.field))
      ?? ONBOARDING_QUESTIONS[0]; // fallback to Q1

    let text: string;
    if (answered === 0) {
      // Fresh start — warm welcome + Q1
      text = `Welcome! I can see your firm data on the left. Let's set up your partner preferences -- just a few quick questions and you'll be all set.\n\nFirst up -- **${nextQ.question}**`;
    } else {
      // Returning user — acknowledge progress + next question
      text = `Welcome back! I can see you've already answered ${answered} of 9 partner preference questions -- nice progress! Let's pick up where we left off.\n\n**${nextQ.question}**`;
    }

    return [{
      id: "onboarding-welcome",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text }],
    }];
  })();

  const [initialMessages, setInitialMessages] = useState<UIMessage[]>(() => {
    // Guest flow: restore messages or show welcome-back
    if (isGuest && typeof window !== "undefined") {
      if (allPrefsComplete) return welcomeBackMessages;
      try {
        const saved = sessionStorage.getItem("cos_guest_messages");
        if (saved) {
          const msgs = JSON.parse(saved) as UIMessage[];
          if (msgs.length > 0) return msgs;
        }
      } catch { /* ignore */ }
      return guestWelcomeMessages;
    }
    // Authenticated onboarding: set correct welcome synchronously
    // (can't rely on async loadGreeting — useChat initializes from this value)
    if (!isGuest && isOnboarding) {
      return onboardingWelcomeMessages;
    }
    // Post-onboarding auth: show contextual default while personalized greeting loads
    return authWelcomeMessages;
  });
  // For guests and onboarding users, messages are set synchronously — no need to fetch greeting
  // For post-onboarding auth users, historyLoaded=false triggers loadGreeting for personalized greeting
  const [historyLoaded, setHistoryLoaded] = useState(isGuest || isOnboarding ? true : false);
  const enrichedUrlRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  // Track whether we've seen enrichment go through "loading" this session
  // (distinguishes fresh enrichment from restored/hydrated sessions)
  const enrichmentWasLoadingRef = useRef(enrichmentStatus === "loading");
  const enrichmentNudgeSentRef = useRef(false);
  // Whether we need to auto-continue (computed once on mount, never re-computed).
  // SKIP auto-continue if all 9 prefs are complete — the welcome-back message handles it.
  // Otherwise fires whenever there's a restored guest session with real conversation.
  const [needsAutoContinue] = useState(() => {
    if (!isGuest || allPrefsComplete) return false;
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("cos_guest_messages");
        if (saved) {
          const msgs = JSON.parse(saved) as UIMessage[];
          if (msgs.length > 1) {
            return true;
          }
        }
      } catch { /* ignore */ }
    }
    return false;
  });
  const autoContinueSentRef = useRef(false);

  const chatEndpoint = isGuest ? "/api/chat/guest" : "/api/chat";

  // ─── BUG FIX: Use ref for transport body so it's never stale ──────
  // useChat creates the Chat instance (and its transport) once via useRef.
  // If we pass body as a plain object, it freezes at the first-render values
  // and contextForOssy / guestPreferences are always null / {} on the server.
  // By passing body as a function that reads from a ref, each API call
  // gets the latest values.
  const transportBodyRef = useRef<Record<string, unknown>>({});

  // Keep the ref in sync with current state (runs on every render change)
  useEffect(() => {
    if (isGuest) {
      transportBodyRef.current = {
        websiteContext: contextForOssy,
        collectedPreferences: guestPreferences,
        isBrandDetected,
      };
    } else {
      transportBodyRef.current = {
        organizationId: activeOrg?.id ?? "",
        websiteContext: contextForOssy,
        conversationId: conversationIdRef.current,
      };
    }
  }, [isGuest, contextForOssy, guestPreferences, activeOrg?.id, isBrandDetected]);

  // Load greeting on mount — clean slate every session.
  // In onboarding mode: hardcoded onboarding welcome (skip greeting endpoint).
  // Post-onboarding: returning users get personalized greeting; new users get default.
  const loadGreeting = useCallback(async () => {
    if (isGuest) return;

    // Authenticated onboarding phase — skip the greeting API, use dynamic welcome
    if (isOnboarding) {
      setInitialMessages(onboardingWelcomeMessages);
      setHistoryLoaded(true);
      return;
    }

    try {
      const orgParam = activeOrg?.id ? `?organizationId=${activeOrg.id}` : "";

      // Try to get personalized greeting for returning users
      const greetingRes = await fetch(`/api/chat/greeting${orgParam}`);
      if (greetingRes.ok) {
        const { isReturning, greeting } = await greetingRes.json();
        if (isReturning && greeting) {
          // Clean slate with personalized greeting
          setInitialMessages([
            {
              id: "greeting",
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: greeting }],
            },
          ]);
          setHistoryLoaded(true);
          return;
        }
      }

      // Not a returning user — keep the authWelcomeMessages set synchronously
    } catch (err) {
      console.error("[ChatPanel] Failed to load greeting:", err);
    } finally {
      setHistoryLoaded(true);
    }
  }, [isGuest, isOnboarding, activeOrg?.id]);

  useEffect(() => {
    if (!historyLoaded) {
      loadGreeting();
    }
  }, [historyLoaded, loadGreeting]);

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      body: () => transportBodyRef.current,
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "submitted" || status === "streaming";
  const [stalled, setStalled] = useState(false);
  const lastMessageSnapshotRef = useRef("");

  // ─── Detect stalled responses ───────────────────────────────
  // Phase 1: "submitted" → no streaming starts within 25s
  // Phase 2: "streaming" → no new content arrives for 20s
  //   (catches mid-stream hangs during multi-step tool use)
  useEffect(() => {
    if (status === "submitted") {
      setStalled(false);
      const timer = setTimeout(() => setStalled(true), 25_000);
      return () => clearTimeout(timer);
    }
    if (status === "streaming") {
      // Capture current message state; if it doesn't change within 20s, we stalled
      const currentSnapshot = JSON.stringify(
        messages.slice(-1).map((m) => getMessageText(m))
      );

      // If content changed since last check, reset
      if (currentSnapshot !== lastMessageSnapshotRef.current) {
        lastMessageSnapshotRef.current = currentSnapshot;
        setStalled(false);
      }

      const timer = setTimeout(() => {
        const newSnapshot = JSON.stringify(
          messages.slice(-1).map((m) => getMessageText(m))
        );
        if (newSnapshot === lastMessageSnapshotRef.current) {
          setStalled(true);
        }
      }, 20_000);
      return () => clearTimeout(timer);
    }
    if (status === "ready") {
      setStalled(false);
      lastMessageSnapshotRef.current = "";
    }
  }, [status, messages]);

  // Auto-continue: if restored guest session ends with a user message,
  // send a single nudge so Ossy picks up where they left off
  useEffect(() => {
    if (needsAutoContinue && !autoContinueSentRef.current && isGuest && status === "ready") {
      autoContinueSentRef.current = true;
      const timer = setTimeout(() => {
        sendMessage({
          text: "Hey, I'm back — where were we?",
        });
      }, 800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ─── Auto-nudge Ossy when enrichment completes ──────────
  // Track when enrichment enters "loading" so we know this is a fresh run
  // (not a restored session where enrichment was already "done").
  useEffect(() => {
    if (enrichmentStatus === "loading") {
      enrichmentWasLoadingRef.current = true;
    }
  }, [enrichmentStatus]);

  // When enrichment finishes ("done") AND Ossy is idle ("ready"), send a
  // natural nudge so Ossy receives the enrichment context and can ask the
  // first follow-up question without the user having to type anything.
  // IMPORTANT: Guest-only — authenticated users get their greeting from the
  // greeting endpoint and should NOT receive this auto-nudge.
  useEffect(() => {
    if (
      isGuest &&
      enrichmentWasLoadingRef.current &&
      enrichmentStatus === "done" &&
      !enrichmentNudgeSentRef.current &&
      status === "ready"
    ) {
      enrichmentNudgeSentRef.current = true;
      const timer = setTimeout(() => {
        sendMessage({
          text: "The research just finished — I can see the data on my dashboard now!",
        });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isGuest, enrichmentStatus, status, sendMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);


  // Track guest messages for inline login prompt
  useEffect(() => {
    if (isGuest) {
      const userMessages = messages.filter((m) => m.role === "user");
      setGuestMessageCount(userMessages.length);
    }
  }, [messages, isGuest]);

  // Watch user messages for URLs and trigger enrichment.
  // Always check the LATEST user message for a new URL — if it differs from
  // the previously enriched URL, re-run enrichment (user may have corrected a typo).
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return;

    // Scan from newest to oldest — the latest URL wins
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const text = getMessageText(userMessages[i]);
      const url = extractUrl(text);
      if (url) {
        if (url !== enrichedUrlRef.current) {
          enrichedUrlRef.current = url;
          triggerEnrichment(url);
        }
        break;
      }
    }
  }, [messages, triggerEnrichment]);

  // Watch for tool results and push to ProfileProvider (auth) or GuestData (guest)
  // Also handles request_login tool to trigger sign-in modal
  // NOTE: AI SDK v6 tool parts may NOT have `toolCallId` — use msg.id+partIdx as dedup key
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
        const part = msg.parts[partIdx];
        // Check for any tool part with output available
        if (!part.type.startsWith("tool-") || !("state" in part) || part.state !== "output-available") continue;

        const toolName = part.type.slice(5); // "tool-update_profile" → "update_profile"
        // Generate a stable dedup key (toolCallId may not exist in AI SDK v6)
        const callId = ("toolCallId" in part && part.toolCallId)
          ? (part.toolCallId as string)
          : `${msg.id}-${partIdx}`;
        if (processedToolCallsRef.current.has(callId)) continue;
        processedToolCallsRef.current.add(callId);

        // Handle update_profile tool results
        if (toolName === "update_profile") {
          const output = (part as { output?: unknown }).output as
            | { success: boolean; field: string; value: string | string[] }
            | undefined;
          if (output?.success && output.field && output.value != null) {
            console.log(`[ChatPanel] Tool save detected: ${output.field} =`, output.value);
            if (isGuest) {
              // Guest mode: cache client-side for migration after auth
              setGuestPreference(output.field, output.value);

              // Auto-detect Q9 completion: if all 9 prefs are now filled,
              // trigger login prompt as client-side fallback (in case model
              // doesn't call request_login reliably after the tool result).
              const updatedPrefs = { ...guestPreferences, [output.field]: output.value };
              const filledCount = PREF_FIELDS.filter((f) => {
                const v = updatedPrefs[f];
                return v != null && (Array.isArray(v) ? v.length > 0 : v !== "");
              }).length;
              if (filledCount >= 9 && !showLoginPrompt) {
                console.log("[ChatPanel] All 9 guest preferences complete — auto-showing login prompt");
                forceFlushToDb();
                // Small delay so the congratulation text streams first
                setTimeout(() => {
                  setShowLoginPrompt(true);
                  onRequestLogin?.();
                }, 2000);
              }
            } else {
              // Auth mode: update profile state (already persisted server-side)
              updateProfileField(output.field, output.value);
            }
          }
        }

        // Handle request_login tool results (guest only)
        if (toolName === "request_login") {
          // Force-flush all preferences to DB before showing login
          forceFlushToDb();
          // Trigger the login modal
          setShowLoginPrompt(true);
          onRequestLogin?.();
        }
      }
    }
  }, [messages, updateProfileField, isGuest, setGuestPreference, onRequestLogin, forceFlushToDb]);

  // ─── Auto-continuation safety net ──────────────────────────
  // If Ossy saved a preference (tool result present) but didn't ask the
  // next question (no "?" in text), auto-nudge to keep the conversation
  // going. This catches the multi-step stall where the model generates
  // text+tool in step 1, then stops in step 2.
  const continuationSentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isGuest || status !== "ready" || messages.length < 3) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;

    // Check if this message has ANY tool save (update_profile completed)
    const hasToolSave = lastMsg.parts.some((p) => {
      // Match tool-update_profile with completed state
      if (p.type === "tool-update_profile" && "state" in p && p.state === "output-available") return true;
      // Also catch via startsWith in case type format varies
      if (p.type.startsWith("tool-") && "state" in p && (p as { state: string }).state === "output-available") {
        const toolName = p.type.slice(5);
        if (toolName === "update_profile") return true;
      }
      return false;
    });
    if (!hasToolSave) return;

    // Get ALL text from the message
    const fullText = lastMsg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
      .map((p) => p.text)
      .join("");

    // If the message text contains a question mark, Ossy asked the next
    // question — no nudge needed
    if (fullText.includes("?")) return;

    // Only nudge once per message ID
    if (continuationSentRef.current.has(lastMsg.id)) return;
    continuationSentRef.current.add(lastMsg.id);

    console.log("[ChatPanel] Auto-continuation: Ossy saved but didn't ask next question, nudging. Text:", fullText.slice(0, 80));
    const timer = setTimeout(() => {
      sendMessage({ text: "Got it, what's next?" });
    }, 800);
    return () => clearTimeout(timer);
  }, [messages, status, isGuest, sendMessage]);

  // Save guest messages for migration after auth
  useEffect(() => {
    if (isGuest && messages.length > 1) {
      setGuestMessages(messages);
    }
  }, [messages, isGuest, setGuestMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleAnalyseTranscript = () => {
    if (!pendingTranscript || isLoading) return;
    const wordCount = pendingTranscript.trim().split(/\s+/).length;
    // Send the transcript with a compact prefix — UI renders it as a card bubble
    sendMessage({ text: `[TRANSCRIPT:${wordCount}]\n${pendingTranscript}` });
    setPendingTranscript(null);
  };

  const atGuestLimit = isGuest && (showLoginPrompt || guestMessageCount >= GUEST_MESSAGE_LIMIT);

  // Re-focus input when assistant finishes responding (status → ready).
  // The textarea is disabled during loading, so focus is lost. Re-acquire it.
  useEffect(() => {
    if (status === "ready" && !atGuestLimit) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [status, atGuestLimit]);

  return (
    <div className="relative flex h-full flex-col bg-cos-midnight">
      {/* Header — compact for right column */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric to-cos-signal p-0.5">
          <Image
            src="/logo.png"
            alt="Ossy"
            width={28}
            height={28}
            className="h-full w-full rounded-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-sm font-semibold text-white">
            Ossy
          </h2>
          <p className="text-[10px] text-cos-signal">
            {status === "streaming"
              ? "Thinking..."
              : status === "submitted"
                ? "Sending..."
                : "Online"}
          </p>
        </div>
        {/* Enrichment status indicator */}
        {enrichmentStatus === "loading" && (
          <div className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5">
            <Globe className="h-3 w-3 animate-pulse text-cos-electric" />
            <span className="text-[10px] font-medium text-cos-electric">
              Researching...
            </span>
          </div>
        )}
        {enrichmentStatus === "done" && (
          <div className="flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5">
            <Globe className="h-3 w-3 text-cos-signal" />
            <span className="text-[10px] font-medium text-cos-signal">
              Analyzed
            </span>
          </div>
        )}
        {enrichmentStatus === "failed" && (
          <div className="flex items-center gap-1 rounded-cos-pill bg-cos-ember/10 px-2 py-0.5">
            <Globe className="h-3 w-3 text-cos-ember" />
            <span className="text-[10px] font-medium text-cos-ember">
              Not found
            </span>
          </div>
        )}
      </div>

      {/* Messages area — justify-end keeps messages anchored near the input when few */}
      <div
        ref={scrollRef}
        className="cos-scrollbar relative flex flex-1 flex-col justify-end overflow-y-auto bg-cos-midnight-light/30 px-4 py-4"
      >
        <div className="space-y-2">
        {messages.map((message, idx) => {
          const text = getMessageText(message);
          // Skip messages with no text content (e.g. tool-only responses)
          if (!text) return null;

          const prevMessage = idx > 0 ? messages[idx - 1] : null;
          const isNewSpeaker = !prevMessage || prevMessage.role !== message.role;

          return (
            <div
              key={message.id}
              className={cn(
                "flex gap-2",
                message.role === "user" && "flex-row-reverse",
                isNewSpeaker && idx > 0 && "mt-3"
              )}
            >
              {message.role === "assistant" && (
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20",
                    !isNewSpeaker && "invisible"
                  )}
                >
                  <Image
                    src="/logo.png"
                    alt="Ossy"
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] object-cover"
                  />
                </div>
              )}

              <div
                className={cn(
                  "rounded-cos-xl px-4 py-3",
                  message.role === "assistant"
                    ? "rounded-tl-cos-sm bg-white/95 text-cos-midnight shadow-sm"
                    : "ml-auto rounded-tr-cos-sm bg-cos-electric text-white"
                )}
              >
                {message.parts.map((part, partIdx) => {
                  if (part.type === "text" && part.text) {
                    // Compact card for transcript messages
                    const transcriptMatch = part.text.match(/^\[TRANSCRIPT:(\d+)\]/);
                    if (transcriptMatch) {
                      const wordCount = transcriptMatch[1];
                      return (
                        <div key={partIdx} className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 opacity-80" />
                          <span className="text-sm font-medium">Call transcript</span>
                          <span className="text-xs opacity-70">· {wordCount} words</span>
                        </div>
                      );
                    }
                    return (
                      <p
                        key={partIdx}
                        className="whitespace-pre-wrap text-sm leading-relaxed"
                      >
                        {renderInlineMarkdown(part.text)}
                      </p>
                    );
                  }
                  // AI SDK v6 uses part.type = "tool-<toolName>" (e.g. "tool-update_profile")
                  if (part.type.startsWith("tool-")) {
                    const toolPart = part as unknown as {
                      type: string;
                      toolCallId: string;
                      toolName: string;
                      args: Record<string, unknown>;
                      state: "call" | "partial-call" | "output-available";
                      output?: unknown;
                    };
                    // Extract tool name from part type (strip "tool-" prefix)
                    const toolName = part.type.slice(5);
                    return (
                      <div key={partIdx} className="my-2">
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
        })}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image
                src="/logo.png"
                alt="Ossy"
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-cover"
              />
            </div>
            <div className="rounded-cos-xl rounded-tl-cos-sm bg-white/95 px-4 py-3 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
            </div>
          </div>
        )}

        {(error || stalled) && (
          <div className="rounded-cos-xl border border-cos-ember/30 bg-cos-ember/10 px-4 py-3">
            <p className="text-sm font-medium text-cos-ember">
              {stalled ? "Ossy is taking too long — try sending your message again." : "Ossy hit a snag — try sending your message again."}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {error?.message || (stalled ? "The response timed out. This sometimes happens with longer conversations." : "Connection issue or timeout")}
            </p>
          </div>
        )}

        {/* Login prompt — appears in chat after onboarding complete or guest message limit */}
        {atGuestLimit && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image
                src="/logo.png"
                alt="Ossy"
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-cover"
              />
            </div>
            <div className="space-y-2">
              <div className="rounded-cos-xl rounded-tl-cos-sm bg-white/95 px-4 py-3 shadow-sm">
                <p className="text-sm leading-relaxed text-cos-midnight">
                  Your preferences are saved! Create a free account to unlock partner matching and continue your growth journey.
                </p>
                <button
                  onClick={() => onRequestLogin?.()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-cos-lg bg-cos-electric px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cos-electric-hover"
                >
                  Login Now
                </button>
              </div>
            </div>
          </div>
        )}
        </div>{/* close inner space-y-2 wrapper */}
      </div>

      {/* Transcript detection banner */}
      {pendingTranscript && (
        <div className="shrink-0 border-t border-cos-electric/20 bg-cos-electric/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cos-electric" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Call transcript detected</p>
              <p className="text-xs text-white/60 mt-0.5">
                {pendingTranscript.trim().split(/\s+/).length} words — want Ossy to extract opportunities from it?
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={handleAnalyseTranscript}
                disabled={isLoading}
                className="flex items-center gap-1 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-semibold text-white hover:bg-cos-electric-hover disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                Analyse
              </button>
              <button
                onClick={() => setPendingTranscript(null)}
                className="rounded-cos-lg p-1.5 text-cos-slate hover:text-cos-midnight"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-1.5 rounded-cos-xl border border-white/20 bg-white/95 px-3 py-1.5 shadow-lg transition-colors focus-within:border-cos-electric focus-within:ring-2 focus-within:ring-cos-electric/40">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                if (looksLikeTranscript(val)) {
                  setPendingTranscript(val);
                  setInput("");
                } else {
                  setInput(val);
                }
              }}
              onKeyDown={(e) => {
                // Submit on Enter (without Shift)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isLoading && !atGuestLimit) {
                    handleSubmit(e);
                  }
                }
              }}
              placeholder={
                atGuestLimit
                  ? "Sign in to keep chatting..."
                  : enrichmentStatus === "idle"
                    ? "Enter your firm's website to start..."
                    : "Ask Ossy anything..."
              }
              disabled={isLoading || atGuestLimit}
              rows={2}
              className="flex-1 resize-none appearance-none border-0 bg-transparent py-2 text-sm leading-relaxed text-cos-midnight shadow-none outline-none ring-0 placeholder:text-cos-slate focus:border-0 focus:outline-none focus:ring-0 disabled:opacity-50"
            />
            <div className="flex shrink-0 items-center gap-1 pb-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-cos-slate hover:text-cos-electric"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim() || atGuestLimit}
                className="h-8 w-8 shrink-0 bg-cos-electric text-white hover:bg-cos-electric-hover disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

