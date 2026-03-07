"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { Send, Mic, Loader2, Globe, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization, signIn, signUp } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { isPersonalEmail, CORPORATE_EMAIL_ERROR } from "@/lib/email-validation";
import { cn } from "@/lib/utils";

const GUEST_MESSAGE_LIMIT = 5;

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

const initialMessages: UIMessage[] = [
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

export function ChatPanel({ isGuest, onRequestLogin: _onRequestLogin }: ChatPanelProps) {
  const { data: activeOrg } = useActiveOrganization();
  const {
    status: enrichmentStatus,
    contextForOssy,
    triggerEnrichment,
  } = useEnrichment();
  const [input, setInput] = useState("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const enrichedUrlRef = useRef<string | null>(null);

  const chatEndpoint = isGuest ? "/api/chat/guest" : "/api/chat";

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      body: isGuest
        ? { websiteContext: contextForOssy }
        : { organizationId: activeOrg?.id ?? "", websiteContext: contextForOssy },
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

  // Watch user messages for URLs and trigger shared enrichment
  useEffect(() => {
    if (enrichedUrlRef.current) return; // Already processing
    const userMessages = messages.filter((m) => m.role === "user");
    for (const msg of userMessages) {
      const text = getMessageText(msg);
      const url = extractUrl(text);
      if (url) {
        enrichedUrlRef.current = url;
        triggerEnrichment(url);
        break;
      }
    }
  }, [messages, triggerEnrichment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const atGuestLimit = isGuest && guestMessageCount >= GUEST_MESSAGE_LIMIT;

  return (
    <div className="relative flex h-full flex-col">
      {/* Decorative warm blur circles */}
      <div className="pointer-events-none absolute right-12 top-20 h-[200px] w-[200px] rounded-full bg-[#ffb070]/8 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-32 left-8 h-[150px] w-[150px] rounded-full bg-cos-signal/6 blur-[80px]" />

      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-cos-border/50 px-6">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric to-cos-signal p-0.5">
          <Image
            src="/logo.png"
            alt="Ossy"
            width={36}
            height={36}
            className="h-full w-full rounded-full object-cover"
          />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Ossy
          </h2>
          <p className="text-xs text-cos-signal">
            {status === "streaming"
              ? "Thinking..."
              : status === "submitted"
                ? "Sending..."
                : "Online"}
          </p>
        </div>
        {/* Enrichment status indicator */}
        {enrichmentStatus === "loading" && (
          <div className="flex items-center gap-1.5 rounded-cos-pill bg-cos-electric/10 px-3 py-1">
            <Globe className="h-3.5 w-3.5 animate-pulse text-cos-electric" />
            <span className="text-xs font-medium text-cos-electric">
              Researching website...
            </span>
          </div>
        )}
        {enrichmentStatus === "done" && (
          <div className="flex items-center gap-1.5 rounded-cos-pill bg-cos-signal/10 px-3 py-1">
            <Globe className="h-3.5 w-3.5 text-cos-signal" />
            <span className="text-xs font-medium text-cos-signal">
              Website analyzed
            </span>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="cos-scrollbar relative flex-1 space-y-2 overflow-y-auto px-6 py-6"
      >
        {messages.map((message, idx) => {
          const prevMessage = idx > 0 ? messages[idx - 1] : null;
          const isNewSpeaker = !prevMessage || prevMessage.role !== message.role;

          return (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" && "flex-row-reverse",
                isNewSpeaker && idx > 0 && "mt-4"
              )}
            >
              {message.role === "assistant" && (
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20",
                    !isNewSpeaker && "invisible"
                  )}
                >
                  <Image
                    src="/logo.png"
                    alt="Ossy"
                    width={24}
                    height={24}
                    className="h-6 w-6 object-cover"
                  />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[720px] rounded-cos-xl px-6 py-4",
                  message.role === "assistant"
                    ? "rounded-tl-cos-sm bg-cos-surface-raised"
                    : "ml-auto rounded-tr-cos-sm bg-cos-electric text-white"
                )}
              >
                <p className="whitespace-pre-wrap text-base leading-relaxed">
                  {getMessageText(message)}
                </p>
              </div>
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image
                src="/logo.png"
                alt="Ossy"
                width={24}
                height={24}
                className="h-6 w-6 object-cover"
              />
            </div>
            <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-6 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-cos-slate" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-cos-xl border border-cos-danger/20 bg-cos-danger/5 px-6 py-4">
            <p className="text-base text-cos-danger">
              Something went wrong. Please try again.
            </p>
          </div>
        )}

        {/* Inline login — appears in chat after guest message limit */}
        {atGuestLimit && (
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
              <Image
                src="/logo.png"
                alt="Ossy"
                width={24}
                height={24}
                className="h-6 w-6 object-cover"
              />
            </div>
            <div className="max-w-[720px] space-y-3">
              <div className="rounded-cos-xl rounded-tl-cos-sm bg-cos-surface-raised px-6 py-4">
                <p className="text-base leading-relaxed text-cos-midnight">
                  I can already see some great partnership opportunities based on what you&apos;ve told me. Sign in below to save your preferences and start your growth journey — it takes 10 seconds.
                </p>
              </div>
              <InlineChatLogin />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-cos-border/50 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud/80 px-4 py-1 transition-colors focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                atGuestLimit
                  ? "Sign in to keep chatting..."
                  : "Ask Ossy anything..."
              }
              disabled={isLoading || atGuestLimit}
              className="flex-1 bg-transparent py-3 text-base text-cos-midnight placeholder:text-cos-slate-light focus:outline-none disabled:opacity-50"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-cos-slate hover:text-cos-midnight"
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim() || atGuestLimit}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
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
    <div className="rounded-cos-xl border border-cos-electric/20 bg-gradient-to-br from-cos-electric/5 to-cos-signal/5 p-4">
      <div className="space-y-2.5">
        {/* Google OAuth — primary */}
        <button
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border bg-white px-4 py-2.5 text-sm font-medium text-cos-midnight shadow-sm transition-colors hover:bg-cos-cloud"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
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
            className="flex w-full items-center justify-center gap-2 rounded-cos-lg border border-cos-border/50 bg-white/50 px-4 py-2.5 text-sm text-cos-slate transition-colors hover:bg-white hover:text-cos-midnight"
          >
            <Mail className="h-4 w-4" />
            Continue with email
          </button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-2">
            {isSignUp && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Work email (e.g., you@yourfirm.com)"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              required
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-cos-lg bg-cos-electric px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cos-electric-hover disabled:opacity-50"
            >
              {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
            <p className="text-center text-xs text-cos-slate">
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
        <p className="mt-2 text-xs text-cos-danger">{error}</p>
      )}
    </div>
  );
}
