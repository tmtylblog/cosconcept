"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Mail,
  Inbox,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  X,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  firmId: string;
  emailType: string;
  toEmails: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  confidence: number | null;
  status: string;
  context: { partnershipId?: string; opportunityId?: string; reason?: string } | null;
  createdAt: string;
}

interface EmailMessage {
  id: string;
  threadId: string;
  direction: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText: string | null;
  extractedIntent: string | null;
  confidence: number | null;
  createdAt: string;
}

type Tab = "pending" | "sent" | "received";

const INTENT_COLORS: Record<string, string> = {
  opportunity: "bg-cos-warm/10 text-cos-warm",
  follow_up: "bg-cos-signal/10 text-cos-signal",
  question: "bg-cos-electric/10 text-cos-electric",
  context: "bg-cos-slate/10 text-cos-slate",
  intro_response: "bg-cos-midnight/10 text-cos-midnight",
  unrelated: "bg-cos-ember/10 text-cos-ember",
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminEmailPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [pendingItems, setPendingItems] = useState<QueueItem[]>([]);
  const [sentItems, setSentItems] = useState<EmailMessage[]>([]);
  const [receivedItems, setReceivedItems] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [editBody, setEditBody] = useState<string>("");
  const [actionPending, setActionPending] = useState<string | null>(null);

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/admin/email/queue?tab=${t}`);
    const data = await res.json();
    if (t === "pending") setPendingItems(data.items ?? []);
    if (t === "sent") setSentItems(data.items ?? []);
    if (t === "received") setReceivedItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  async function approve(id: string) {
    setActionPending(id);
    await fetch(`/api/admin/email/queue/${id}/approve`, { method: "POST" });
    setPendingItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedItem(null);
    setActionPending(null);
  }

  async function reject(id: string) {
    setActionPending(id);
    await fetch(`/api/admin/email/queue/${id}/reject`, { method: "POST" });
    setPendingItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedItem(null);
    setActionPending(null);
  }

  async function saveEdit(id: string) {
    setActionPending(id + "_edit");
    await fetch(`/api/admin/email/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyText: editBody }),
    });
    setActionPending(null);
  }

  function openDrawer(item: QueueItem) {
    setSelectedItem(item);
    setEditBody(item.bodyText ?? "");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Email Queue
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Review, approve, or reject Ossy&apos;s outgoing emails.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-cos-lg border border-cos-border bg-cos-cloud p-1">
        {(
          [
            { key: "pending" as const, label: "Pending", icon: <Clock className="h-4 w-4" />, count: pendingItems.length },
            { key: "sent" as const, label: "Sent", icon: <Send className="h-4 w-4" />, count: undefined },
            { key: "received" as const, label: "Received", icon: <Inbox className="h-4 w-4" />, count: undefined },
          ]
        ).map(({ key, label, icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-cos-md px-4 py-2 text-sm font-medium transition-all ${
              tab === key
                ? "bg-white text-cos-midnight shadow-sm"
                : "text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {icon}
            {label}
            {count !== undefined && count > 0 && (
              <span className="rounded-full bg-cos-ember px-1.5 py-0.5 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-cos-xl bg-cos-border/40 animate-pulse" />
          ))}
        </div>
      ) : tab === "pending" ? (
        <PendingList
          items={pendingItems}
          onOpen={openDrawer}
          onApprove={approve}
          onReject={reject}
          actionPending={actionPending}
        />
      ) : tab === "sent" ? (
        <MessageList items={sentItems} direction="outbound" />
      ) : (
        <MessageList items={receivedItems} direction="inbound" />
      )}

      {/* Side drawer */}
      {selectedItem && (
        <Drawer
          item={selectedItem}
          editBody={editBody}
          setEditBody={setEditBody}
          onApprove={() => approve(selectedItem.id)}
          onReject={() => reject(selectedItem.id)}
          onSaveEdit={() => saveEdit(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          actionPending={actionPending}
        />
      )}
    </div>
  );
}

// ─── Pending List ──────────────────────────────────────────────────────────────

function PendingList({
  items,
  onOpen,
  onApprove,
  onReject,
  actionPending,
}: {
  items: QueueItem[];
  onOpen: (item: QueueItem) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actionPending: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-6 py-12 text-center">
        <Mail className="mx-auto h-8 w-8 text-cos-slate-light" />
        <p className="mt-3 text-sm text-cos-slate">No pending emails — Ossy&apos;s queue is clear.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="group flex items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4 transition-all hover:border-cos-electric/30 hover:shadow-sm"
        >
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(item)}>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-cos-midnight">
                {item.subject}
              </span>
              {item.status === "auto_approved" && (
                <span className="flex items-center gap-1 rounded-full bg-cos-electric/10 px-2 py-0.5 text-xs font-medium text-cos-electric">
                  <Zap className="h-3 w-3" /> Auto
                </span>
              )}
              {item.context?.reason && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    INTENT_COLORS[item.context.reason] ?? "bg-cos-slate/10 text-cos-slate"
                  }`}
                >
                  {item.context.reason.replace("_", " ")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-cos-slate">
              To: {item.toEmails.join(", ")} ·{" "}
              {item.confidence !== null
                ? `${Math.round(item.confidence * 100)}% confidence · `
                : ""}
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight
              className="h-4 w-4 text-cos-slate-light cursor-pointer transition-colors hover:text-cos-electric"
              onClick={() => onOpen(item)}
            />
            <button
              onClick={() => onApprove(item.id)}
              disabled={actionPending === item.id}
              className="flex items-center gap-1.5 rounded-cos-md bg-cos-signal/10 px-3 py-1.5 text-xs font-semibold text-cos-signal transition-colors hover:bg-cos-signal hover:text-white disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={() => onReject(item.id)}
              disabled={actionPending === item.id}
              className="flex items-center gap-1.5 rounded-cos-md bg-cos-ember/10 px-3 py-1.5 text-xs font-semibold text-cos-ember transition-colors hover:bg-cos-ember hover:text-white disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Message List ──────────────────────────────────────────────────────────────

function MessageList({
  items,
  direction,
}: {
  items: EmailMessage[];
  direction: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-6 py-12 text-center">
        <Mail className="mx-auto h-8 w-8 text-cos-slate-light" />
        <p className="mt-3 text-sm text-cos-slate">
          No {direction === "outbound" ? "sent" : "received"} emails yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((msg) => (
        <div
          key={msg.id}
          className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cos-midnight">{msg.subject}</p>
              <p className="mt-0.5 text-xs text-cos-slate">
                {direction === "outbound"
                  ? `To: ${msg.toEmails?.join(", ")}`
                  : `From: ${msg.fromEmail}`}
                {msg.extractedIntent && (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                      INTENT_COLORS[msg.extractedIntent] ?? "bg-cos-slate/10 text-cos-slate"
                    }`}
                  >
                    {msg.extractedIntent.replace("_", " ")}
                  </span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-xs text-cos-slate-light">
              {new Date(msg.createdAt).toLocaleString()}
            </span>
          </div>
          {msg.bodyText && (
            <p className="mt-2 text-xs text-cos-slate line-clamp-2">{msg.bodyText}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({
  item,
  editBody,
  setEditBody,
  onApprove,
  onReject,
  onSaveEdit,
  onClose,
  actionPending,
}: {
  item: QueueItem;
  editBody: string;
  setEditBody: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onSaveEdit: () => void;
  onClose: () => void;
  actionPending: string | null;
}) {
  const isPending = actionPending === item.id;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-cos-midnight/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <div>
            <h2 className="font-heading text-base font-bold text-cos-midnight">{item.subject}</h2>
            <p className="text-xs text-cos-slate">
              To: {item.toEmails.join(", ")} ·{" "}
              {item.confidence !== null ? `${Math.round(item.confidence * 100)}% confidence` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-cos-cloud transition-colors">
            <X className="h-5 w-5 text-cos-slate" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden divide-x divide-cos-border">
          {/* Draft (editable) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-cos-border px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                Ossy&apos;s Draft
              </p>
            </div>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="flex-1 resize-none p-4 font-mono text-sm text-cos-midnight focus:outline-none"
            />
            <div className="border-t border-cos-border p-3">
              <button
                onClick={onSaveEdit}
                disabled={!!actionPending}
                className="w-full rounded-cos-md bg-cos-cloud py-2 text-xs font-semibold text-cos-slate transition-colors hover:bg-cos-border"
              >
                {actionPending === item.id + "_edit" ? "Saving…" : "Save Edits"}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-cos-border px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                Email Preview
              </p>
            </div>
            <div
              className="flex-1 overflow-auto p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-cos-border px-6 py-4">
          <button
            onClick={onReject}
            disabled={isPending}
            className="flex items-center gap-2 rounded-cos-lg border border-cos-ember/30 bg-cos-ember/5 px-5 py-2.5 text-sm font-semibold text-cos-ember transition-all hover:bg-cos-ember hover:text-white disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={isPending}
            className="flex items-center gap-2 rounded-cos-lg bg-cos-signal px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {isPending ? "Sending…" : "Approve & Send"}
          </button>
        </div>
      </div>
    </>
  );
}
