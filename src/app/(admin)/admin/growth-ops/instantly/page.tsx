"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2, TrendingUp, Send, Eye, MousePointer } from "lucide-react";

interface Campaign { id: string; name: string; status: string; created_at?: string; }
interface Analytics { campaign_id: string; sent?: number; opened?: number; clicked?: number; replied?: number; bounced?: number; open_rate?: number; click_rate?: number; reply_rate?: number; }

export default function InstantlyPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, Analytics>>({});
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await fetch("/api/admin/growth-ops/instantly?action=listCampaigns").then((r) => r.json());
      const campaigns = d.data ?? d.campaigns ?? d.items ?? [];
      setCampaigns(campaigns);
      if (campaigns.length > 0) {
        setLoadingAnalytics(true);
        const ids = campaigns.slice(0, 20).map((c: Campaign) => c.id);
        const a = await fetch("/api/admin/growth-ops/instantly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getAnalytics", campaignIds: ids }),
        }).then((r) => r.json());
        const map: Record<string, Analytics> = {};
        for (const entry of (a.data ?? a.items ?? [])) {
          map[entry.campaign_id] = entry;
        }
        setAnalytics(map);
        setLoadingAnalytics(false);
      }
      setLoading(false);
    })();
  }, []);

  const totals = Object.values(analytics).reduce((acc, a) => ({
    sent: acc.sent + (a.sent ?? 0),
    opened: acc.opened + (a.opened ?? 0),
    clicked: acc.clicked + (a.clicked ?? 0),
    replied: acc.replied + (a.replied ?? 0),
  }), { sent: 0, opened: 0, clicked: 0, replied: 0 });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">Instantly Campaigns</h1>
        <p className="text-sm text-cos-slate mt-1">Email outreach campaign performance.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        {[
          { label: "Sent", value: totals.sent, icon: Send, color: "text-cos-electric" },
          { label: "Opened", value: totals.opened, icon: Eye, color: "text-cos-signal" },
          { label: "Clicked", value: totals.clicked, icon: MousePointer, color: "text-cos-warm" },
          { label: "Replied", value: totals.replied, icon: TrendingUp, color: "text-cos-ember" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
            <div className={`mb-2 ${stat.color}`}><stat.icon className="h-4 w-4" /></div>
            <p className="font-heading text-2xl font-bold text-cos-midnight">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-cos-slate mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Sent</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Open %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Click %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Reply %</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-cos-slate">No campaigns found.</td></tr>}
              {campaigns.map((c) => {
                const a = analytics[c.id];
                const sent = a?.sent ?? 0;
                const openRate = a?.open_rate != null ? a.open_rate : sent > 0 ? ((a?.opened ?? 0) / sent * 100) : 0;
                const clickRate = a?.click_rate != null ? a.click_rate : sent > 0 ? ((a?.clicked ?? 0) / sent * 100) : 0;
                const replyRate = a?.reply_rate != null ? a.reply_rate : sent > 0 ? ((a?.replied ?? 0) / sent * 100) : 0;
                return (
                  <tr key={c.id} className="border-b border-cos-border/50 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-cos-midnight">{c.name}</td>
                    <td className="px-4 py-3"><span className="rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">{c.status}</span></td>
                    <td className="px-4 py-3 text-right text-cos-slate">{loadingAnalytics ? "—" : sent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-cos-slate">{loadingAnalytics ? "—" : `${openRate.toFixed(1)}%`}</td>
                    <td className="px-4 py-3 text-right text-cos-slate">{loadingAnalytics ? "—" : `${clickRate.toFixed(1)}%`}</td>
                    <td className="px-4 py-3 text-right text-cos-slate">{loadingAnalytics ? "—" : `${replyRate.toFixed(1)}%`}</td>
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
