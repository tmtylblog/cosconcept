"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { Send, Mic, Loader2, Globe, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization, signIn, signUp } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useProfile } from "@/hooks/use-profile";
import { useGuestData } from "@/hooks/use-guest-data";
import { isPersonalEmail, CORPORATE_EMAIL_ERROR } from "@/lib/email-validation";
import { cn } from "@/lib/utils";
import { ToolResultRenderer } from "@/components/chat/tool-result-renderer";
import { ChatEnrichmentCards } from "@/components/chat/enrichment-cards";

const GUEST_MESSAGE_LIMIT = 30;

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

const defaultWelcomeMessages: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm Ossy, your AI growth consultant. I'd love to get to know you and your firm so I can start finding the right partners. While we chat, could you share your firm's website? I'll do some behind-the-scenes research so we can hit the ground running. Just drop the URL whenever you're ready \u2014 and in the meantime, tell me a bit about what you do!",
      },
    ],
  },
];

interface ChatPanelProps {
  isGuest?: boolean;
  onRequestLogin?: () => void;
}

export function ChatPanel({ isGuest, onRequestLogin }: ChatPanelProps) {
  const { data: activeOrg } = useActiveOrganization();
  const {
    status: enrichmentStatus,
    contextForOssy,
    triggerEnrichment,
  } = useEnrichment();
  const { updateField: updateProfileField } = useProfile();
  const { setGuestPreference, setGuestMessages } = useGuestData();
  const [input, setInput] = useState("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>(defaultWelcomeMessages);
  const [historyLoaded, setHistoryLoaded] = useState(isGuest ? true : false);
  const enrichedUrlRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>(crypto.randomUUID());

  const chatEndpoint = isGuest ? "/api/chat/guest" : "/api/chat";

  // Load greeting on mount — clean slate every session.
  // Returning users get a personalized greeting; new users get onboarding welcome.
  const loadGreeting = useCallback(async () => {
    if (isGuest) return;
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

      // Not a returning user — use default onboarding welcome
      // (initialMessages already set to defaultWelcomeMessages)
    } catch (err) {
      console.error("[ChatPanel] Failed to load greeting:", err);
    } finally {
      setHistoryLoaded(true);
    }
  }, [isGuest, activeOrg?.id]);

  useEffect(() => {
    if (!historyLoaded) {
      loadGreeting();
    }
  }, [historyLoaded, loadGreeting]);

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      body: isGuest
        ? { websiteContext: contextForOssy }
        : {
            organizationId: activeOrg?.id ?? "",
            websiteContext: contextForOssy,
            conversationId: conversationIdRef.current,
          },
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        // Handle update_profile tool results
        if (
          part.type === "tool-update_profile" &&
          "state" in part &&
          part.state === "output-available" &&
          "toolCallId" in part
        ) {
          const callId = part.toolCallId as string;
          if (processedToolCallsRef.current.has(callId)) continue;
          processedToolCallsRef.current.add(callId);

          const output = (part as { output?: unknown }).output as
            | { success: boolean; field: string; value: string | string[] }
            | undefined;
          if (output?.success && output.field && output.value != null) {
            if (isGuest) {
              // Guest mode: cache client-side for migration after auth
              setGuestPreference(output.field, output.value);
            } else {
              // Auth mode: update profile state (already persisted server-side)
              updateProfileField(output.field, output.value);
            }
          }
        }

        // Handle request_login tool results (guest only)
        if (
          part.type === "tool-request_login" &&
          "state" in part &&
          part.state === "output-available" &&
          "toolCallId" in part
        ) {
          const callId = part.toolCallId as string;
          if (processedToolCallsRef.current.has(callId)) continue;
          processedToolCallsRef.current.add(callId);

          // Trigger the login modal
          setShowLoginPrompt(true);
          onRequestLogin?.();
        }
      }
    }
  }, [messages, updateProfileField, isGuest, setGuestPreference, onRequestLogin]);

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

  const atGuestLimit = isGuest && (showLoginPrompt || guestMessageCount >= GUEST_MESSAGE_LIMIT);

  return (
    <div className="relative flex h-full flex-col">
      {/* Header — compact for right column */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-cos-border/50 px-4">
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
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">
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

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="cos-scrollbar relative flex-1 space-y-2 overflow-y-auto px-4 py-4"
      >
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
                    ? "rounded-tl-cos-sm bg-cos-surface-raised"
                    : "ml-auto rounded-tr-cos-sm bg-cos-electric text-white"
                )}
              >
                {message.parts.map((part, partIdx) => {
                  if (part.type === "text" && part.text) {
                    return (
                      <p
                        key={partIdx}
                        className="whitespace-pre-wrap text-sm leading-relaxed"
                      >
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type === "tool-invocation") {
                    return (
                      <div key={partIdx} className="my-2">
                        <ToolResultRenderer
                          toolInvocation={
                            part as unknown as {
                              type: "tool-invocation";
                              toolInvocationId: string;
                              toolName: string;
                              args: Record<string, unknown>;
                              state: "call" | "partial-call" | "result";
                              result?: unknown;
                            }
                          }
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

        {/* Inline enrichment cards — appear in chat flow as data arrives */}
        {enrichmentStatus !== "idle" && <ChatEnrichmentCards />}

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
            <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-cos-slate" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-cos-xl border border-cos-danger/20 bg-cos-danger/5 px-4 py-3">
            <p className="text-sm text-cos-danger">
              Something went wrong. Please try again.
            </p>
          </div>
        )}

        {/* Inline login — appears in chat after guest message limit */}
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
              <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-4 py-3">
                <p className="text-sm leading-relaxed text-cos-midnight">
                  I can already see some great partnership opportunities based on what you&apos;ve told me. Sign in below to save your preferences and start your growth journey — it takes 10 seconds.
                </p>
              </div>
              <InlineChatLogin />
            </div>
          </div>
        )}
      </div>

      {/* Input area — compact for right column */}
      <div className="shrink-0 border-t border-cos-border/50 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-1.5 rounded-cos-xl border border-cos-border bg-cos-cloud/80 px-3 py-0.5 transition-colors focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                atGuestLimit
                  ? "Sign in to keep chatting..."
                  : enrichmentStatus === "idle"
                    ? "Enter your firm's website to start..."
                    : "Ask Ossy anything..."
              }
              disabled={isLoading || atGuestLimit}
              className="flex-1 bg-transparent py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none disabled:opacity-50"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-cos-slate hover:text-cos-midnight"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim() || atGuestLimit}
              className="h-8 w-8 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Inline Chat Login ──────────────────────────────────────
// Renders Google OAuth + expandable email form directly in the chat flow.

function InlineChatLogin() {
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
    } catch {
      setError("Google sign-in failed. Try again.");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPersonalEmail(email)) {
      setError(CORPORATE_EMAIL_ERROR);
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        const res = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (res.error) {
          setError(res.error.message ?? "Sign up failed");
          return;
        }
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) {
          setError(res.error.message ?? "Sign in failed");
          return;
        }
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-cos-xl border border-cos-electric/20 bg-gradient-to-br from-cos-electric/5 to-cos-signal/5 p-3">
      <div className="space-y-2">
        {/* Google OAuth — primary */}
        <button
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs font-medium text-cos-midnight shadow-sm transition-colors hover:bg-cos-cloud"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        {/* Email toggle */}
        {!showEmail ? (
          <button
            onClick={() => setShowEmail(true)}
            className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border/50 bg-white/50 px-3 py-2 text-xs text-cos-slate transition-colors hover:bg-white hover:text-cos-midnight"
          >
            <Mail className="h-3.5 w-3.5" />
            Continue with email
          </button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-1.5">
            {isSignUp && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Work email (e.g., you@yourfirm.com)"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              required
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-cos-lg bg-cos-electric px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-cos-electric-hover disabled:opacity-50"
            >
              {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
            <p className="text-center text-[10px] text-cos-slate">
              {isSignUp ? "Have an account?" : "Need an account?"}{" "}
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
                className="text-cos-electric hover:underline"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </form>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-[10px] text-cos-danger">{error}</p>
      )}
    </div>
  );
}
