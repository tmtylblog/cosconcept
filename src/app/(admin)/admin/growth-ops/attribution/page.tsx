"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

interface AttributionRow {
  id: string;
  userId: string;
  matchMethod: string;
  instantlyCampaignName: string | null;
  linkedinCampaignId: string | null;
  matchedAt: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
}

const METHOD_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  email_exact:  { label: "Email exact",   bg: "bg-emerald-50",  text: "text-emerald-700" },
  instantly:    { label: "Instantly",     bg: "bg-cos-signal/10", text: "text-cos-signal" },
  linkedin_url: { label: "LinkedIn URL",  bg: "bg-cos-electric/10", text: "text-cos-electric" },
  name_domain:  { label: "Name + domain", bg: "bg-amber-50",    text: "text-amber-700" },
  none:         { label: "Unattributed",  bg: "bg-cos-cloud",   text: "text-cos-slate-dim" },
};

export default function AttributionPage() {
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [stats, setStats] = useState<{ total: number; matched: number; byMethod: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/growth-ops/attribution").then((r) => r.json());
      setRows(d.rows ?? []);
      setStats({ total: d.total ?? 0, matched: d.matched ?? 0, byMethod: d.byMethod ?? {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.matchMethod === filter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Attribution</h1>
          <p className="text-sm text-cos-slate mt-1">
            Every signup is automatically checked against Instantly campaigns and LinkedIn invite lists.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "all",         label: "Total signups",    value: stats.total },
            { key: "email_exact", label: "Email exact",      value: stats.byMethod.email_exact ?? 0 },
            { key: "instantly",   label: "Via Instantly",    value: (stats.byMethod.instantly ?? 0) + (stats.byMethod.email_exact ?? 0) },
            { key: "linkedin_url",label: "Via LinkedIn",     value: stats.byMethod.linkedin_url ?? 0 },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`rounded-cos-xl border bg-white p-4 shadow-sm text-left transition-colors hover:border-cos-electric/40 ${filter === s.key ? "border-cos-electric" : "border-cos-border"}`}
            >
              <p className="text-xs text-cos-slate mb-1">{s.label}</p>
              <p className="font-heading text-2xl font-bold text-cos-midnight">{s.value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 border-b border-cos-border">
        {(["all", "email_exact", "instantly", "linkedin_url", "name_domain", "none"] as const).map((f) => {
          const m = METHOD_STYLE[f] ?? METHOD_STYLE.none;
          const count = f === "all" ? rows.length : rows.filter((r) => r.matchMethod === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                filter === f ? "border-cos-electric text-cos-electric" : "border-transparent text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {m.label} <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center shadow-sm">
          <BarChart3 className="h-8 w-8 mx-auto mb-3 text-cos-slate opacity-30" />
          <p className="text-sm text-cos-slate">
            {rows.length === 0
              ? "No signups recorded yet. Attribution events are created automatically on each new signup."
              : "No signups match this filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const m = METHOD_STYLE[r.matchMethod] ?? METHOD_STYLE.none;
                const campaign = r.instantlyCampaignName ?? (r.linkedinCampaignId ? `LinkedIn campaign` : null);
                return (
                  <tr key={r.id} className="border-b border-cos-border/50 last:border-0 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-cos-midnight">{r.userName ?? "—"}</p>
                      <p className="text-xs text-cos-slate">{r.userEmail ?? r.userId}</p>
                      {r.contactFirstName && <p className="text-xs text-cos-slate-dim">{[r.contactFirstName, r.contactLastName].filter(Boolean).join(" ")}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.text}`}>
                        {m.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-cos-slate">{campaign ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-cos-slate">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
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
