"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Image from "next/image";
import { Send, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const GUEST_MESSAGE_LIMIT = 5;

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

const initialMessages: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm Ossy, your AI growth consultant. I'm here to help you find the perfect partners for your firm. Tell me a bit about what you do \u2014 what services does your firm provide?",
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
  const [input, setInput] = useState("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);

  const chatEndpoint = isGuest ? "/api/chat/guest" : "/api/chat";

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: chatEndpoint,
      body: isGuest
        ? {}
        : { organizationId: activeOrg?.id ?? "" },
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

  // Track guest messages and trigger login prompt
  useEffect(() => {
    if (isGuest) {
      const userMessages = messages.filter((m) => m.role === "user");
      setGuestMessageCount(userMessages.length);

      if (userMessages.length >= GUEST_MESSAGE_LIMIT && onRequestLogin) {
        onRequestLogin();
      }
    }
  }, [messages, isGuest, onRequestLogin]);

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
        <div>
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
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="cos-scrollbar relative flex-1 space-y-6 overflow-y-auto px-6 py-6"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            {message.role === "assistant" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20">
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
                  : "rounded-tr-cos-sm bg-cos-electric text-white"
              )}
            >
              <p className="whitespace-pre-wrap text-base leading-relaxed">
                {getMessageText(message)}
              </p>
            </div>
          </div>
        ))}

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

        {/* Guest limit message */}
        {atGuestLimit && (
          <div className="mx-auto max-w-md rounded-cos-2xl border border-cos-electric/20 bg-gradient-to-br from-cos-electric/5 to-cos-signal/5 px-6 py-5 text-center">
            <p className="font-heading text-base font-semibold text-cos-midnight">
              Loving the conversation?
            </p>
            <p className="mt-1 text-sm text-cos-slate-dim">
              Create a free account to continue chatting, save your progress, and unlock partner matching.
            </p>
            <button
              onClick={onRequestLogin}
              className="mt-3 rounded-cos-pill bg-cos-electric px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-cos-electric-hover"
            >
              Create Free Account
            </button>
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
              placeholder={atGuestLimit ? "Sign in to keep chatting..." : "Ask Ossy anything..."}
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
