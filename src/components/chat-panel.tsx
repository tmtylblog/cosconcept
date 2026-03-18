"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Send, Mic, Loader2, Globe, FileText, X, Sparkles, Zap, Radio, Users, BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useProfile } from "@/hooks/use-profile";
import { useGuestData } from "@/hooks/use-guest-data";
import { useOssyContext } from "@/hooks/use-ossy-context";
import { cn } from "@/lib/utils";
import { ToolResultRenderer } from "@/components/chat/tool-result-renderer";
import { generatePageContextPrompt, getProactiveNavMessage } from "@/lib/ai/ossy-page-prompts";
import { formatEventsForOssy, type OssyPageEvent } from "@/lib/ossy-events";
import type { CosSignal } from "@/lib/cos-signal";

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

/** Discover mode welcome — shown when user navigates to /discover */
const discoverWelcomeMessages: UIMessage[] = [
  {
    id: "welcome-discover",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm your partner scout. Tell me what kind of firm you're looking for — a specific capability, industry, or type — and I'll find the best matches from the network.",
      },
    ],
  },
];

// ─── Onboarding question map (field → bolded question text) ────────
// v2 flow: 5 questions (new users)
const ONBOARDING_QUESTIONS_V2: { field: string; question: string }[] = [
  { field: "partnershipPhilosophy", question: "when you think about partnerships, are you looking to extend the breadth of your services, deepen existing capabilities, or open doors to new opportunities?" },
  { field: "capabilityGaps", question: "what capabilities or services do you wish you could offer clients but can't today? What gaps would the right partner fill?" },
  { field: "preferredPartnerTypes", question: "what types of firms are you interested in partnering with?" },
  { field: "dealBreaker", question: "what's a deal-breaker for you in a potential partner? Something that would make you walk away?" },
  { field: "geographyPreference", question: "does geography matter for your partnerships? Do you prefer local, regional, national, or are you fully remote-friendly?" },
];

// v1 flow: 9 questions (legacy, kept for backward compat)
const ONBOARDING_QUESTIONS_V1: { field: string; question: string }[] = [
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

// Active question set for new onboarding — use v2
const ONBOARDING_QUESTIONS = ONBOARDING_QUESTIONS_V2;

interface DiscoverResult {
  entityType: "firm" | "expert" | "case_study";
  entityId: string;
  firmId: string;
  displayName: string;
  firmName: string;
  matchScore: number;
  explanation: string;
  categories: string[];
  skills: string[];
  industries: string[];
  website?: string;
  caseStudyCount?: number;
  specialistTitle?: string;
  specialistProfileCount?: number;
  subtitle?: string;
  contributorCount?: number;
  summary?: string;
  sourceUrl?: string;
  clientName?: string;
}

interface ChatPanelProps {
  isGuest?: boolean;
  isOnboarding?: boolean;
  missingFields?: string[];
  answeredCount?: number;
  firmSection?: string | null;
  onRequestLogin?: () => void;
  onSearchResults?: (results: DiscoverResult[], query: string, searchIntent?: "partner" | "expertise" | "evidence") => void;
  onSearchStart?: () => void;
}

export function ChatPanel({ isGuest, isOnboarding, missingFields, answeredCount, firmSection, onRequestLogin, onSearchResults, onSearchStart }: ChatPanelProps) {
  const router = useRouter();
  const { data: activeOrg } = useActiveOrganization();
  const pathname = usePathname();
  const {
    status: enrichmentStatus,
    contextForOssy,
    triggerEnrichment,
    isBrandDetected,
  } = useEnrichment();
  const { updateField: updateProfileField } = useProfile();
  const { guestPreferences, setGuestPreference, setGuestMessages, forceFlushToDb } = useGuestData();
  const { pageContext, currentPageMode } = useOssyContext();
  const [input, setInput] = useState("");
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);

  // ─── Transcript tip + extraction state ────────────────────────────────
  const [showTranscriptTip, setShowTranscriptTip] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cos_transcript_tip_dismissed") !== "true";
  });

  interface ExtractedOpp {
    id: string;
    title: string;
    description: string;
    evidence: string | null;
    signalType: string;
    priority: string;
    resolutionApproach: string;
    requiredCategories: string[];
    requiredSkills: string[];
    estimatedValue: string | null;
    timeline: string | null;
    clientName: string | null;
  }

  interface MatchResult {
    opportunityId: string;
    opportunityTitle: string;
    experts: { profileId: string; expertName: string | null; firmName: string | null; profileTitle: string | null; matchedSkills: string[]; source: "own" | "partner" }[];
    caseStudies: { exampleId: string; title: string | null; description: string | null; firmName: string | null; matchedSkills: string[]; source: "own" | "partner" }[];
  }

  const [transcriptResult, setTranscriptResult] = useState<
    null | { loading: true } | { opportunities: ExtractedOpp[]; transcriptId: string }
  >(null);
  const [matchResult, setMatchResult] = useState<
    null | { loading: true; scope: string } | { scope: string; matches: MatchResult[] }
  >(null);
  const [guestMessageCount, setGuestMessageCount] = useState(0);

  // ─── Detect returning guest with all preferences complete (v2 or v1) ───
  // Must read from localStorage here because GuestDataProvider hasn't hydrated yet
  const V2_PREF_FIELDS = [
    "partnershipPhilosophy", "capabilityGaps", "preferredPartnerTypes",
    "dealBreaker", "geographyPreference",
  ];
  const V1_PREF_FIELDS = [
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
      const hasPref = (f: string) => {
        const v = prefs[f];
        return v != null && (Array.isArray(v) ? v.length > 0 : v !== "");
      };
      // Complete if ALL v2 fields filled OR ALL v1 fields filled
      const v2Done = V2_PREF_FIELDS.every(hasPref);
      const v1Done = V1_PREF_FIELDS.every(hasPref);
      return v2Done || v1Done;
    } catch { return false; }
  });

  const [showLoginPrompt, setShowLoginPrompt] = useState(allPrefsComplete);

  // For guests, restore saved messages from sessionStorage synchronously
  // so they're available before useChat initializes on first render.
  // BUT: if all preferences are complete (returning guest), use a fixed welcome-back
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
      text = `Welcome back! I can see you've already answered ${answered} of ${ONBOARDING_QUESTIONS.length} partner preference questions -- nice progress! Let's pick up where we left off.\n\n**${nextQ.question}**`;
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
    // Discover mode: show partner scout welcome
    if (firmSection === "discover") {
      return discoverWelcomeMessages;
    }
    // Post-onboarding auth: show contextual default while personalized greeting loads
    return authWelcomeMessages;
  });
  // For guests, onboarding users, and discover mode, messages are set synchronously — no need to fetch greeting
  // For post-onboarding auth users, historyLoaded=false triggers loadGreeting for personalized greeting
  const [historyLoaded, setHistoryLoaded] = useState(isGuest || isOnboarding || firmSection === "discover" ? true : false);
  // Prevent duplicate greeting fetches: activeOrg?.id changing recreates loadGreeting,
  // which re-triggers the effect. The ref ensures only the first call actually fires.
  const greetingFetchedRef = useRef(false);
  const enrichedUrlRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  // Track whether we've seen enrichment go through "loading" this session
  // (distinguishes fresh enrichment from restored/hydrated sessions)
  const enrichmentWasLoadingRef = useRef(enrichmentStatus === "loading");
  const enrichmentNudgeSentRef = useRef(false);
  // Whether we need to auto-continue (computed once on mount, never re-computed).
  // SKIP auto-continue if all preferences are complete — the welcome-back message handles it.
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
      const pageContextPrompt = generatePageContextPrompt(pageContext);
      transportBodyRef.current = {
        organizationId: activeOrg?.id ?? "",
        websiteContext: contextForOssy,
        conversationId: conversationIdRef.current,
        firmSection: firmSection ?? undefined,
        pageContext: pageContextPrompt || undefined,
        pageMode: currentPageMode ?? undefined,
      };
    }
  }, [isGuest, contextForOssy, guestPreferences, activeOrg?.id, isBrandDetected, firmSection, pageContext, currentPageMode]);

  // Load conversation history on mount for authenticated users.
  // If a recent conversation exists (< 24h), restore it so follow-ups have context.
  // Otherwise fall back to personalized greeting or default welcome.
  // greetingFetchedRef prevents duplicate fetches when activeOrg?.id changes mid-load.
  const loadHistory = useCallback(async () => {
    if (isGuest || greetingFetchedRef.current) return;
    greetingFetchedRef.current = true;

    // Authenticated onboarding phase — skip history, use dynamic welcome
    if (isOnboarding) {
      setInitialMessages(onboardingWelcomeMessages);
      setHistoryLoaded(true);
      return;
    }

    try {
      const orgParam = activeOrg?.id ? `?organizationId=${activeOrg.id}` : "";

      // Try to load recent conversation history
      const convRes = await fetch(`/api/conversations${orgParam}`);
      if (convRes.ok) {
        const data = await convRes.json();
        if (data.conversation && data.messages?.length > 0) {
          // Sync conversation ID from server — fixes duplicate conversation bug
          conversationIdRef.current = data.conversation.id;

          // Convert DB messages to UIMessage[] format for useChat
          const restored: UIMessage[] = data.messages.map((m: { id: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ type: "text" as const, text: m.content }],
          }));

          setInitialMessages(restored);
          setHistoryLoaded(true);
          return;
        }
      }

      // No recent conversation — try personalized greeting for returning users
      const greetingRes = await fetch(`/api/chat/greeting${orgParam}`);
      if (greetingRes.ok) {
        const { isReturning, greeting } = await greetingRes.json();
        if (isReturning && greeting) {
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
      console.error("[ChatPanel] Failed to load history:", err);
    } finally {
      setHistoryLoaded(true);
    }
  }, [isGuest, isOnboarding, activeOrg?.id]);

  useEffect(() => {
    if (!historyLoaded) {
      loadHistory();
    }
  }, [historyLoaded, loadHistory]);

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      body: () => transportBodyRef.current,
    }),
  });

  // ─── COS signal listener (nav + action signals) ─────────────
  const signalQueueRef = useRef<CosSignal[]>([]);
  const pendingNavRef = useRef<{ page: string; ts: number } | null>(null);
  const lastSignalRef = useRef<number>(0);
  const navProactiveFiredRef = useRef<Set<string>>(new Set());

  // Use refs for volatile values so the event listener doesn't re-register
  const statusRef = useRef(status);
  statusRef.current = status;
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Listen for cos:signal events — stable handler, never re-registers
  useEffect(() => {
    if (isGuest || isOnboarding) return;

    const handler = (e: Event) => {
      const signal = (e as CustomEvent<CosSignal>).detail;
      if (!signal?.kind) return;

      if (signal.kind === "nav") {
        // Queue nav signal — process on timer so page context can catch up
        if (!navProactiveFiredRef.current.has(signal.page)) {
          pendingNavRef.current = { page: signal.page, ts: Date.now() };
        }
      } else if (signal.kind === "action") {
        signalQueueRef.current.push(signal);
      }
    };

    window.addEventListener("cos:signal", handler);
    return () => window.removeEventListener("cos:signal", handler);
  }, [isGuest, isOnboarding]); // Stable deps — no re-registration on status/sendMessage changes

  // Unified signal processor — handles both nav and action signals on a timer
  useEffect(() => {
    if (isGuest || isOnboarding) return;

    const interval = setInterval(() => {
      const currentStatus = statusRef.current;
      if (currentStatus === "submitted" || currentStatus === "streaming") return;

      // ── Process pending nav signal ──
      const pendingNav = pendingNavRef.current;
      if (pendingNav) {
        const elapsed = Date.now() - pendingNav.ts;
        // Wait 1.5s for page context to settle, then send
        if (elapsed >= 1500) {
          pendingNavRef.current = null;
          const pageMode = pendingNav.page;

          if (!navProactiveFiredRef.current.has(pageMode)) {
            const proactiveMsg = getProactiveNavMessage(
              pageMode as import("@/lib/cos-signal").PageMode,
              pageContextRef.current,
            );
            if (proactiveMsg) {
              navProactiveFiredRef.current.add(pageMode);
              sendMessageRef.current({ text: `[CONTEXT_SIGNAL] Navigated to ${pageMode}: ${proactiveMsg}` });
              return; // One message per tick to avoid flooding
            }
          }
        }
      }

      // ── Process action signal queue ──
      const queue = signalQueueRef.current;
      if (queue.length === 0) return;

      // Cooldown: 2s for discover, 5s for others
      const isDiscover = queue.some((s) => s.kind === "action" && s.page === "discover");
      const cooldown = isDiscover ? 2000 : 5000;
      if (Date.now() - lastSignalRef.current < cooldown) return;

      // Dedup by action + entityId within the batch
      const seen = new Set<string>();
      const deduped = queue.filter((s) => {
        if (s.kind !== "action") return false;
        const key = `${s.action}:${s.entityId ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      signalQueueRef.current = [];
      if (deduped.length === 0) return;

      lastSignalRef.current = Date.now();

      // Format and send as context signal messages
      const lines = deduped.map((s) => {
        if (s.kind !== "action") return "";
        const parts = [`${s.action} on ${s.page}`];
        if (s.displayName) parts.push(s.displayName);
        if (s.entityType && s.entityId) parts.push(`(${s.entityType}:${s.entityId})`);
        return parts.join(": ");
      }).filter(Boolean);

      sendMessageRef.current({ text: `[CONTEXT_SIGNAL] ${lines.join("; ")}` });
    }, 1000);

    return () => clearInterval(interval);
  }, [isGuest, isOnboarding]); // Stable deps — reads current values from refs

  // ─── Ossy page event listener + auto-send (legacy) ─────────
  const eventQueueRef = useRef<OssyPageEvent[]>([]);
  const lastProactiveRef = useRef<number>(0);
  const proactiveFiredForSectionRef = useRef<string | null>(null);
  const sessionTipsShownRef = useRef<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = sessionStorage.getItem("cos_ossy_tips_shown");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // Reset proactive tracking on page navigation
  useEffect(() => {
    proactiveFiredForSectionRef.current = null;
  }, [firmSection]);

  // Listen for cos:page-event custom events
  useEffect(() => {
    if (isGuest || isOnboarding) return;

    const handler = (e: Event) => {
      const event = (e as CustomEvent<OssyPageEvent>).detail;
      if (!event?.type) return;
      eventQueueRef.current.push(event);
    };

    window.addEventListener("cos:page-event", handler);
    return () => window.removeEventListener("cos:page-event", handler);
  }, [isGuest, isOnboarding]);

  // Process event queue — flush when idle + throttled
  useEffect(() => {
    if (isGuest || isOnboarding) return;

    // On discover page, poll faster (2s) for responsive commentary
    const isDiscover = firmSection === "discover";
    const pollMs = isDiscover ? 2000 : 3000;

    const interval = setInterval(() => {
      const queue = eventQueueRef.current;
      if (queue.length === 0) return;

      // Don't send if Ossy is busy (streaming/submitted)
      if (status === "submitted" || status === "streaming") return;

      // Check if queue has priority events (discover nav + partner matching prefs)
      const hasDiscoverNavEvent = queue.some(
        (e) => e.type === "discover_firm_viewed" || e.type === "discover_expert_viewed"
      );
      const hasPriorityEvent = hasDiscoverNavEvent || queue.some(
        (e) => e.type === "partner_matching_needs_prefs" || e.type === "partner_matches_loaded"
      );

      // Cooldown: 2s for priority events, 30s for general page events
      const cooldown = hasPriorityEvent ? 2000 : 30_000;
      if (Date.now() - lastProactiveRef.current < cooldown) return;

      // For non-priority events: only one proactive comment per page visit
      if (!hasPriorityEvent) {
        const currentSection = firmSection ?? "unknown";
        if (proactiveFiredForSectionRef.current === currentSection) {
          eventQueueRef.current = [];
          return;
        }
      }

      // For non-priority events: check session dedup
      if (!hasPriorityEvent) {
        const eventTypes = queue.map((e) => e.type);
        const allShown = eventTypes.every((t) => (sessionTipsShownRef.current as Set<string>).has(t));
        if (allShown) {
          eventQueueRef.current = [];
          return;
        }
      }

      // For non-priority events: don't interrupt mid-conversation
      if (!hasPriorityEvent && messages.length > 3) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "user") {
          return;
        }
      }

      // Flush the queue
      const eventsToSend = [...queue];
      eventQueueRef.current = [];

      const eventMessage = formatEventsForOssy(eventsToSend);
      lastProactiveRef.current = Date.now();

      if (!hasDiscoverNavEvent) {
        const currentSection = firmSection ?? "unknown";
        proactiveFiredForSectionRef.current = currentSection;

        // Track shown tips in session (only for non-discover events)
        for (const e of eventsToSend) {
          (sessionTipsShownRef.current as Set<string>).add(e.type);
        }
        try {
          sessionStorage.setItem(
            "cos_ossy_tips_shown",
            JSON.stringify([...(sessionTipsShownRef.current as Set<string>)])
          );
        } catch { /* ignore */ }
      }

      // Auto-send as a user message (Ossy will respond naturally)
      sendMessage({ text: eventMessage });
    }, pollMs);

    return () => clearInterval(interval);
  }, [isGuest, isOnboarding, status, firmSection, messages, sendMessage]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
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

  // ─── Auto-trigger Ossy on partner-matching page with incomplete prefs ──
  const partnerMatchingNudgeSentRef = useRef(false);
  useEffect(() => {
    // Reset when leaving partner-matching page
    if (firmSection !== "partner-matching") {
      partnerMatchingNudgeSentRef.current = false;
      return;
    }
    // Only fire once, when Ossy is ready, and page context shows incomplete prefs
    if (
      !isGuest &&
      !isOnboarding &&
      firmSection === "partner-matching" &&
      pageContext?.page === "partner-matching" &&
      !pageContext.prefsComplete &&
      pageContext.missingFields.length > 0 &&
      !partnerMatchingNudgeSentRef.current &&
      status === "ready"
    ) {
      partnerMatchingNudgeSentRef.current = true;
      const timer = setTimeout(() => {
        sendMessage({
          text: `I'm on the Partner Matching page and I need to set up my partner preferences before I can see matches. The missing fields are: ${pageContext.missingFields.join(", ")}. Can you help me fill these in?`,
        });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isGuest, isOnboarding, firmSection, pageContext, status, sendMessage]);

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptResult, matchResult]);

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

              // Auto-detect completion: if all preferences are now filled (v2 or v1),
              // trigger login prompt as client-side fallback (in case model
              // doesn't call request_login reliably after the tool result).
              const updatedPrefs = { ...guestPreferences, [output.field]: output.value };
              const hasPref = (f: string) => {
                const v = updatedPrefs[f];
                return v != null && (Array.isArray(v) ? v.length > 0 : v !== "");
              };
              const allV2Done = V2_PREF_FIELDS.every(hasPref);
              const allV1Done = V1_PREF_FIELDS.every(hasPref);
              if ((allV2Done || allV1Done) && !showLoginPrompt) {
                console.log("[ChatPanel] All guest preferences complete — auto-showing login prompt");
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
          // Delay before showing login modal so the user can read Ossy's
          // explanation (e.g., why a brand/client is being directed to login
          // instead of continuing the onboarding flow)
          setTimeout(() => {
            setShowLoginPrompt(true);
            onRequestLogin?.();
          }, 4000);
        }

        // Handle discover_search (and legacy search_partners) — push to discover panel
        if ((toolName === "discover_search" || toolName === "search_partners") && onSearchResults) {
          const output = (part as { output?: unknown }).output as
            | { candidates?: DiscoverResult[]; totalFound?: number; searchIntent?: "partner" | "expertise" | "evidence" }
            | undefined;
          const args = (part as { args?: { query?: string } }).args;
          if (output?.candidates) {
            onSearchResults(output.candidates, args?.query ?? "", output.searchIntent);
          }
        }

        // Handle navigate_section tool results (authenticated firm pages)
        if (toolName === "navigate_section") {
          const output = (part as { output?: unknown }).output as
            | { success: boolean; navigateTo: string }
            | undefined;
          if (output?.success && output.navigateTo) {
            router.push(output.navigateTo);
          }
        }
      }
    }
  }, [messages, updateProfileField, isGuest, setGuestPreference, onRequestLogin, forceFlushToDb, router, onSearchResults]);

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
    // Always scroll to bottom when user sends a message
    isNearBottomRef.current = true;
    sendMessage({ text: input });
    setInput("");
    // Keep focus in the textarea (before the next render disables it)
    inputRef.current?.focus();
  };

  const handleAnalyseTranscript = async () => {
    if (!pendingTranscript || isLoading) return;
    const transcript = pendingTranscript;
    setTranscriptResult({ loading: true });
    setPendingTranscript(null);
    setMatchResult(null);

    // Increment dismissal counter — hide tip after 2 uses
    const countKey = "cos_transcript_tip_count";
    const count = parseInt(localStorage.getItem(countKey) ?? "0") + 1;
    localStorage.setItem(countKey, String(count));
    if (count >= 2) {
      localStorage.setItem("cos_transcript_tip_dismissed", "true");
      setShowTranscriptTip(false);
    }

    try {
      const res = await fetch("/api/opportunities/extract-from-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, organizationId: activeOrg?.id ?? undefined }),
      });
      const data = await res.json() as { opportunities?: ExtractedOpp[]; transcriptId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setTranscriptResult({ opportunities: data.opportunities ?? [], transcriptId: data.transcriptId ?? "" });
    } catch (err) {
      console.error("[ChatPanel] Transcript extraction failed:", err);
      setTranscriptResult(null);
    }
  };

  const handleFindMatches = async (scope: "own" | "partners" | "both") => {
    if (!transcriptResult || "loading" in transcriptResult || transcriptResult.opportunities.length === 0) return;
    setMatchResult({ loading: true, scope });
    try {
      const res = await fetch("/api/opportunities/find-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityIds: transcriptResult.opportunities.map((o) => o.id),
          scope,
          organizationId: activeOrg?.id ?? undefined,
        }),
      });
      const data = await res.json() as { matches?: MatchResult[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Matching failed");
      setMatchResult({ scope, matches: data.matches ?? [] });
    } catch (err) {
      console.error("[ChatPanel] Find matches failed:", err);
      setMatchResult(null);
    }
  };

  const atGuestLimit = isGuest && (showLoginPrompt || guestMessageCount >= GUEST_MESSAGE_LIMIT);

  // ─── Inject chat text from discover page starters ────────────
  // The discover page dispatches "cos:inject-chat" events with starter text.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (!text) return;
      setInput(text);
      // Auto-submit after a short delay so user sees the text first
      setTimeout(() => {
        sendMessage({ text });
        setInput("");
      }, 150);
    };
    window.addEventListener("cos:inject-chat", handler);
    return () => window.removeEventListener("cos:inject-chat", handler);
  }, [sendMessage]);

  // Re-focus input when assistant finishes responding (status → ready).
  // The textarea is disabled during loading, so focus is lost. Re-acquire it.
  useEffect(() => {
    if (status === "ready" && !atGuestLimit) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [status, atGuestLimit]);

  // Signal the discover panel to show skeleton loading as soon as Ossy
  // starts calling discover_search (before results arrive).
  // AI SDK v6 states: "input-streaming" | "input-available" (in-progress),
  // "output-available" (completed). Trigger loading on any non-completed state.
  useEffect(() => {
    if (!onSearchStart) return;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (
          (part.type === "tool-discover_search" || part.type === "tool-search_partners") &&
          "state" in part &&
          (part as { state: string }).state !== "output-available"
        ) {
          onSearchStart();
          return;
        }
      }
    }
  }, [messages, onSearchStart]);

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

      {/* Messages area — min-h-full inner wrapper anchors messages to bottom
          when few, but lets content grow beyond the container height so
          overflow-y-auto actually scrolls. */}
      <div
        ref={scrollRef}
        className="cos-scrollbar flex-1 overflow-y-auto bg-cos-midnight-light/30"
        onScroll={(e) => {
          const el = e.currentTarget;
          isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        <div className="flex min-h-full flex-col justify-end px-4 py-4">
        <div className="space-y-2">
        {messages.map((message, idx) => {
          const text = getMessageText(message);

          // Hide [PAGE_EVENT] and [CONTEXT_SIGNAL] messages from user view — they're system context for Ossy
          if (message.role === "user" && (text.startsWith("[PAGE_EVENT]") || text.startsWith("[CONTEXT_SIGNAL]"))) return null;

          // Show messages that have text OR tool parts (tool-only messages show
          // the in-progress search indicator while discover_search is running).
          // Without this, the loading spinner disappears as soon as the model
          // starts calling a tool, leaving a blank gap until results arrive.
          const hasToolParts = message.parts.some((p) => p.type.startsWith("tool-"));
          if (!text && !hasToolParts) return null;

          // On discover page, if a message has ONLY completed discover_search tool parts
          // and no text, skip it entirely — results are in the center panel.
          // This prevents blank chat bubbles.
          if (firmSection === "discover" && !text && hasToolParts) {
            const allPartsHandled = message.parts.every((p) => {
              if (p.type === "text") return !p.text; // empty text
              if (p.type.startsWith("tool-")) {
                const tp = p as unknown as { state: string };
                const tn = p.type.slice(5);
                return (tn === "discover_search" || tn === "search_partners") && tp.state === "output-available";
              }
              return true;
            });
            if (allPartsHandled) return null;
          }

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

                    // On the discover page, search results go to the middle panel.
                    // Hide completed result cards (user sees results in center panel).
                    // Show searching indicator while tool is in progress.
                    if (firmSection === "discover" && (toolName === "discover_search" || toolName === "search_partners")) {
                      if (toolPart.state === "output-available") {
                        // Results are visible in center panel — don't show anything in chat
                        return null;
                      }
                      return (
                        <div key={partIdx} className="my-2">
                          <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 px-3 py-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
                            <span className="text-xs font-medium text-cos-electric">Searching the network...</span>
                          </div>
                        </div>
                      );
                    }

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

        {/* ── Transcript extraction results ───────────────────────────────── */}
        {transcriptResult && (
          <div className="flex gap-2 mt-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image src="/logo.png" alt="Ossy" width={18} height={18} className="h-[18px] w-[18px] object-cover" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {"loading" in transcriptResult ? (
                <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
                    <span className="text-sm text-cos-slate">Reading the transcript and extracting opportunities…</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
                    <p className="text-sm text-cos-midnight">
                      {transcriptResult.opportunities.length === 0
                        ? "I went through the transcript but didn't spot any clear client opportunities. This might be a more internal or informational call — try one from a client conversation where you discussed their business or upcoming work."
                        : `I found ${transcriptResult.opportunities.length} ${transcriptResult.opportunities.length === 1 ? "opportunity" : "opportunities"} in this transcript worth exploring:`}
                    </p>
                  </div>

                  {transcriptResult.opportunities.map((opp) => (
                    <div key={opp.id} className="rounded-cos-xl rounded-tl-cos-sm border border-cos-border bg-white px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-cos-midnight leading-snug">{opp.title}</p>
                        <span className={cn(
                          "shrink-0 rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          opp.priority === "high" ? "bg-cos-ember/10 text-cos-ember" :
                          opp.priority === "low" ? "bg-cos-slate/10 text-cos-slate" :
                          "bg-cos-electric/10 text-cos-electric"
                        )}>
                          {opp.priority}
                        </span>
                      </div>
                      <p className="text-xs text-cos-slate leading-relaxed">{opp.description}</p>
                      {opp.evidence && (
                        <p className="text-xs italic text-cos-slate/80 border-l-2 border-cos-electric/30 pl-2 leading-relaxed">
                          &ldquo;{opp.evidence}&rdquo;
                        </p>
                      )}
                      {(opp.requiredCategories.length > 0 || opp.requiredSkills.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {[...opp.requiredCategories, ...opp.requiredSkills].slice(0, 5).map((tag) => (
                            <span key={tag} className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">{tag}</span>
                          ))}
                        </div>
                      )}
                      {(opp.estimatedValue || opp.timeline) && (
                        <div className="flex items-center gap-3 text-[10px] text-cos-slate">
                          {opp.estimatedValue && <span>💰 {opp.estimatedValue}</span>}
                          {opp.timeline && <span>🗓 {opp.timeline}</span>}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Match search prompt */}
                  {transcriptResult.opportunities.length > 0 && !matchResult && (
                    <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3 space-y-3">
                      <p className="text-sm text-cos-midnight">
                        Want me to search for relevant expertise or case studies that could help you close these? I can look across your own team or your partner network:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleFindMatches("own")}
                          className="flex items-center gap-1.5 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/10 transition-colors"
                        >
                          <BookOpen className="h-3 w-3" />
                          My expertise &amp; case studies
                        </button>
                        <button
                          onClick={() => handleFindMatches("partners")}
                          className="flex items-center gap-1.5 rounded-cos-lg border border-cos-slate/20 bg-cos-cloud px-3 py-1.5 text-xs font-medium text-cos-slate hover:bg-cos-surface-raised transition-colors"
                        >
                          <Users className="h-3 w-3" />
                          Partner experience
                        </button>
                        <button
                          onClick={() => handleFindMatches("both")}
                          className="flex items-center gap-1.5 rounded-cos-lg border border-cos-signal/30 bg-cos-signal/5 px-3 py-1.5 text-xs font-medium text-cos-signal hover:bg-cos-signal/10 transition-colors"
                        >
                          <Search className="h-3 w-3" />
                          Search everything
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Match results ────────────────────────────────────────────────── */}
        {matchResult && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image src="/logo.png" alt="Ossy" width={18} height={18} className="h-[18px] w-[18px] object-cover" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {"loading" in matchResult ? (
                <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
                    <span className="text-sm text-cos-slate">
                      Searching {matchResult.scope === "own" ? "your team" : matchResult.scope === "partners" ? "partner firms" : "your full network"}…
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
                    <p className="text-sm text-cos-midnight">
                      {matchResult.matches.every((m) => m.experts.length === 0 && m.caseStudies.length === 0)
                        ? `I searched ${matchResult.scope === "own" ? "your team" : matchResult.scope === "partners" ? "your partner network" : "your full network"} but couldn't find direct matches for these opportunities yet. Try adding more specialist profiles and case studies to improve coverage.`
                        : `Here's what I found in ${matchResult.scope === "own" ? "your team" : matchResult.scope === "partners" ? "your partner network" : "your full network"}:`}
                    </p>
                  </div>
                  {matchResult.matches.map((match) => {
                    if (match.experts.length === 0 && match.caseStudies.length === 0) return null;
                    return (
                      <div key={match.opportunityId} className="rounded-cos-xl rounded-tl-cos-sm border border-cos-border bg-white px-4 py-3 space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-cos-slate">{match.opportunityTitle}</p>
                        {match.experts.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
                              <Users className="h-3 w-3" /> Expertise ({match.experts.length})
                            </p>
                            {match.experts.map((ex) => (
                              <div key={ex.profileId} className="rounded-cos-lg bg-cos-cloud px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-cos-midnight truncate">{ex.expertName ?? ex.profileTitle ?? "Expert"}</p>
                                  <span className={cn(
                                    "shrink-0 rounded-cos-pill px-1.5 py-0.5 text-[9px] font-medium",
                                    ex.source === "own" ? "bg-cos-electric/10 text-cos-electric" : "bg-cos-signal/10 text-cos-signal"
                                  )}>
                                    {ex.source === "own" ? "Own team" : ex.firmName ?? "Partner"}
                                  </span>
                                </div>
                                {ex.profileTitle && ex.expertName && (
                                  <p className="text-[10px] text-cos-slate mt-0.5">{ex.profileTitle}</p>
                                )}
                                {ex.matchedSkills.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {ex.matchedSkills.slice(0, 3).map((s) => (
                                      <span key={s} className="rounded-cos-pill bg-cos-electric/10 px-1.5 py-0.5 text-[9px] text-cos-electric">{s}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {match.caseStudies.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
                              <BookOpen className="h-3 w-3" /> Case Studies ({match.caseStudies.length})
                            </p>
                            {match.caseStudies.map((cs) => (
                              <div key={cs.exampleId} className="rounded-cos-lg bg-cos-cloud px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-cos-midnight truncate">{cs.title ?? "Case Study"}</p>
                                  <span className={cn(
                                    "shrink-0 rounded-cos-pill px-1.5 py-0.5 text-[9px] font-medium",
                                    cs.source === "own" ? "bg-cos-electric/10 text-cos-electric" : "bg-cos-signal/10 text-cos-signal"
                                  )}>
                                    {cs.source === "own" ? "Own team" : cs.firmName ?? "Partner"}
                                  </span>
                                </div>
                                {cs.description && (
                                  <p className="mt-0.5 text-[10px] text-cos-slate leading-relaxed line-clamp-2">{cs.description}</p>
                                )}
                                {cs.matchedSkills.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {cs.matchedSkills.slice(0, 3).map((s) => (
                                      <span key={s} className="rounded-cos-pill bg-cos-signal/10 px-1.5 py-0.5 text-[9px] text-cos-signal">{s}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

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
        </div>{/* close space-y-2 */}
        </div>{/* close min-h-full inner wrapper */}
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

      {/* Transcript tip — visible to authenticated users after onboarding, until dismissed (after 2 uses) */}
      {showTranscriptTip && !isGuest && !isOnboarding && !pendingTranscript && !transcriptResult && !pathname.startsWith("/firm") && (
        <div className="shrink-0 border-t border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-cos-full bg-cos-electric/10">
              <Zap className="h-3 w-3 text-cos-electric" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-cos-midnight">Paste a client call transcript to find hidden opportunities</p>
              <p className="mt-0.5 text-[11px] text-cos-slate leading-relaxed">
                After a call where you discussed a client&apos;s business or upcoming work, paste the transcript here — Ossy will extract every opportunity and match them against your team&apos;s expertise and partner network.
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.setItem("cos_transcript_tip_dismissed", "true");
                setShowTranscriptTip(false);
              }}
              className="shrink-0 rounded p-0.5 text-cos-slate hover:text-cos-midnight transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-1.5 rounded-cos-xl border border-white/20 bg-white/95 px-3 py-1.5 shadow-lg">
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

