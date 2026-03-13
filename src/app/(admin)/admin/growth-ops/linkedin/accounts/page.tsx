"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Link2, Loader2, RefreshCw, Copy, Check, X, ExternalLink, AlertTriangle, Trash2 } from "lucide-react";

interface Account {
  id: string;
  unipileAccountId: string;
  displayName: string;
  linkedinUsername: string | null;
  status: string;
  createdAt: string;
}

interface SyncProgress {
  seeded: number;
  enriched?: number;
  pages: number;
  phase: "fetching" | "enriching" | "complete" | "error";
  error?: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  OK:           { bg: "bg-emerald-50",  text: "text-emerald-700",  dot: "bg-emerald-500" },
  CONNECTING:   { bg: "bg-amber-50",    text: "text-amber-700",    dot: "bg-amber-500" },
  CREDENTIALS:  { bg: "bg-red-50",      text: "text-red-700",      dot: "bg-red-500" },
  ERROR:        { bg: "bg-red-50",      text: "text-red-700",      dot: "bg-red-500" },
};

export default function LinkedInAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Connect my account
  const [connecting, setConnecting] = useState(false);

  // Generate shareable invite link
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Full conversation sync
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const d = await fetch("/api/admin/growth-ops/linkedin-accounts?sync=true").then((r) => r.json());
    setAccounts(d.accounts ?? []);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  // Clean up poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function connectMyAccount() {
    setConnecting(true);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateAuthLink" }),
      }).then((r) => r.json());
      const url = d.url ?? d.link ?? d.hosted_url;
      if (url) window.open(url, "_blank");
      else alert(d.error ?? "Failed to generate auth link");
    } finally {
      setConnecting(false);
    }
  }

  async function generateInviteLink() {
    setGeneratingInvite(true);
    setInviteLink(null);
    setCopied(false);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateAuthLink" }),
      }).then((r) => r.json());
      const url = d.url ?? d.link ?? d.hosted_url;
      if (url) setInviteLink(url);
      else alert(d.error ?? "Failed to generate invite link");
    } finally {
      setGeneratingInvite(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function reconnect(unipileAcctId: string) {
    const d = await fetch("/api/admin/growth-ops/unipile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generateReconnectLink", accountId: unipileAcctId }),
    }).then((r) => r.json());
    const url = d.url ?? d.link ?? d.hosted_url;
    if (url) window.open(url, "_blank");
  }

  function startPolling(unipileAccountId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = await fetch(
          `/api/admin/growth-ops/unipile?action=getSyncStatus&accountId=${unipileAccountId}`
        ).then((r) => r.json());
        const status = d.syncStatus as typeof syncStatus;
        setSyncStatus(status);
        if (d.progress) setSyncProgress(d.progress);
        if (status === "done" || status === "error" || status === "idle") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }

  async function startFullSync(unipileAccountId: string) {
    setSyncingAccount(unipileAccountId);
    setSyncStatus("syncing");
    setSyncProgress(null);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resyncConversations", accountId: unipileAccountId }),
      }).then((r) => r.json());

      if (d.alreadySyncing) {
        setSyncProgress(d.progress);
      }
      // Start polling for progress
      startPolling(unipileAccountId);
    } catch {
      setSyncStatus("error");
      setSyncProgress({ seeded: 0, pages: 0, phase: "error", error: "Failed to start sync" });
    }
  }

  async function revokeAccount(id: string, name: string) {
    if (!confirm(`Remove "${name || "this account"}" and disconnect it from Unipile? This cannot be undone.`)) return;
    setRevoking(id);
    try {
      await fetch(`/api/admin/growth-ops/linkedin-accounts?id=${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setRevoking(null);
    }
  }

  const isSyncing = syncStatus === "syncing";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">LinkedIn Account Management</h1>
        <p className="mt-1 text-sm text-cos-slate">
          Connect LinkedIn accounts via Unipile. Each connected account can send invites and manage conversations.
        </p>
      </div>

      {/* Action cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {/* Connect my own account */}
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Plus className="h-4 w-4 text-cos-electric" />
            </div>
            <div className="flex-1">
              <p className="font-heading text-sm font-semibold text-cos-midnight">Connect my account</p>
              <p className="mt-0.5 text-xs text-cos-slate">
                Opens the LinkedIn login flow directly in a new tab. Use this to connect your own account.
              </p>
              <button
                onClick={connectMyAccount}
                disabled={connecting}
                className="mt-3 flex items-center gap-1.5 rounded-cos-pill bg-cos-electric px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors"
              >
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Connect now
              </button>
            </div>
          </div>
        </div>

        {/* Generate invite link for someone else */}
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Link2 className="h-4 w-4 text-cos-electric" />
            </div>
            <div className="flex-1">
              <p className="font-heading text-sm font-semibold text-cos-midnight">Invite someone to connect</p>
              <p className="mt-0.5 text-xs text-cos-slate">
                Generate a one-time link you can send to a team member. They click it, log in with LinkedIn, and their account appears below automatically.
              </p>
              <button
                onClick={generateInviteLink}
                disabled={generatingInvite}
                className="mt-3 flex items-center gap-1.5 rounded-cos-pill border border-cos-electric px-3.5 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/5 disabled:opacity-60 transition-colors"
              >
                {generatingInvite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Generate invite link
              </button>
            </div>
          </div>

          {/* Link display */}
          {inviteLink && (
            <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs font-medium text-cos-electric">One-time invite link (expires in 30 min)</p>
                <button onClick={() => setInviteLink(null)} className="text-cos-slate hover:text-cos-midnight">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate rounded-cos-md bg-white px-2.5 py-1.5 text-xs font-mono text-cos-slate border border-cos-border">
                  {inviteLink}
                </p>
                <button
                  onClick={copyLink}
                  className="flex shrink-0 items-center gap-1 rounded-cos-md bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-cos-slate">
                Send this link to your team member. Once they connect, their account will appear in the list below within 10 seconds.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Accounts list */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-sm font-semibold text-cos-midnight">
          Connected accounts {accounts.length > 0 && <span className="ml-1.5 rounded-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{accounts.length}</span>}
        </h2>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center">
          <p className="text-sm font-medium text-cos-slate-dim">No accounts connected yet</p>
          <p className="mt-1 text-xs text-cos-slate">Use one of the options above to connect a LinkedIn account.</p>
        </div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Display name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">LinkedIn username</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Connected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.CONNECTING;
                const isRevoking = revoking === a.id;
                const isThisSyncing = isSyncing && syncingAccount === a.unipileAccountId;
                return (
                  <tr key={a.id} className="border-b border-cos-border/50 last:border-0 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-cos-midnight">{a.displayName || a.unipileAccountId}</td>
                    <td className="px-4 py-3 text-cos-slate">{a.linkedinUsername ? `@${a.linkedinUsername}` : "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-cos-slate">
                      {a.createdAt && !isNaN(new Date(a.createdAt).getTime())
                        ? new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {a.status === "OK" && (
                          <button
                            onClick={() => startFullSync(a.unipileAccountId)}
                            disabled={isSyncing}
                            className="inline-flex items-center gap-1 text-xs text-cos-electric hover:underline disabled:opacity-40"
                            title="Full 12-month conversation sync from Unipile"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isThisSyncing ? "animate-spin" : ""}`} />
                            {isThisSyncing ? "Syncing\u2026" : "Full sync"}
                          </button>
                        )}
                        {(a.status === "CREDENTIALS" || a.status === "ERROR") && (
                          <button
                            onClick={() => reconnect(a.unipileAccountId)}
                            className="inline-flex items-center gap-1 text-xs text-cos-ember hover:underline"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Reconnect
                          </button>
                        )}
                        <button
                          onClick={() => revokeAccount(a.id, a.displayName)}
                          disabled={isRevoking}
                          className="inline-flex items-center gap-1 text-xs text-cos-slate hover:text-red-600 disabled:opacity-40 transition-colors"
                          title="Remove and disconnect this account"
                        >
                          {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sync progress banner */}
      {syncingAccount && syncStatus === "syncing" && (
        <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
            <p className="text-sm font-medium text-cos-electric">
              {syncProgress?.phase === "enriching" ? "Enriching profiles\u2026" : "Syncing conversations\u2026"}
            </p>
          </div>
          {syncProgress && (
            <p className="text-xs text-cos-slate ml-6">
              {syncProgress.seeded.toLocaleString()} conversations fetched across {syncProgress.pages} pages
              {syncProgress.phase === "enriching" && " \u2014 now resolving names and avatars"}
            </p>
          )}
          <p className="text-[10px] text-cos-slate-dim ml-6 mt-1">
            Fetching up to 12 months of history. This may take a few minutes. You can leave this page.
          </p>
        </div>
      )}

      {syncingAccount && syncStatus === "done" && syncProgress && (
        <div className="mt-4 rounded-cos-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check className="mb-0.5 mr-1.5 inline h-4 w-4" />
          Full sync complete: {syncProgress.seeded.toLocaleString()} conversations synced across {syncProgress.pages} pages.
          {(syncProgress.enriched ?? 0) > 0 && ` ${syncProgress.enriched} profiles enriched.`}
        </div>
      )}

      {syncingAccount && syncStatus === "error" && (
        <div className="mt-4 rounded-cos-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mb-0.5 mr-1.5 inline h-4 w-4" />
          Sync failed{syncProgress?.error ? `: ${syncProgress.error}` : ""}
          {syncProgress && syncProgress.seeded > 0 && (
            <span className="ml-1 text-red-500">({syncProgress.seeded} conversations were synced before the error)</span>
          )}
        </div>
      )}
    </div>
  );
}
