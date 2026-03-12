"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Send, Loader2 } from "lucide-react";

interface Account { id: string; unipile_account_id: string; display_name: string; status: string; }
interface Chat { id: string; name?: string; last_message?: string; updated_at?: string; }
interface Message {
  id: string;
  text?: string;
  body?: string;
  sender_id?: string;
  created_at?: string;
  /** Unipile sets this true when the message was sent by the account owner */
  is_sender?: boolean;
}

function LinkedInUniboxInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Derive selected chat object from id
  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;

  // Update URL when selection changes
  function updateUrl(accountId: string, chatId?: string) {
    const url = new URL(window.location.href);
    if (accountId) url.searchParams.set("account", accountId);
    else url.searchParams.delete("account");
    if (chatId) url.searchParams.set("chat", chatId);
    else url.searchParams.delete("chat");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  // Load accounts on mount, restore from URL
  useEffect(() => {
    fetch("/api/admin/growth-ops/linkedin-accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: Account[] = d.accounts ?? [];
        setAccounts(list);
        const urlAccount = params.get("account");
        const initial = urlAccount ?? list[0]?.unipile_account_id ?? "";
        if (initial) setSelectedAccountId(initial);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chats when account changes
  useEffect(() => {
    if (!selectedAccountId) return;
    setLoadingChats(true);
    setMessages([]);
    fetch(`/api/admin/growth-ops/unipile?action=listChats&accountId=${selectedAccountId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Chat[] = d.items ?? d.chats ?? [];
        setChats(list);
        setLoadingChats(false);
        // Restore chat from URL
        const urlChat = params.get("chat");
        if (urlChat && list.some((c) => c.id === urlChat)) {
          setSelectedChatId(urlChat);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  // Load messages when chat changes
  const loadMessages = useCallback(async (chatId: string) => {
    if (!chatId) return;
    setLoadingMessages(true);
    const d = await fetch(`/api/admin/growth-ops/unipile?action=getChatMessages&chatId=${chatId}`).then((r) => r.json());
    setMessages(d.items ?? d.messages ?? []);
    setLoadingMessages(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  useEffect(() => {
    if (selectedChatId) loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

  function selectChat(chat: Chat) {
    setSelectedChatId(chat.id);
    updateUrl(selectedAccountId, chat.id);
  }

  function selectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setSelectedChatId("");
    setMessages([]);
    updateUrl(accountId);
  }

  async function sendMessage() {
    if (!selectedChatId || !messageText.trim()) return;
    setSending(true);
    await fetch("/api/admin/growth-ops/unipile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendMessage", chatId: selectedChatId, text: messageText }),
    });
    setMessageText("");
    setSending(false);
    await loadMessages(selectedChatId);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">LinkedIn Inbox</h1>
          <p className="text-sm text-cos-slate mt-1">Unified inbox across all connected accounts.</p>
        </div>
        {accounts.length > 1 && (
          <select
            value={selectedAccountId}
            onChange={(e) => selectAccount(e.target.value)}
            className="rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a.unipile_account_id} value={a.unipile_account_id}>{a.display_name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex h-[600px] rounded-cos-xl border border-cos-border overflow-hidden bg-white shadow-sm">
        {/* Chat list */}
        <div className="w-72 shrink-0 border-r border-cos-border overflow-y-auto">
          {loadingChats && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
            </div>
          )}
          {!loadingChats && chats.length === 0 && (
            <div className="p-4 text-xs text-cos-slate">No chats found.</div>
          )}
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat)}
              className={`w-full text-left px-4 py-3 border-b border-cos-border/50 transition-colors ${selectedChatId === chat.id ? "bg-cos-electric/8" : "hover:bg-cos-cloud"}`}
            >
              <p className="text-sm font-medium text-cos-midnight truncate">{chat.name ?? chat.id}</p>
              {chat.last_message && <p className="text-xs text-cos-slate mt-0.5 truncate">{chat.last_message}</p>}
            </button>
          ))}
        </div>

        {/* Message thread */}
        <div className="flex flex-1 flex-col">
          {!selectedChat ? (
            <div className="flex flex-1 items-center justify-center text-cos-slate">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-cos-border px-5 py-3">
                <p className="font-medium text-sm text-cos-midnight">{selectedChat.name ?? selectedChat.id}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {loadingMessages && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                  </div>
                )}
                {messages.map((m) => {
                  const isMine = m.is_sender === true;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm max-w-[75%] ${
                          isMine
                            ? "bg-cos-electric text-white rounded-br-sm"
                            : "bg-cos-cloud text-cos-midnight rounded-bl-sm"
                        }`}
                      >
                        {m.text ?? m.body}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="border-t border-cos-border px-4 py-3 flex gap-2">
                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type a message…"
                  className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !messageText.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-cos-full bg-cos-electric text-white disabled:opacity-40 hover:bg-cos-electric-hover transition-colors"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LinkedInUniboxPage() {
  return (
    <Suspense>
      <LinkedInUniboxInner />
    </Suspense>
  );
}
