"use client";

import {
  Loader2,
  MessageSquare,
  PenSquare,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import { Avatar, AccountBadge } from "./avatar";
import type { Conversation, Account, Usage, QueueItem } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConversationFilter = "all" | "needs_reply" | "pending_approval";

interface ConversationListProps {
  conversations: Conversation[];
  selectedChatId: string;
  onSelectChat: (chatId: string) => void;
  isAllAccounts: boolean;
  loadingConvos: boolean;
  onNewMessage: () => void;
  queueItems: QueueItem[];
  onQueueAction: (id: string, action: "approve" | "reject") => void;
  filter: ConversationFilter;
  onFilterChange: (f: ConversationFilter) => void;
  accounts: Account[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  usage: Usage | null;
}

// ── Usage Meter ──────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  if (limit <= 0) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const color =
    pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-cos-electric";
  const textColor =
    pct >= 95
      ? "text-red-600"
      : pct >= 80
        ? "text-amber-600"
        : "text-cos-slate";
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-cos-slate">{label}</span>
        <span className={textColor}>
          {used}/{limit}
        </span>
      </div>
      <div className="h-1 rounded-full bg-cos-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Filter Pills ─────────────────────────────────────────────────────────────

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_reply", label: "Needs Reply" },
  { value: "pending_approval", label: "Pending" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function ConversationList({
  conversations,
  selectedChatId,
  onSelectChat,
  isAllAccounts,
  loadingConvos,
  onNewMessage,
  queueItems,
  onQueueAction,
  filter,
  onFilterChange,
  accounts,
  selectedAccountId,
  onSelectAccount,
  usage,
}: ConversationListProps) {
  const pendingItems = queueItems.filter((q) => q.status === "pending");

  console.warn(`[CONVO LIST] Render: ${conversations.length} convos, loading=${loadingConvos}, filter=${filter}`);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: account selector + new message */}
      <div className="border-b border-cos-border px-3 py-3 space-y-2.5">
        {/* Account dropdown */}
        {accounts.length > 0 && (
          <div className="relative">
            <select
              value={selectedAccountId}
              onChange={(e) => onSelectAccount(e.target.value)}
              className="w-full appearance-none rounded-cos-lg border border-cos-border bg-cos-surface pl-3 pr-8 py-1.5 text-sm text-cos-midnight font-medium focus:border-cos-electric focus:outline-none"
            >
              {accounts.length > 1 && (
                <option value="all">All Accounts</option>
              )}
              {accounts.map((a) => (
                <option key={a.unipileAccountId} value={a.unipileAccountId}>
                  {a.displayName || a.unipileAccountId}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cos-slate pointer-events-none" />
          </div>
        )}

        {/* Usage meters (single-account only) */}
        {usage && !isAllAccounts && (
          <div className="flex items-center gap-3">
            <UsageMeter
              label="Messages"
              used={usage.today.messagesSent}
              limit={usage.limits.dailyMessages}
            />
            <UsageMeter
              label="Invites"
              used={usage.today.invitesSent}
              limit={usage.limits.dailyInvites}
            />
            {usage.limits.monthlyInmails > 0 && (
              <UsageMeter
                label="InMails"
                used={usage.today.inmailsSent}
                limit={Math.ceil(usage.limits.monthlyInmails / 30)}
              />
            )}
          </div>
        )}

        {/* Filter pills + new message */}
        <div className="flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.value
                  ? "bg-cos-electric text-white"
                  : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
              }`}
            >
              {f.label}
              {f.value === "pending_approval" && pendingItems.length > 0 && (
                <span className="ml-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] text-white leading-none">
                  {pendingItems.length}
                </span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onNewMessage}
            title="New message"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-cos-electric text-white hover:bg-cos-electric-hover transition-colors"
          >
            <PenSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto cos-scrollbar">
        {/* Pending approval items */}
        {pendingItems.length > 0 && filter !== "needs_reply" && (
          <div className="border-b border-amber-200 bg-amber-50/60">
            <div className="px-3 py-1.5">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                Pending Approval
              </p>
            </div>
            {pendingItems.map((q) => (
              <div
                key={q.id}
                className="flex items-start gap-2 px-3 py-2 border-t border-amber-100"
              >
                <Avatar name={q.contactName} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-cos-midnight truncate">
                    {q.contactName || q.contactEmail || "Unknown"}
                  </p>
                  {q.companyName && (
                    <p className="text-[10px] text-cos-slate truncate">
                      {q.companyName}
                    </p>
                  )}
                  {q.messageText && (
                    <p className="text-[10px] text-cos-slate-dim truncate mt-0.5">
                      {q.messageText}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => onQueueAction(q.id, "approve")}
                      className="flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700 transition-colors"
                    >
                      <Check className="h-2.5 w-2.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => onQueueAction(q.id, "reject")}
                      className="flex items-center gap-1 rounded-full bg-cos-cloud px-2 py-0.5 text-[10px] font-medium text-cos-slate hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loadingConvos && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          </div>
        )}

        {/* Empty state */}
        {!loadingConvos && conversations.length === 0 && (
          <div className="p-6 text-center">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 text-cos-slate opacity-30" />
            <p className="text-xs text-cos-slate">No conversations yet.</p>
            <button
              onClick={onNewMessage}
              className="mt-3 text-xs text-cos-electric hover:underline"
            >
              Start one
            </button>
          </div>
        )}

        {/* Conversation rows */}
        {conversations.map((convo) => (
          <button
            key={`${convo._accountId}-${convo.chatId}`}
            onClick={() => onSelectChat(convo.chatId)}
            className={`w-full text-left px-3 py-3 border-b border-cos-border/50 transition-colors flex items-start gap-2.5 ${
              selectedChatId === convo.chatId
                ? "bg-cos-electric/8"
                : "hover:bg-cos-cloud"
            }`}
          >
            <div className="relative shrink-0">
              <Avatar
                src={convo.participantAvatarUrl}
                name={convo.participantName}
                size={36}
              />
              {/* Stage color dot */}
              {convo._stageColor && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                  style={{ backgroundColor: convo._stageColor }}
                  title={convo._stageLabel ?? ""}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-cos-midnight truncate leading-tight flex-1">
                  {convo.participantName || "LinkedIn Member"}
                </p>
                {convo.isInmailThread && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 leading-none">
                    InMail
                  </span>
                )}
                {convo.unreadCount > 0 && (
                  <span className="shrink-0 rounded-full bg-cos-electric px-1.5 py-0.5 text-[10px] font-medium text-white leading-none">
                    {convo.unreadCount}
                  </span>
                )}
              </div>
              {/* Account badge in merged view */}
              {isAllAccounts && convo._accountName && (
                <div className="mt-0.5">
                  <AccountBadge name={convo._accountName} />
                </div>
              )}
              {convo.participantHeadline && (
                <p className="text-[11px] text-cos-slate truncate leading-tight mt-0.5">
                  {convo.participantHeadline}
                </p>
              )}
              {convo.lastMessagePreview && (
                <p className="text-xs text-cos-slate-dim truncate mt-0.5">
                  {convo.lastMessagePreview}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
