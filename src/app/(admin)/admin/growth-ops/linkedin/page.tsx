"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare, Send, Loader2, Search, X, PenSquare,
  Zap, AlertCircle, Sparkles, Check, Copy, Pencil, ChevronRight, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  unipileAccountId: string;
  displayName: string;
  accountType: string;
  status: string;
}

interface Conversation {
  id: string;
  chatId: string;
  participantName: string;
  participantHeadline: string | null;
  participantProfileUrl: string | null;
  participantAvatarUrl: string | null;
  participantProviderId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isInmailThread: boolean;
  /** Which account this conversation belongs to (for merged view) */
  _accountId?: string;
  _accountName?: string;
}

interface Message {
  id: string;
  text: string;
  is_sender: boolean;
  timestamp: string | null;
  seen?: boolean;
}

interface SearchResult {
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  profile_picture_url?: string;
}

interface Usage {
  accountType: string;
  accountTypeLabel: string;
  today: { invitesSent: number; messagesSent: number; inmailsSent: number; profileViews: number };
  limits: { dailyInvites: number; dailyMessages: number; monthlyInmails: number };
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({
  src, name, size = 8, className: extraClass = "",
}: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const initials = (name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const cls = `h-${size} w-${size} rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-semibold ${extraClass}`;
  if (src) {
    return (
      <div className={cls}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${cls} bg-cos-electric/15 text-cos-electric`}>
      {initials}
    </div>
  );
}

/** Small colored dot/initials badge for identifying which account a conversation belongs to */
function AccountBadge({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex h-4 items-center rounded-full bg-cos-midnight/8 px-1.5 text-[9px] font-semibold text-cos-slate-dim leading-none"
    >
      {initials}
    </span>
  );
}

// ── Usage Meter ───────────────────────────────────────────────────────────────

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  if (limit <= 0) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-cos-electric";
  const textColor = pct >= 95 ? "text-red-600" : pct >= 80 ? "text-amber-600" : "text-cos-slate";
  return (
    <div className="min-w-[90px]">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-cos-slate">{label}</span>
        <span className={textColor}>{used}/{limit}</span>
      </div>
      <div className="h-1 rounded-full bg-cos-border overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

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
                    const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.public_identifier || "Unknown";
                    return (
                      <button
                        key={r.provider_id ?? i}
                        onClick={() => setSelected(r)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-cos-cloud text-left"
                      >
                        <Avatar src={r.profile_picture_url} name={name} size={7} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-cos-midnight truncate">{name}</p>
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
                <Avatar src={selected.profile_picture_url} name={[selected.first_name, selected.last_name].join(" ")} size={6} />
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

// ── Main Inbox ────────────────────────────────────────────────────────────────

function LinkedInUniboxInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(""); // "" = not set, "all" = merged
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedConvo = conversations.find((c) => c.chatId === selectedChatId) ?? null;
  const isAllAccounts = selectedAccountId === "all";
  // For sending/new message, we need a real account ID
  const activeAccountId = isAllAccounts
    ? (selectedConvo?._accountId ?? accounts[0]?.unipileAccountId ?? "")
    : selectedAccountId;

  // Build a map of accountId -> displayName for badges
  const accountNameMap = new Map(accounts.map((a) => [a.unipileAccountId, a.displayName || a.unipileAccountId]));

  function updateUrl(accountId: string, chatId?: string) {
    const url = new URL(window.location.href);
    if (accountId) url.searchParams.set("account", accountId);
    else url.searchParams.delete("account");
    if (chatId) url.searchParams.set("chat", chatId);
    else url.searchParams.delete("chat");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  // Load accounts
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
          // Default to "all" when multiple accounts
          setSelectedAccountId("all");
        } else if (list.length === 1) {
          setSelectedAccountId(list[0].unipileAccountId);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load conversations + usage when account changes
  useEffect(() => {
    if (!selectedAccountId) return;
    setLoadingConvos(true);
    setMessages([]);

    if (selectedAccountId === "all") {
      // Fetch conversations from ALL accounts in parallel
      const fetches = accounts
        .filter((a) => a.status === "OK")
        .map((a) =>
          fetch(`/api/admin/growth-ops/unipile?action=listConversations&accountId=${a.unipileAccountId}`)
            .then((r) => r.json())
            .then((d) => {
              const convos: Conversation[] = d.conversations ?? [];
              // Tag each conversation with its account
              return convos.map((c) => ({
                ...c,
                _accountId: a.unipileAccountId,
                _accountName: a.displayName || a.unipileAccountId,
              }));
            })
            .catch(() => [] as Conversation[])
        );

      Promise.all(fetches).then((results) => {
        const merged = results
          .flat()
          .sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
          });
        setConversations(merged);
        setLoadingConvos(false);
        setUsage(null); // No single-account usage in merged view

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
        const acctName = accountNameMap.get(selectedAccountId) ?? selectedAccountId;
        const list: Conversation[] = (convoData.conversations ?? []).map((c: Conversation) => ({
          ...c,
          _accountId: selectedAccountId,
          _accountName: acctName,
        }));
        setConversations(list);
        setLoadingConvos(false);
        if (usageData && !usageData.error) setUsage(usageData);

        const urlChat = params.get("chat");
        if (urlChat && list.some((c) => c.chatId === urlChat)) {
          setSelectedChatId(urlChat);
        } else if (list.length > 0 && !urlChat) {
          setSelectedChatId(list[0].chatId);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, accounts]);

  // Load messages when chat changes
  const loadMessages = useCallback(async (chatId: string) => {
    if (!chatId) return;
    // Determine which account this chat belongs to
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

  function selectChat(chatId: string) {
    setSelectedChatId(chatId);
    setSuggestedReplies([]);
    setEditingSuggestion(null);
    updateUrl(selectedAccountId, chatId);
  }

  function selectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setSelectedChatId("");
    setMessages([]);
    updateUrl(accountId);
  }

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
    // Refresh usage for single-account view
    if (!isAllAccounts) {
      fetch(`/api/admin/growth-ops/unipile?action=getUsage&accountId=${acctId}`)
        .then((r) => r.json()).then(setUsage).catch(() => {});
    }
  }

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
      // Small delay between messages to look natural
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
            // Merge: replace this account's convos and keep others
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

  // Account name for the current conversation (for thread header)
  const convoAccountName = selectedConvo?._accountName ?? "";

  async function syncConversations() {
    if (syncing) return;
    setSyncing(true);
    try {
      if (isAllAccounts) {
        // Sync all accounts
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

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">LinkedIn Inbox</h1>
          <p className="text-sm text-cos-slate mt-0.5">
            {isAllAccounts ? "Merged inbox across all connected accounts." : "Unified inbox across all connected accounts."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Usage meters (single-account only) */}
          {usage && !isAllAccounts && (
            <div className="flex items-center gap-4">
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

          {/* Account selector */}
          {accounts.length > 0 && (
            <select
              value={selectedAccountId}
              onChange={(e) => selectAccount(e.target.value)}
              className="rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
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
          )}

          {/* Sync button */}
          <button
            onClick={syncConversations}
            disabled={syncing}
            title="Re-sync conversations from LinkedIn"
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm font-medium text-cos-midnight hover:bg-cos-cloud disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing\u2026" : "Sync"}
          </button>

          {/* New message button */}
          <button
            onClick={() => setShowNewMessage(true)}
            disabled={!activeAccountId}
            className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3.5 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-40 transition-colors"
          >
            <PenSquare className="h-3.5 w-3.5" />
            New message
          </button>
        </div>
      </div>

      <div className="flex h-[640px] rounded-cos-xl border border-cos-border overflow-hidden bg-white shadow-sm">
        {/* Conversation list */}
        <div className="w-80 shrink-0 border-r border-cos-border overflow-y-auto">
          {loadingConvos && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
            </div>
          )}
          {!loadingConvos && conversations.length === 0 && (
            <div className="p-6 text-center">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 text-cos-slate opacity-30" />
              <p className="text-xs text-cos-slate">No conversations yet.</p>
              <button
                onClick={() => setShowNewMessage(true)}
                className="mt-3 text-xs text-cos-electric hover:underline"
              >
                Start one
              </button>
            </div>
          )}
          {conversations.map((convo) => (
            <button
              key={`${convo._accountId}-${convo.chatId}`}
              onClick={() => selectChat(convo.chatId)}
              className={`w-full text-left px-3 py-3 border-b border-cos-border/50 transition-colors flex items-start gap-2.5 ${
                selectedChatId === convo.chatId ? "bg-cos-electric/8" : "hover:bg-cos-cloud"
              }`}
            >
              <div className="relative shrink-0">
                <Avatar
                  src={convo.participantAvatarUrl}
                  name={convo.participantName}
                  size={9}
                />
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
                  <p className="text-xs text-cos-slate-dim truncate mt-0.5">{convo.lastMessagePreview}</p>
                )}
              </div>
              {convo.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-cos-electric px-1.5 py-0.5 text-[10px] font-medium text-white leading-none">
                  {convo.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Message thread */}
        <div className="flex flex-1 flex-col min-w-0">
          {!selectedConvo ? (
            <div className="flex flex-1 items-center justify-center text-cos-slate">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a conversation</p>
                <button
                  onClick={() => setShowNewMessage(true)}
                  className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-cos-electric hover:underline"
                >
                  <Zap className="h-3 w-3" /> Start a new one
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b border-cos-border px-5 py-3 flex items-center gap-3">
                <Avatar
                  src={selectedConvo.participantAvatarUrl}
                  name={selectedConvo.participantName}
                  size={8}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-cos-midnight leading-tight">
                    {selectedConvo.participantName || "LinkedIn Member"}
                  </p>
                  {selectedConvo.participantHeadline && (
                    <p className="text-xs text-cos-slate leading-tight">{selectedConvo.participantHeadline}</p>
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
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {loadingMessages && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex items-end gap-2 ${m.is_sender ? "justify-end" : "justify-start"}`}>
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

              {/* AI Suggested Replies */}
              {suggestedReplies.length > 0 && (
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
                            onClick={suggestReply}
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
                      onClick={sendSuggestedSequence}
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
              )}

              {/* Reply input */}
              <div className="border-t border-cos-border px-4 py-3">
                {isAllAccounts && convoAccountName && (
                  <p className="text-[10px] text-cos-slate-dim mb-1.5">
                    Replying as <span className="font-medium text-cos-midnight">{convoAccountName}</span>
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                    placeholder="Type a reply&hellip;"
                    className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  />
                  <button
                    onClick={suggestReply}
                    disabled={suggestLoading || messages.length === 0}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-cos-electric/30 text-cos-electric disabled:opacity-30 hover:bg-cos-electric/10 transition-colors"
                    title="AI Suggest Reply"
                  >
                    {suggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={sendReply}
                    disabled={sending || !messageText.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-cos-electric text-white disabled:opacity-40 hover:bg-cos-electric-hover transition-colors"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function LinkedInUniboxPage() {
  return (
    <Suspense>
      <LinkedInUniboxInner />
    </Suspense>
  );
}
