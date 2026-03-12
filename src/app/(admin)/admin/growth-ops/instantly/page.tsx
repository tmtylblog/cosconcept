"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, Loader2, RefreshCw, ChevronDown, ChevronRight, Users, Reply, MousePointer, Eye } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: number;
  daily_limit?: number;
  email_list?: string[];
  timestamp_created?: string;
  timestamp_updated?: string;
}

interface CampaignStats {
  total: number;
  contacted: number;
  opened: number;
  replied: number;
  clicked: number;
  loading: boolean;
  error?: string;
}

// Instantly v2 status codes
const STATUS: Record<number, { label: string; dot: string; text: string; bg: string }> = {
  0:  { label: "Active",    dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  1:  { label: "Paused",    dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50" },
  2:  { label: "Completed", dot: "bg-cos-slate",    text: "text-cos-slate-dim", bg: "bg-cos-cloud" },
  3:  { label: "Draft",     dot: "bg-cos-border",   text: "text-cos-slate",   bg: "bg-cos-cloud" },
  [-1]: { label: "Ended",   dot: "bg-cos-slate",    text: "text-cos-slate-dim", bg: "bg-cos-cloud" },
  [-2]: { label: "Ended",   dot: "bg-cos-slate",    text: "text-cos-slate-dim", bg: "bg-cos-cloud" },
};

function pct(num: number, denom: number) {
  if (!denom) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

export default function InstantlyPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "completed" | "draft">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/growth-ops/instantly?action=listCampaigns").then(r => r.json());
      setCampaigns(d.items ?? d.campaigns ?? d.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadStats(campaignId: string) {
    setStats(s => ({ ...s, [campaignId]: { total: 0, contacted: 0, opened: 0, replied: 0, clicked: 0, loading: true } }));
    try {
      // Fetch up to 500 leads to aggregate
      let cursor: string | undefined;
      let total = 0, contacted = 0, opened = 0, replied = 0, clicked = 0;
      for (let page = 0; page < 5; page++) {
        const d = await fetch("/api/admin/growth-ops/instantly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "listLeads", campaignId, limit: 100, cursor }),
        }).then(r => r.json());
        const items = d.items ?? [];
        total += items.length;
        for (const lead of items) {
          if ((lead.status ?? 0) >= 1) contacted++;
          if ((lead.email_open_count ?? 0) > 0) opened++;
          if ((lead.email_reply_count ?? 0) > 0) replied++;
          if ((lead.email_click_count ?? 0) > 0) clicked++;
        }
        cursor = d.next_starting_after;
        if (!cursor || items.length < 100) break;
      }
      setStats(s => ({ ...s, [campaignId]: { total, contacted, opened, replied, clicked, loading: false } }));
    } catch (e) {
      setStats(s => ({ ...s, [campaignId]: { total: 0, contacted: 0, opened: 0, replied: 0, clicked: 0, loading: false, error: String(e) } }));
    }
  }

  function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      if (!stats[id]) loadStats(id);
    }
  }

  const STATUS_FILTER_MAP: Record<typeof filter, number[]> = {
    all: [0, 1, 2, 3, -1, -2],
    active: [0],
    paused: [1],
    completed: [2],
    draft: [3],
  };

  const filtered = campaigns.filter(c => STATUS_FILTER_MAP[filter].includes(c.status));

  const activeCount  = campaigns.filter(c => c.status === 0).length;
  const pausedCount  = campaigns.filter(c => c.status === 1).length;
  const doneCount    = campaigns.filter(c => c.status === 2).length;
  const draftCount   = campaigns.filter(c => c.status === 3).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Instantly Campaigns</h1>
          <p className="mt-1 text-sm text-cos-slate">Email outreach campaign performance across all senders.</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active", value: activeCount, dot: "bg-emerald-500", onClick: () => setFilter("active") },
          { label: "Paused", value: pausedCount, dot: "bg-amber-500",   onClick: () => setFilter("paused") },
          { label: "Completed", value: doneCount,  dot: "bg-cos-slate",  onClick: () => setFilter("completed") },
          { label: "Draft",  value: draftCount,  dot: "bg-cos-border", onClick: () => setFilter("draft") },
        ].map(s => (
          <button
            key={s.label}
            onClick={s.onClick}
            className="rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm text-left hover:border-cos-electric/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-cos-slate">{s.label}</span>
            </div>
            <p className="font-heading text-2xl font-bold text-cos-midnight">{s.value}</p>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 border-b border-cos-border">
        {(["all", "active", "paused", "completed", "draft"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              filter === f
                ? "border-cos-electric text-cos-electric"
                : "border-transparent text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {f} {f !== "all" && <span className="ml-1 text-[10px] opacity-60">{STATUS_FILTER_MAP[f].flatMap(s => campaigns.filter(c => c.status === s)).length}</span>}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-cos-slate pr-1">{filtered.length} campaigns</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-10 text-center">
          <p className="text-sm text-cos-slate">No campaigns in this category.</p>
        </div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          {filtered.map((c, i) => {
            const s = STATUS[c.status] ?? STATUS[3];
            const st = stats[c.id];
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className={i < filtered.length - 1 ? "border-b border-cos-border/50" : ""}>
                {/* Row */}
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cos-cloud/40 transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cos-slate" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate" />
                  }
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                  <span className="flex-1 text-sm font-medium text-cos-midnight truncate">{c.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                  {c.daily_limit && (
                    <span className="shrink-0 text-xs text-cos-slate hidden sm:inline">{c.daily_limit}/day</span>
                  )}
                  {c.email_list && c.email_list.length > 0 && (
                    <span className="shrink-0 text-xs text-cos-slate hidden sm:inline">{c.email_list.length} sender{c.email_list.length !== 1 ? "s" : ""}</span>
                  )}
                </button>

                {/* Expanded stats */}
                {isOpen && (
                  <div className="px-10 pb-4 bg-cos-cloud/20 border-t border-cos-border/30">
                    {!st || st.loading ? (
                      <div className="flex items-center gap-2 py-4 text-xs text-cos-slate">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading lead stats…
                      </div>
                    ) : st.error ? (
                      <p className="py-3 text-xs text-cos-ember">{st.error}</p>
                    ) : (
                      <div className="pt-3">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-3">
                          {[
                            { icon: Users,       label: "Leads sampled", value: st.total.toLocaleString() },
                            { icon: Mail,        label: "Contacted",     value: st.contacted.toLocaleString() },
                            { icon: Eye,         label: "Opened",        value: `${st.opened.toLocaleString()} (${pct(st.opened, st.contacted)})` },
                            { icon: Reply,       label: "Replied",       value: `${st.replied.toLocaleString()} (${pct(st.replied, st.contacted)})` },
                            { icon: MousePointer,label: "Clicked",       value: `${st.clicked.toLocaleString()} (${pct(st.clicked, st.contacted)})` },
                          ].map(stat => (
                            <div key={stat.label} className="rounded-cos-lg border border-cos-border bg-white px-3 py-2">
                              <div className="flex items-center gap-1.5 mb-1 text-cos-slate"><stat.icon className="h-3 w-3" /><span className="text-[10px] uppercase tracking-wide font-medium">{stat.label}</span></div>
                              <p className="text-sm font-semibold text-cos-midnight">{stat.value}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-cos-slate">Stats based on first {st.total} leads sampled (up to 500). Click again to refresh.</p>
                        {c.email_list && c.email_list.length > 0 && (
                          <p className="text-[11px] text-cos-slate mt-1">Senders: {c.email_list.join(", ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
