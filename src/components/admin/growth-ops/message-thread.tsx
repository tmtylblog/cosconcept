"use client";

import { useEffect, useRef } from "react";
import { Loader2, MessageSquare, Send, Zap } from "lucide-react";
import { Avatar } from "./avatar";
import type { Conversation, Message } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

interface MessageThreadProps {
  selectedConvo: Conversation | null;
  messages: Message[];
  loadingMessages: boolean;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSendReply: () => void;
  sending: boolean;
  isAllAccounts: boolean;
  convoAccountName: string;
  stageLabel?: string | null;
  stageColor?: string | null;
  onStartNew: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MessageThread({
  selectedConvo,
  messages,
  loadingMessages,
  messageText,
  onMessageTextChange,
  onSendReply,
  sending,
  isAllAccounts,
  convoAccountName,
  stageLabel,
  stageColor,
  onStartNew,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    }
  }, [messages]);

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!selectedConvo) {
    return (
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex flex-1 items-center justify-center text-cos-slate">
          <div className="text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a conversation</p>
            <button
              onClick={onStartNew}
              className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-cos-electric hover:underline"
            >
              <Zap className="h-3 w-3" /> Start a new one
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Thread view ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Thread header */}
      <div className="border-b border-cos-border px-5 py-3 flex items-center gap-3">
        <Avatar
          src={selectedConvo.participantAvatarUrl}
          name={selectedConvo.participantName}
          size={8}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-cos-midnight leading-tight">
              {selectedConvo.participantName || "LinkedIn Member"}
            </p>
            {stageLabel && stageColor && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white leading-none"
                style={{ backgroundColor: stageColor }}
              >
                {stageLabel}
              </span>
            )}
          </div>
          {selectedConvo.participantHeadline && (
            <p className="text-xs text-cos-slate leading-tight">
              {selectedConvo.participantHeadline}
            </p>
          )}
          {/* Show which account in merged view */}
          {isAllAccounts && convoAccountName && (
            <p className="text-[10px] text-cos-slate-dim mt-0.5">
              via <span className="font-medium">{convoAccountName}</span>
            </p>
          )}
        </div>
        {selectedConvo.participantProfileUrl && (
          <a
            href={selectedConvo.participantProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-cos-electric hover:underline"
          >
            View profile &rarr;
          </a>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 cos-scrollbar">
        {loadingMessages && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-end gap-2 ${m.is_sender ? "justify-end" : "justify-start"}`}
          >
            {/* Recipient avatar on inbound messages */}
            {!m.is_sender && (
              <Avatar
                src={selectedConvo.participantAvatarUrl}
                name={selectedConvo.participantName}
                size={6}
              />
            )}
            <div
              className={`rounded-2xl px-3.5 py-2 text-sm max-w-[72%] leading-relaxed ${
                m.is_sender
                  ? "bg-cos-electric text-white rounded-br-sm"
                  : "bg-cos-cloud text-cos-midnight rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
            {/* Sender account avatar on outbound messages */}
            {m.is_sender && (
              <Avatar
                name={convoAccountName || "Me"}
                size={6}
                className="opacity-60"
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      <div className="border-t border-cos-border px-4 py-3">
        {isAllAccounts && convoAccountName && (
          <p className="text-[10px] text-cos-slate-dim mb-1.5">
            Replying as{" "}
            <span className="font-medium text-cos-midnight">
              {convoAccountName}
            </span>
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={messageText}
            onChange={(e) => onMessageTextChange(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && onSendReply()
            }
            placeholder="Type a reply&hellip;"
            className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
          />
          <button
            onClick={onSendReply}
            disabled={sending || !messageText.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-cos-electric text-white disabled:opacity-40 hover:bg-cos-electric-hover transition-colors"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
