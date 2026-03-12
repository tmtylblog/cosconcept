"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb,
  Share2,
  TrendingUp,
  Star,
  RefreshCw,
  ArrowUpRight,
  Zap,
  Radio,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Period = "7d" | "30d" | "90d" | "all";

interface OppData {
  period: string;
  opportunities: {
    total: number;
    byStatus: Record<string, number>;
    bySignal: Record<string, number>;
    byPriority: Record<string, number>;
    bySource: Record<string, number>;
  };
  leads: {
    total: number;
    byStatus: Record<string, number>;
    avgQuality: number;
    qualityTiers: { strong: number; good: number; adequate: number; weak: number };
    shares: { total: number; claimed: number; viewed: number };
  };
  recentOpportunities: {
    id: string;
    title: string;
    signalType: string;
    priority: string;
    resolutionApproach: string;
    status: string;
    source: string;
    firmName: string | null;
    requiredCategories: string[] | null;
    createdAt: string;
  }[];
  recentLeads: {
    id: string;
    title: string;
    status: string;
    qualityScore: number;
    firmName: string | null;
    timeline: string | null;
    estimatedValue: string | null;
    requiredCategories: string[] | null;
    anonymizeClient: boolean;
    clientName: string | null;
    createdAt: string;
  }[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function qualityColor(score: number) {
  if (score >= 90) return "bg-cos-signal/15 text-cos-signal";
  if (score >= 75) return "bg-cos-electric/15 text-cos-electric";
  if (score >= 60) return "bg-cos-warm/15 text-cos-warm";
  return "bg-cos-slate/15 text-cos-slate";
}

function qualityLabel(score: number) {
  if (score >= 90) return "Strong";
  if (score >= 75) return "Good";
  if (score >= 60) return "Adequate";
  return "Weak";
}

function priorityColor(p: string) {
  if (p === "high") return "bg-cos-ember/15 text-cos-ember";
  if (p === "medium") return "bg-cos-warm/15 text-cos-warm";
  return "bg-cos-slate/15 text-cos-slate";
}

function statusColor(s: string) {
  switch (s) {
    case "new": return "bg-cos-electric/15 text-cos-electric";
    case "in_review": return "bg-cos-warm/15 text-cos-warm";
    case "actioned": return "bg-cos-signal/15 text-cos-signal";
    case "dismissed": return "bg-cos-slate/15 text-cos-slate";
    case "open": return "bg-cos-electric/15 text-cos-electric";
    case "shared": return "bg-cos-warm/15 text-cos-warm";
    case "claimed": return "bg-cos-signal/15 text-cos-signal";
    case "won": return "bg-emerald-500/15 text-emerald-600";
    case "lost": return "bg-cos-ember/15 text-cos-ember";
    default: return "bg-cos-slate/15 text-cos-slate";
  }
}

function StatCard({
  label, value, sub, icon: Icon, color = "text-cos-electric",
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-cos-xs">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-cos-slate">{label}</p>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-cos-midnight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cos-slate">{sub}</p>}
    </div>
  );
}

const PAGE_SIZE = 100;

export default function AdminOpportunitiesPage() {
  const router = useRouter();
  const [data, setData] = useState<OppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [oppPage, setOppPage] = useState(1);
  const [leadPage, setLeadPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/opportunities?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[Admin/Opportunities]", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const claimRate = data?.leads.shares.total
    ? Math.round((data.leads.shares.claimed / data.leads.shares.total) * 100)
    : 0;

  const actionRate = data?.opportunities.total
    ? Math.round(((data.opportunities.byStatus["actioned"] ?? 0) / data.opportunities.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">
            Opportunities & Leads
          </h1>
          <p className="mt-0.5 text-sm text-cos-slate">
            Intelligence extracted from calls and emails, promoted to partner network leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-cos-pill px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-cos-electric text-white"
                  : "bg-cos-cloud text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {p === "all" ? "All time" : p}
            </button>
          ))}
          <button
            onClick={fetchData}
            disabled={loading}
            className="ml-1 rounded-cos-lg p-2 text-cos-slate hover:text-cos-midnight"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Opportunities"
          value={data?.opportunities.total ?? "—"}
          sub={`${data?.opportunities.byStatus["new"] ?? 0} new · ${data?.opportunities.byStatus["in_review"] ?? 0} in review`}
          icon={Lightbulb}
          color="text-cos-electric"
        />
        <StatCard
          label="Action Rate"
          value={loading ? "—" : `${actionRate}%`}
          sub="Opportunities promoted or dismissed"
          icon={ArrowUpRight}
          color="text-cos-signal"
        />
        <StatCard
          label="Leads Posted"
          value={data?.leads.total ?? "—"}
          sub={`Avg quality score: ${data?.leads.avgQuality ?? 0}/100`}
          icon={Share2}
          color="text-cos-warm"
        />
        <StatCard
          label="Network Claim Rate"
          value={loading ? "—" : `${claimRate}%`}
          sub={`${data?.leads.shares.total ?? 0} shares · ${data?.leads.shares.claimed ?? 0} claimed`}
          icon={TrendingUp}
          color="text-cos-ember"
        />
      </div>

      {/* Two columns: opp breakdown + lead quality */}
      <div className="grid grid-cols-2 gap-4">
        {/* Opportunity breakdown */}
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-cos-xs">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">Opportunity Breakdown</h2>
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-cos-slate uppercase tracking-wide">By Signal</p>
              <div className="flex gap-2">
                {["direct", "latent"].map((sig) => (
                  <div key={sig} className="flex-1 rounded-cos-lg border border-cos-border p-3 text-center">
                    <p className="text-lg font-bold text-cos-midnight">{data?.opportunities.bySignal[sig] ?? 0}</p>
                    <p className="text-xs text-cos-slate capitalize">{sig}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-cos-slate uppercase tracking-wide">By Priority</p>
              <div className="flex gap-2">
                {["high", "medium", "low"].map((pri) => (
                  <div key={pri} className="flex-1 rounded-cos-lg border border-cos-border p-3 text-center">
                    <p className="text-lg font-bold text-cos-midnight">{data?.opportunities.byPriority[pri] ?? 0}</p>
                    <p className="text-xs text-cos-slate capitalize">{pri}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-cos-slate uppercase tracking-wide">By Source</p>
              <div className="flex gap-2">
                {["call", "email", "manual"].map((src) => (
                  <div key={src} className="flex-1 rounded-cos-lg border border-cos-border p-3 text-center">
                    <p className="text-lg font-bold text-cos-midnight">{data?.opportunities.bySource[src] ?? 0}</p>
                    <p className="text-xs text-cos-slate capitalize">{src}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Lead quality tiers */}
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-cos-xs">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">Lead Quality Distribution</h2>
          <p className="mt-0.5 text-xs text-cos-slate">Hidden score — not shown to partners</p>
          <div className="mt-4 space-y-2">
            {(["strong", "good", "adequate", "weak"] as const).map((tier) => {
              const n = data?.leads.qualityTiers[tier] ?? 0;
              const total = data?.leads.total ?? 1;
              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
              const colors: Record<string, string> = {
                strong: "bg-cos-signal", good: "bg-cos-electric",
                adequate: "bg-cos-warm", weak: "bg-cos-slate",
              };
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-cos-slate capitalize">{tier}</span>
                  <div className="flex-1 rounded-full bg-cos-cloud h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colors[tier]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-medium text-cos-midnight">{n}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-cos-border pt-4">
            <h3 className="text-xs font-medium text-cos-slate uppercase tracking-wide">Lead Status</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(data?.leads.byStatus ?? {}).map(([s, n]) => (
                <span key={s} className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${statusColor(s)}`}>
                  {s}: {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Opportunities table */}
      <div className="rounded-cos-xl border border-cos-border bg-white shadow-cos-xs">
        <div className="flex items-center justify-between border-b border-cos-border px-5 py-4">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-cos-electric" />
            Recent Opportunities
          </h2>
          <span className="text-xs text-cos-slate">{data?.recentOpportunities.length ?? 0} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50 text-xs font-medium uppercase tracking-wide text-cos-slate">
                <th className="px-4 py-2.5 text-left">Title</th>
                <th className="px-4 py-2.5 text-left">Firm</th>
                <th className="px-4 py-2.5 text-left">Signal</th>
                <th className="px-4 py-2.5 text-left">Priority</th>
                <th className="px-4 py-2.5 text-left">Resolution</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/50">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 w-24 animate-pulse rounded bg-cos-cloud" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (data?.recentOpportunities ?? [])
                    .slice((oppPage - 1) * PAGE_SIZE, oppPage * PAGE_SIZE)
                    .map((opp) => (
                    <tr
                      key={opp.id}
                      className="cursor-pointer hover:bg-cos-cloud/30"
                      onClick={() => router.push(`/admin/opportunities/${opp.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="max-w-[200px] truncate font-medium text-cos-midnight">{opp.title}</p>
                        {opp.requiredCategories && opp.requiredCategories.length > 0 && (
                          <p className="mt-0.5 text-xs text-cos-slate truncate max-w-[200px]">
                            {opp.requiredCategories[0]}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{opp.firmName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                          opp.signalType === "latent"
                            ? "bg-cos-warm/15 text-cos-warm"
                            : "bg-cos-electric/15 text-cos-electric"
                        }`}>
                          {opp.signalType === "latent" ? <Radio className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
                          {opp.signalType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${priorityColor(opp.priority)}`}>
                          {opp.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate capitalize">
                        {opp.resolutionApproach}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${statusColor(opp.status)}`}>
                          {opp.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate whitespace-nowrap">
                        {fmtDate(opp.createdAt)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {(data?.recentOpportunities.length ?? 0) > PAGE_SIZE && (() => {
          const total = data?.recentOpportunities.length ?? 0;
          const totalPages = Math.ceil(total / PAGE_SIZE);
          return (
            <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
              <span className="text-xs text-cos-slate">
                Showing {(oppPage - 1) * PAGE_SIZE + 1}–{Math.min(oppPage * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setOppPage((p) => Math.max(1, p - 1))} disabled={oppPage === 1} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Previous</button>
                <span className="text-xs text-cos-slate">Page {oppPage} of {totalPages}</span>
                <button onClick={() => setOppPage((p) => Math.min(totalPages, p + 1))} disabled={oppPage === totalPages} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Next</button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Recent Leads table */}
      <div className="rounded-cos-xl border border-cos-border bg-white shadow-cos-xs">
        <div className="flex items-center justify-between border-b border-cos-border px-5 py-4">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight flex items-center gap-2">
            <Share2 className="h-4 w-4 text-cos-warm" />
            Recent Leads
          </h2>
          <span className="text-xs text-cos-slate">{data?.recentLeads.length ?? 0} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50 text-xs font-medium uppercase tracking-wide text-cos-slate">
                <th className="px-4 py-2.5 text-left">Title</th>
                <th className="px-4 py-2.5 text-left">Firm</th>
                <th className="px-4 py-2.5 text-left">Quality</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Value</th>
                <th className="px-4 py-2.5 text-left">Timeline</th>
                <th className="px-4 py-2.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/50">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 w-24 animate-pulse rounded bg-cos-cloud" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (data?.recentLeads ?? [])
                    .slice((leadPage - 1) * PAGE_SIZE, leadPage * PAGE_SIZE)
                    .map((lead) => (
                    <tr key={lead.id} className="hover:bg-cos-cloud/30">
                      <td className="px-4 py-3">
                        <p className="max-w-[200px] truncate font-medium text-cos-midnight">{lead.title}</p>
                        {lead.clientName && !lead.anonymizeClient && (
                          <p className="mt-0.5 text-xs text-cos-slate">{lead.clientName}</p>
                        )}
                        {lead.anonymizeClient && (
                          <p className="mt-0.5 text-xs italic text-cos-slate">Client anonymized</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{lead.firmName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-xs font-semibold ${qualityColor(lead.qualityScore)}`}>
                          <Star className="h-2.5 w-2.5" />
                          {lead.qualityScore} · {qualityLabel(lead.qualityScore)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${statusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate">
                        {lead.estimatedValue ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate">
                        {lead.timeline ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate whitespace-nowrap">
                        {fmtDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {(data?.recentLeads.length ?? 0) > PAGE_SIZE && (() => {
          const total = data?.recentLeads.length ?? 0;
          const totalPages = Math.ceil(total / PAGE_SIZE);
          return (
            <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
              <span className="text-xs text-cos-slate">
                Showing {(leadPage - 1) * PAGE_SIZE + 1}–{Math.min(leadPage * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setLeadPage((p) => Math.max(1, p - 1))} disabled={leadPage === 1} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Previous</button>
                <span className="text-xs text-cos-slate">Page {leadPage} of {totalPages}</span>
                <button onClick={() => setLeadPage((p) => Math.min(totalPages, p + 1))} disabled={leadPage === totalPages} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Next</button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
