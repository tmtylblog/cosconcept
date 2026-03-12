"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Loader2, ExternalLink, AlertCircle, CheckCircle } from "lucide-react";

interface Account { id: string; unipile_account_id: string; display_name: string; linkedin_username: string | null; status: string; created_at: string; }

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  OK: { bg: "bg-cos-signal/10", text: "text-cos-signal", dot: "bg-cos-signal" },
  CONNECTING: { bg: "bg-cos-warm/10", text: "text-cos-warm", dot: "bg-cos-warm" },
  CREDENTIALS: { bg: "bg-cos-ember/10", text: "text-cos-ember", dot: "bg-cos-ember" },
  ERROR: { bg: "bg-cos-ember/10", text: "text-cos-ember", dot: "bg-cos-ember" },
};

export default function LinkedInAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    const d = await fetch("/api/admin/growth-ops/linkedin-accounts").then((r) => r.json());
    setAccounts(d.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generateAuthLink() {
    setGenerating(true);
    const d = await fetch("/api/admin/growth-ops/unipile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generateAuthLink" }),
    }).then((r) => r.json());
    setGenerating(false);
    if (d.url || d.link || d.hosted_url) {
      window.open(d.url ?? d.link ?? d.hosted_url, "_blank");
    }
  }

  async function reconnect(unipileAccountId: string) {
    const d = await fetch("/api/admin/growth-ops/unipile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generateReconnectLink", accountId: unipileAccountId }),
    }).then((r) => r.json());
    if (d.url || d.link || d.hosted_url) {
      window.open(d.url ?? d.link ?? d.hosted_url, "_blank");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">LinkedIn Accounts</h1>
          <p className="text-sm text-cos-slate mt-1">Connected LinkedIn accounts via Unipile.</p>
        </div>
        <button
          onClick={generateAuthLink}
          disabled={generating}
          className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Connect Account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-cos-xl border border-cos-border bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-cos-slate">No LinkedIn accounts connected yet.</p>
          <button onClick={generateAuthLink} className="mt-4 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover">Connect your first account</button>
        </div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Username</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.CONNECTING;
                return (
                  <tr key={a.id} className="border-b border-cos-border/50 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-cos-midnight">{a.display_name || a.unipile_account_id}</td>
                    <td className="px-4 py-3 text-cos-slate">{a.linkedin_username ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(a.status === "CREDENTIALS" || a.status === "ERROR") && (
                        <button
                          onClick={() => reconnect(a.unipile_account_id)}
                          className="text-xs text-cos-electric hover:underline"
                        >
                          Reconnect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
