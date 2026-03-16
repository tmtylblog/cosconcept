"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Send, Loader2, Search, X,
  AlertCircle, Sparkles, Check, Copy, Pencil, ChevronRight, RefreshCw,
} from "lucide-react";
import { ConversationList } from "@/components/admin/growth-ops/conversation-list";
import type { ConversationFilter } from "@/components/admin/growth-ops/conversation-list";
import { MessageThread } from "@/components/admin/growth-ops/message-thread";
import { ContextPanel } from "@/components/admin/growth-ops/context-panel";
import { Avatar } from "@/components/admin/growth-ops/avatar";
import type {
  Account,
  Conversation,
  Message,
  SearchResult,
  Usage,
  QueueItem,
  Stage,
  ConversationContext,
} from "@/components/admin/growth-ops/types";

// ── New Message Modal ─────────────────────────────────────────────────────────

function NewMessageModal({
  accountId,
  usage,
  onClose,
  onSent,
}: {
  accountId: string;
  usage: Usage | null;
  onClose: () => void;
  onSent: (chatId: string, recipient: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendAsInmail, setSendAsInmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inmailAllowed = (usage?.limits.monthlyInmails ?? 0) > 0;

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const d = await fetch(
        `/api/admin/growth-ops/unipile?action=searchProfiles&accountId=${encodeURIComponent(accountId)}&q=${encodeURIComponent(query)}`
      ).then((r) => r.json());
      setResults(d.results ?? []);
      setSearching(false);
    }, 400);
  }, [query, accountId]);

  async function handleSend() {
    if (!selected || !messageText.trim()) return;
    setSending(true);
    setError(null);
    const name = [selected.first_name, selected.last_name].filter(Boolean).join(" ");
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createChat",
          accountId,
          attendeeProviderId: selected.provider_id ?? "",
          publicIdentifier: selected.public_identifier ?? undefined,
          text: messageText,
          inmail: sendAsInmail || undefined,
          participantName: name,
          participantHeadline: selected.headline ?? null,
          participantAvatarUrl: selected.profile_picture_url ?? null,
        }),
      }).then((r) => r.json());

      if (d.error) { setError(d.error); setSending(false); return; }
      onSent(d.chatId, selected);
    } catch (err) {
      setError(String(err));
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-cos-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-5 py-4">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">New Message</h2>
          <button onClick={onClose} className="text-cos-slate hover:text-cos-midnight">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Profile search */}
          {!selected ? (
            <div>
              <label className="text-xs font-medium text-cos-slate mb-1.5 block">
                Search LinkedIn (name, URL, or keywords)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cos-slate pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a name or paste a LinkedIn URL&hellip;"
                  className="w-full rounded-cos-lg border border-cos-border bg-cos-surface pl-9 pr-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-cos-electric" />}
              </div>
              {results.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-cos-lg border border-cos-border bg-white shadow-sm divide-y divide-cos-border/50">
                  {results.map((r, i) => {
                    const rName = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.public_identifier || "Unknown";
                    return (
                      <button
                        key={r.provider_id ?? i}
                        onClick={() => setSelected(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-cos-cloud text-left"
                      >
                        <Avatar src={r.profile_picture_url} name={rName} size={28} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-cos-midnight truncate">{rName}</p>
                          {r.headline && <p className="text-xs text-cos-slate truncate">{r.headline}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Selected recipient */
            <div>
              <label className="text-xs font-medium text-cos-slate mb-1.5 block">To</label>
              <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/40 bg-cos-electric/5 px-3 py-2">
                <Avatar src={selected.profile_picture_url} name={[selected.first_name, selected.last_name].join(" ")} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cos-midnight truncate">
                    {[selected.first_name, selected.last_name].filter(Boolean).join(" ")}
                  </p>
                  {selected.headline && <p className="text-xs text-cos-slate truncate">{selected.headline}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="text-cos-slate hover:text-cos-midnight">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Message */}
          {selected && (
            <>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1.5 block">Message</label>
                <textarea
                  autoFocus
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={4}
                  placeholder="Write your message&hellip;"
                  className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm focus:border-cos-electric focus:outline-none resize-none"
                />
              </div>

              {/* InMail toggle */}
              {inmailAllowed && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendAsInmail}
                    onChange={(e) => setSendAsInmail(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-cos-slate">Send as InMail</span>
                  <span className="text-[10px] text-cos-slate-dim">
                    ({usage?.today.inmailsSent ?? 0} used today)
                  </span>
                </label>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-cos-lg bg-red-50 border border-red-200 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending || !messageText.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-cos-lg bg-cos-electric px-4 py-2.5 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-40 transition-colors"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendAsInmail ? "Send InMail" : "Send Message"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Reply Suggestions Panel ────────────────────────────────────────────────

function AiReplySuggestions({
  suggestedReplies,
  setSuggestedReplies,
  editingSuggestion,
  setEditingSuggestion,
  sendingSequence,
  sentCount,
  onSendAll,
  onRegenerate,
}: {
  suggestedReplies: string[];
  setSuggestedReplies: (replies: string[]) => void;
  editingSuggestion: number | null;
  setEditingSuggestion: (idx: number | null) => void;
  sendingSequence: boolean;
  sentCount: number;
  onSendAll: () => void;
  onRegenerate: () => void;
}) {
  if (suggestedReplies.length === 0) return null;

  return (
    <div className="border-t border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cos-electric" />
          <span className="text-xs font-medium text-cos-electric">
            Suggested reply ({suggestedReplies.length} messages)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sendingSequence ? (
            <span className="text-[10px] text-cos-electric">
              Sending {sentCount}/{suggestedReplies.length}...
            </span>
          ) : (
            <>
              <button
                onClick={() => { setSuggestedReplies([]); setEditingSuggestion(null); }}
                className="text-[10px] text-cos-slate hover:text-cos-midnight transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={onRegenerate}
                className="text-[10px] text-cos-electric hover:underline"
              >
                Regenerate
              </button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {suggestedReplies.map((text, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <ChevronRight className="h-3 w-3 text-cos-electric/50 mt-1.5 shrink-0" />
            {editingSuggestion === i ? (
              <div className="flex-1 flex gap-1.5">
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => {
                    const updated = [...suggestedReplies];
                    updated[i] = e.target.value;
                    setSuggestedReplies(updated);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingSuggestion(null);
                    if (e.key === "Escape") setEditingSuggestion(null);
                  }}
                  className="flex-1 rounded-cos-md border border-cos-electric/30 bg-white px-2 py-1 text-xs focus:border-cos-electric focus:outline-none"
                />
                <button
                  onClick={() => setEditingSuggestion(null)}
                  className="text-cos-electric"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-start gap-1.5">
                <p className="flex-1 text-xs text-cos-midnight leading-relaxed">{text}</p>
                <button
                  onClick={() => setEditingSuggestion(i)}
                  className="opacity-0 group-hover:opacity-100 text-cos-slate hover:text-cos-electric transition-all shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onSendAll}
          disabled={sendingSequence}
          className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
        >
          {sendingSequence ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send all {suggestedReplies.length} messages
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(suggestedReplies.join("\n\n"));
          }}
          className="flex items-center gap-1 rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:text-cos-midnight transition-colors"
        >
          <Copy className="h-3 w-3" /> Copy all
        </button>
      </div>
    </div>
  );
}

// ── Main Unified Inbox ───────────────────────────────────────────────────────

function GrowthOpsInboxInner() {
  const router = useRouter();
  const params = useSearchParams();

  // ── State (ported from LinkedIn inbox) ──────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(""); // "" = not set, "all" = merged
  const [conversations, _setConversations] = useState<Conversation[]>([]);
  const setConversations = useCallback((val: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
    if (typeof val === "function") {
      _setConversations((prev) => {
        const next = val(prev);
        console.warn(`[INBOX DEBUG] setConversations (fn): ${prev.length} → ${next.length}`);
        return next;
      });
    } else {
      console.warn(`[INBOX DEBUG] setConversations: → ${val.length}`);
      _setConversations(val);
    }
  }, []);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [sendingSequence, setSendingSequence] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [editingSuggestion, setEditingSuggestion] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ── New state for unified inbox ─────────────────────────────────────────
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [contextData, setContextData] = useState<ConversationContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [stages, setStages] = useState<Stage[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedConvo = conversations.find((c) => c.chatId === selectedChatId) ?? null;
  const isAllAccounts = selectedAccountId === "all";
  // For sending/new message, we need a real account ID
  const activeAccountId = isAllAccounts
    ? (selectedConvo?._accountId ?? accounts[0]?.unipileAccountId ?? "")
    : selectedAccountId;

  // Build a map of accountId -> displayName for badges
  const accountNameMap = new Map(accounts.map((a) => [a.unipileAccountId, a.displayName || a.unipileAccountId]));
  const convoAccountName = selectedConvo?._accountName ?? "";

  // ── URL management ──────────────────────────────────────────────────────
  function updateUrl(accountId: string, chatId?: string) {
    const url = new URL(window.location.href);
    if (accountId) url.searchParams.set("account", accountId);
    else url.searchParams.delete("account");
    if (chatId) url.searchParams.set("chat", chatId);
    else url.searchParams.delete("chat");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  // ── Load accounts on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/growth-ops/linkedin-accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: Account[] = d.accounts ?? [];
        setAccounts(list);
        const urlAccount = params.get("account");
        if (urlAccount) {
          setSelectedAccountId(urlAccount);
        } else if (list.length > 1) {
          setSelectedAccountId("all");
        } else if (list.length === 1) {
          setSelectedAccountId(list[0].unipileAccountId);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load queue items on mount ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/growth-ops/pipeline/queue?status=pending")
      .then((r) => r.json())
      .then((d) => setQueueItems(d.items ?? []))
      .catch(() => {});
  }, []);

  // ── Load pipeline stages on mount ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/growth-ops/pipeline?action=getStages")
      .then((r) => r.json())
      .then((d) => setStages(d.stages ?? []))
      .catch(() => {});
  }, []);

  // ── Load conversations + usage when account changes ─────────────────────
  // Use accounts.length as dependency (not the array itself) to avoid re-running
  // when the array reference changes but the content is the same.
  const accountsLoaded = accounts.length > 0;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  const conversationsLoadedRef = useRef(false);
  const effectRunCount = useRef(0);

  useEffect(() => {
    effectRunCount.current++;
    const runId = effectRunCount.current;
    console.warn(`[INBOX DEBUG] Effect run #${runId}: selectedAccountId=${selectedAccountId}, accountsLoaded=${accountsLoaded}, convosLoaded=${conversationsLoadedRef.current}`);

    if (!selectedAccountId || !accountsLoaded) {
      console.warn(`[INBOX DEBUG] Effect #${runId}: SKIPPED (no account or accounts not loaded)`);
      return;
    }
    if (conversationsLoadedRef.current) {
      console.warn(`[INBOX DEBUG] Effect #${runId}: SKIPPED (already loaded)`);
      return;
    }

    let cancelled = false;
    setLoadingConvos(true);

    if (selectedAccountId === "all") {
      // Fetch conversations from ALL accounts in parallel
      const currentAccounts = accountsRef.current;
      const fetches = currentAccounts
        .filter((a) => a.status === "OK")
        .map((a) =>
          fetch(`/api/admin/growth-ops/unipile?action=listConversations&accountId=${a.unipileAccountId}`)
            .then((r) => r.json())
            .then((d) => {
              const convos: Conversation[] = d.conversations ?? [];
              return convos.map((c) => ({
                ...c,
                _accountId: a.unipileAccountId,
                _accountName: a.displayName || a.unipileAccountId,
              }));
            })
            .catch(() => [] as Conversation[])
        );

      Promise.all(fetches).then((results) => {
        console.warn(`[INBOX DEBUG] All-accounts fetch done: cancelled=${cancelled}, results=${results.length} arrays, total=${results.flat().length} convos`);
        if (cancelled) { console.warn("[INBOX DEBUG] CANCELLED — not setting conversations"); return; }
        const merged = results
          .flat()
          .sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
          });
        console.warn(`[INBOX DEBUG] Setting ${merged.length} conversations`);
        setConversations(merged);
        setLoadingConvos(false);
        setUsage(null);
        conversationsLoadedRef.current = true;

        const urlChat = params.get("chat");
        if (urlChat && merged.some((c) => c.chatId === urlChat)) {
          setSelectedChatId(urlChat);
        } else if (merged.length > 0 && !urlChat) {
          setSelectedChatId(merged[0].chatId);
        }
      });
    } else {
      // Single account
      Promise.all([
        fetch(`/api/admin/growth-ops/unipile?action=listConversations&accountId=${selectedAccountId}`)
          .then((r) => r.json()),
        fetch(`/api/admin/growth-ops/unipile?action=getUsage&accountId=${selectedAccountId}`)
          .then((r) => r.json()).catch(() => null),
      ]).then(([convoData, usageData]) => {
        if (cancelled) return;
        const acctName = accountNameMap.get(selectedAccountId) ?? selectedAccountId;
        const list: Conversation[] = (convoData.conversations ?? []).map((c: Conversation) => ({
          ...c,
          _accountId: selectedAccountId,
          _accountName: acctName,
        }));
        setConversations(list);
        setLoadingConvos(false);
        conversationsLoadedRef.current = true;
        if (usageData && !usageData.error) setUsage(usageData);

        const urlChat = params.get("chat");
        if (urlChat && list.some((c) => c.chatId === urlChat)) {
          setSelectedChatId(urlChat);
        } else if (list.length > 0 && !urlChat) {
          setSelectedChatId(list[0].chatId);
        }
      });
    }

    return () => { console.warn(`[INBOX DEBUG] Cleanup: cancelling effect #${runId}`); cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, accountsLoaded]);

  // ── Load messages when chat changes ─────────────────────────────────────
  const loadMessages = useCallback(async (chatId: string) => {
    if (!chatId) return;
    const convo = conversations.find((c) => c.chatId === chatId);
    const acctId = convo?._accountId || activeAccountId;
    if (!acctId) return;
    setLoadingMessages(true);
    const d = await fetch(
      `/api/admin/growth-ops/unipile?action=getMessages&chatId=${encodeURIComponent(chatId)}&accountId=${acctId}`
    ).then((r) => r.json());
    setMessages(d.messages ?? []);
    setLoadingMessages(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [conversations, activeAccountId]);

  useEffect(() => {
    if (selectedChatId) loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

  // ── Load conversation context when chat changes ─────────────────────────
  const refreshContext = useCallback((convo: Conversation | null) => {
    if (!convo) {
      setContextData(null);
      return;
    }
    setContextLoading(true);
    const qp = new URLSearchParams();
    if (convo.participantProfileUrl) qp.set("profileUrl", convo.participantProfileUrl);
    if (convo.participantName) qp.set("participantName", convo.participantName);
    fetch(`/api/admin/growth-ops/conversation-context?${qp.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error || !d.activities) {
          setContextData(null);
          return;
        }
        setContextData(d as ConversationContext);
        if (d.stages?.length && stages.length === 0) {
          setStages(d.stages);
        }
      })
      .catch(() => setContextData(null))
      .finally(() => setContextLoading(false));
   
  }, [stages.length]);

  useEffect(() => {
    if (!selectedChatId) {
      setContextData(null);
      return;
    }
    const convo = conversations.find((c) => c.chatId === selectedChatId);
    refreshContext(convo ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId, conversations]);

  // ── Chat selection ──────────────────────────────────────────────────────
  function selectChat(chatId: string) {
    setSelectedChatId(chatId);
    setSuggestedReplies([]);
    setEditingSuggestion(null);
    updateUrl(selectedAccountId, chatId);
  }

  function selectAccount(accountId: string) {
    conversationsLoadedRef.current = false; // Reset so new account triggers fetch
    setSelectedAccountId(accountId);
    setSelectedChatId("");
    setMessages([]);
    setContextData(null);
    updateUrl(accountId);
  }

  // ── Filter conversations ────────────────────────────────────────────────
  const filteredConversations = (() => {
    if (filter === "all") return conversations;
    if (filter === "needs_reply") {
      // Show conversations where last message is NOT from sender
      return conversations.filter((c) => {
        if (!c.lastMessagePreview) return false;
        // Unread count > 0 indicates they replied and we haven&apos;t responded
        return c.unreadCount > 0;
      });
    }
    if (filter === "pending_approval") {
      // This filter shows the queue items section only
      return conversations;
    }
    return conversations;
  })();

  // ── Send reply ──────────────────────────────────────────────────────────
  async function sendReply() {
    if (!selectedChatId || !messageText.trim()) return;
    const acctId = selectedConvo?._accountId || activeAccountId;
    if (!acctId) return;
    setSending(true);
    await fetch("/api/admin/growth-ops/unipile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sendMessage",
        chatId: selectedChatId,
        accountId: acctId,
        text: messageText,
      }),
    });
    setMessageText("");
    setSending(false);
    await loadMessages(selectedChatId);
    if (!isAllAccounts) {
      fetch(`/api/admin/growth-ops/unipile?action=getUsage&accountId=${acctId}`)
        .then((r) => r.json()).then(setUsage).catch(() => {});
    }
  }

  // ── AI Reply Suggestion ─────────────────────────────────────────────────
  async function suggestReply() {
    if (!selectedConvo || messages.length === 0) return;
    setSuggestLoading(true);
    setSuggestedReplies([]);
    setEditingSuggestion(null);
    setSentCount(0);
    try {
      const d = await fetch("/api/admin/growth-ops/reply-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: selectedConvo.participantName,
          participantHeadline: selectedConvo.participantHeadline,
          recentMessages: messages.map((m) => ({ text: m.text, is_sender: m.is_sender })),
          accountName: convoAccountName || undefined,
        }),
      }).then((r) => r.json());
      if (d.messages?.length) {
        setSuggestedReplies(d.messages);
      }
    } catch {
      // silently fail
    } finally {
      setSuggestLoading(false);
    }
  }

  // ── Send suggested sequence ─────────────────────────────────────────────
  async function sendSuggestedSequence() {
    if (!selectedChatId || suggestedReplies.length === 0) return;
    const acctId = selectedConvo?._accountId || activeAccountId;
    if (!acctId) return;
    setSendingSequence(true);
    setSentCount(0);

    for (let i = 0; i < suggestedReplies.length; i++) {
      const text = suggestedReplies[i];
      if (!text.trim()) continue;
      await fetch("/api/admin/growth-ops/unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sendMessage",
          chatId: selectedChatId,
          accountId: acctId,
          text,
        }),
      });
      setSentCount(i + 1);
      if (i < suggestedReplies.length - 1) {
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
      }
    }

    setSendingSequence(false);
    setSuggestedReplies([]);
    setSentCount(0);
    await loadMessages(selectedChatId);
    if (!isAllAccounts) {
      fetch(`/api/admin/growth-ops/unipile?action=getUsage&accountId=${acctId}`)
        .then((r) => r.json()).then(setUsage).catch(() => {});
    }
  }

  // ── New message sent handler ────────────────────────────────────────────
  function handleNewMessageSent(chatId: string, recipient: SearchResult) {
    setShowNewMessage(false);
    const name = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ");

    const synthetic: Conversation = {
      id: `synth-${chatId}`,
      chatId,
      participantName: name || "New conversation",
      participantHeadline: recipient.headline ?? null,
      participantProfileUrl: null,
      participantAvatarUrl: recipient.profile_picture_url ?? null,
      participantProviderId: recipient.provider_id ?? "",
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: "Message sent",
      unreadCount: 0,
      isInmailThread: false,
      _accountId: activeAccountId,
      _accountName: accountNameMap.get(activeAccountId) ?? activeAccountId,
    };
    setConversations((prev) => [synthetic, ...prev.filter((c) => c.chatId !== chatId)]);
    setSelectedChatId(chatId);
    updateUrl(selectedAccountId, chatId);

    setTimeout(() => {
      const acctId = activeAccountId;
      Promise.all([
        fetch(`/api/admin/growth-ops/unipile?action=listConversations&accountId=${acctId}`)
          .then((r) => r.json()),
        fetch(`/api/admin/growth-ops/unipile?action=getUsage&accountId=${acctId}`)
          .then((r) => r.json()).catch(() => null),
      ]).then(([convoData, usageData]) => {
        if (convoData.conversations?.length) {
          const tagged = (convoData.conversations as Conversation[]).map((c) => ({
            ...c,
            _accountId: acctId,
            _accountName: accountNameMap.get(acctId) ?? acctId,
          }));
          if (isAllAccounts) {
            setConversations((prev) => {
              const others = prev.filter((c) => c._accountId !== acctId);
              return [...tagged, ...others].sort((a, b) => {
                const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                return tb - ta;
              });
            });
          } else {
            setConversations(tagged);
          }
        }
        if (usageData && !usageData.error) setUsage(usageData);
      });
    }, 1500);
  }

  // ── Sync conversations ──────────────────────────────────────────────────
  async function syncConversations() {
    if (syncing) return;
    setSyncing(true);
    try {
      if (isAllAccounts) {
        const syncs = accounts
          .filter((a) => a.status === "OK")
          .map((a) =>
            fetch(`/api/admin/growth-ops/unipile?action=syncConversations&accountId=${a.unipileAccountId}`)
              .then((r) => r.json())
              .then((d) => {
                const convos: Conversation[] = d.conversations ?? [];
                return convos.map((c) => ({
                  ...c,
                  _accountId: a.unipileAccountId,
                  _accountName: a.displayName || a.unipileAccountId,
                }));
              })
              .catch(() => [] as Conversation[])
          );
        const results = await Promise.all(syncs);
        const merged = results
          .flat()
          .sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
          });
        setConversations(merged);
      } else {
        const res = await fetch(
          `/api/admin/growth-ops/unipile?action=syncConversations&accountId=${selectedAccountId}`
        );
        const data = await res.json();
        if (data.conversations?.length) {
          const acctName = accountNameMap.get(selectedAccountId) ?? selectedAccountId;
          setConversations(
            (data.conversations as Conversation[]).map((c) => ({
              ...c,
              _accountId: selectedAccountId,
              _accountName: acctName,
            }))
          );
        }
      }
    } catch {
      // silently fail
    } finally {
      setSyncing(false);
    }
  }

  // ── Queue approve/reject ────────────────────────────────────────────────
  async function handleQueueAction(id: string, action: "approve" | "reject") {
    try {
      await fetch("/api/admin/growth-ops/pipeline/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setQueueItems((prev) => prev.filter((q) => q.id !== id));
    } catch {
      // silently fail
    }
  }

  // ── Deal stage change ───────────────────────────────────────────────────
  async function handleStageChange(stageId: string) {
    if (!contextData?.deal) return;
    try {
      await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "moveDeal",
          dealId: contextData.deal.id,
          stageId,
        }),
      });
      // Update local state
      setContextData((prev) => {
        if (!prev || !prev.deal) return prev;
        const stage = stages.find((s) => s.id === stageId);
        return {
          ...prev,
          deal: {
            ...prev.deal,
            stageId,
            stageLabel: stage?.label ?? prev.deal.stageLabel,
          },
        };
      });
    } catch {
      // silently fail
    }
  }

  // ── Deal tag update ─────────────────────────────────────────────────────
  async function handleTagsChange(tags: string[]) {
    if (!contextData?.deal) return;
    try {
      await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateDeal",
          dealId: contextData.deal.id,
          customFields: { tags },
        }),
      });
      setContextData((prev) => {
        if (!prev || !prev.deal) return prev;
        return {
          ...prev,
          deal: {
            ...prev.deal,
            customFields: { ...prev.deal.customFields, tags },
          },
        };
      });
    } catch {
      // silently fail
    }
  }

  // ── Create deal from context ────────────────────────────────────────────
  async function handleCreateDeal() {
    if (!selectedConvo) return;

    // Confirmation dialog
    const name = selectedConvo.participantName || "this contact";
    if (!confirm(`Create deal for ${name}?`)) return;

    try {
      // If the person has replied (unread messages), start at "Replied" stage.
      // Otherwise default to "Contacted".
      const hasReplied = selectedConvo.unreadCount > 0 || messages.some((m) => !m.is_sender);
      const targetStageLabel = hasReplied ? "Replied" : "Contacted";
      const targetStage = stages.find((s) => s.label === targetStageLabel)
        ?? (stages.length > 0
          ? stages.reduce((a, b) => (a.displayOrder ?? 0) < (b.displayOrder ?? 0) ? a : b)
          : null);

      const res = await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDeal",
          name: selectedConvo.participantName || "New Deal",
          stageId: targetStage?.id ?? null,
          source: "linkedin_auto",
          sourceChannel: "linkedin",
        }),
      });
      const d = await res.json();
      if (res.status === 409 && d.existingDealId) {
        // Deal already exists — offer to view it
        if (confirm(`A deal for "${selectedConvo.participantName}" already exists. View it?`)) {
          router.push(`/admin/growth-ops/pipeline/${d.existingDealId}?from=inbox`);
        }
        return;
      }
      if (!res.ok) { console.error("Create deal failed:", res.status, d.error); return; }
      if (d.dealId) {
        router.push(`/admin/growth-ops/pipeline/${d.dealId}?from=inbox`);
      }
    } catch (err) {
      console.error("Failed to create deal:", err);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {showNewMessage && (
        <NewMessageModal
          accountId={activeAccountId}
          usage={usage}
          onClose={() => setShowNewMessage(false)}
          onSent={handleNewMessageSent}
        />
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Growth Ops Inbox</h1>
          <p className="text-sm text-cos-slate mt-0.5">
            Unified inbox with deal context and AI-powered replies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncConversations}
            disabled={syncing}
            title="Re-sync conversations from LinkedIn"
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm font-medium text-cos-midnight hover:bg-cos-cloud disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing\u2026" : "Sync"}
          </button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="flex h-[calc(100vh-120px)] rounded-cos-xl border border-cos-border overflow-hidden shadow-sm">
        {/* Left: Conversation List (280px) */}
        <div className="w-[280px] shrink-0 border-r border-cos-border bg-white overflow-hidden">
          <ConversationList
            conversations={filteredConversations}
            selectedChatId={selectedChatId}
            onSelectChat={selectChat}
            isAllAccounts={isAllAccounts}
            loadingConvos={loadingConvos}
            onNewMessage={() => setShowNewMessage(true)}
            queueItems={queueItems}
            onQueueAction={handleQueueAction}
            filter={filter}
            onFilterChange={setFilter}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={selectAccount}
            usage={usage}
          />
        </div>

        {/* Center: Message Thread (flex-1) */}
        <div className="flex flex-1 flex-col min-w-0 bg-white">
          <MessageThread
            selectedConvo={selectedConvo}
            messages={messages}
            loadingMessages={loadingMessages}
            messageText={messageText}
            onMessageTextChange={setMessageText}
            onSendReply={sendReply}
            sending={sending}
            isAllAccounts={isAllAccounts}
            convoAccountName={convoAccountName}
            stageLabel={selectedConvo?._stageLabel ?? contextData?.deal?.stageLabel}
            stageColor={selectedConvo?._stageColor ?? stages.find((s) => s.id === contextData?.deal?.stageId)?.color}
            onStartNew={() => setShowNewMessage(true)}
          />

          {/* AI Reply Suggestions (overlays above composer) */}
          {selectedConvo && (
            <>
              <AiReplySuggestions
                suggestedReplies={suggestedReplies}
                setSuggestedReplies={setSuggestedReplies}
                editingSuggestion={editingSuggestion}
                setEditingSuggestion={setEditingSuggestion}
                sendingSequence={sendingSequence}
                sentCount={sentCount}
                onSendAll={sendSuggestedSequence}
                onRegenerate={suggestReply}
              />

              {/* AI Suggest button in composer area */}
              {suggestedReplies.length === 0 && (
                <div className="border-t border-cos-border px-4 py-2 flex justify-end">
                  <button
                    onClick={suggestReply}
                    disabled={suggestLoading || messages.length === 0}
                    className="flex items-center gap-1.5 rounded-cos-lg border border-cos-electric/30 px-3 py-1.5 text-xs font-medium text-cos-electric disabled:opacity-30 hover:bg-cos-electric/10 transition-colors"
                    title="AI Suggest Reply"
                  >
                    {suggestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Suggest Reply
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Context Panel (320px) */}
        <div className="w-[320px] shrink-0 border-l border-cos-border bg-cos-surface overflow-hidden">
          <ContextPanel
            context={contextData}
            loading={contextLoading}
            stages={stages}
            onStageChange={handleStageChange}
            onTagsChange={handleTagsChange}
            onCreateDeal={handleCreateDeal}
            participantName={selectedConvo?.participantName ?? ""}
            participantUrl={selectedConvo?.participantProfileUrl ?? null}
          />
        </div>
      </div>
    </>
  );
}

// ── Page Export (wrapped in Suspense for useSearchParams) ──────────────────

export default function GrowthOpsPage() {
  return (
    <Suspense>
      <GrowthOpsInboxInner />
    </Suspense>
  );
}
