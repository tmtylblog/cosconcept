"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  Mail,
  Send,
  Eye,
  RefreshCw,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/admin/stat-card";

interface Campaign {
  id: number;
  name: string;
  state: string;
  type: string;
  created: number;
  updated: number;
  emails_sent: number;
  active_customers: number;
}

interface WorkspaceMessage {
  id: string;
  recipient: string;
  subject: string;
  type: string;
  campaign_id: number | null;
  created: number;
  metrics: {
    sent?: number;
    delivered?: number;
    opened?: number;
  };
}

interface CioData {
  configured: boolean;
  campaigns: Campaign[];
  messages: WorkspaceMessage[];
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  regular:       "Broadcast",
  automated:     "Automated",
  transactional: "Transactional",
};

export default function CioDashboardPage() {
  const [data, setData] = useState<CioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/customer-success/cio");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch CIO data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
        <div className="h-72 rounded-cos-xl bg-cos-border/50" />
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-cos-xl border border-cos-border bg-cos-surface py-20">
        <BarChart2 className="h-10 w-10 text-cos-slate-light" />
        <p className="mt-3 text-sm font-medium text-cos-midnight">Customer.io not configured</p>
        <p className="mt-1 text-xs text-cos-slate">Set CUSTOMERIO_APP_API_KEY to connect.</p>
      </div>
    );
  }

  const { campaigns, messages } = data;

  // Only show campaigns that are actively running
  const activeCampaigns = campaigns.filter((c) => c.state === "sending");
  // metrics.sent/opened are Unix timestamps (truthy = event occurred), not counts
  const sentMessages = messages.filter((m) => !!m.metrics.sent || !!m.metrics.delivered);
  const openedCount = sentMessages.filter((m) => !!m.metrics.opened).length;
  const openRate = sentMessages.length > 0 ? ((openedCount / sentMessages.length) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            CIO Dashboard
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Live data from Customer.io — campaigns and email activity.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-ember/30 bg-cos-ember/5 px-4 py-3 text-sm text-cos-ember">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Zap className="h-4 w-4" />} label="Active Campaigns" value={activeCampaigns.length} iconColor="text-cos-signal" iconBg="bg-cos-signal/10" sub="currently running" />
        <StatCard icon={<Mail className="h-4 w-4" />} label="Emails Sent" value={sentMessages.length} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" sub="in last 50 fetched" />
        <StatCard icon={<Eye className="h-4 w-4" />} label="Open Rate" value={`${openRate}%`} iconColor="text-cos-warm" iconBg="bg-cos-warm/10" sub={`${openedCount} of ${sentMessages.length} opened`} />
        <StatCard icon={<Send className="h-4 w-4" />} label="Not Opened" value={sentMessages.length - openedCount} iconColor="text-cos-slate" iconBg="bg-cos-slate/10" />
      </div>

      {/* Active Campaigns */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-cos-border">
          <h2 className="text-sm font-semibold text-cos-midnight">
            Active Campaigns
            <span className="ml-2 text-xs font-normal text-cos-slate">{activeCampaigns.length} running</span>
          </h2>
        </div>
        {activeCampaigns.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cos-slate">No active campaigns right now.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Name</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Type</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Emails Sent</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {activeCampaigns.map((c) => {
                return (
                  <tr key={c.id} className="transition-colors hover:bg-cos-electric/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-cos-signal animate-pulse" />
                        <span className="font-medium text-cos-midnight">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-cos-slate">
                      {CAMPAIGN_TYPE_LABELS[c.type] ?? c.type}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-cos-midnight">
                      {(c.emails_sent ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs text-cos-slate">
                      {new Date(c.updated * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent sent emails */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-cos-border">
          <h2 className="text-sm font-semibold text-cos-midnight">
            Recent Transactional Emails
            <span className="ml-2 text-xs font-normal text-cos-slate">{sentMessages.length} sent</span>
          </h2>
        </div>
        {sentMessages.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cos-slate">No sent emails found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Subject</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Recipient</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Opened</span>
                </th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {sentMessages.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-cos-electric/[0.02]">
                  <td className="px-5 py-3 font-medium text-cos-midnight max-w-xs truncate">{m.subject || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-cos-slate truncate max-w-[180px]">{m.recipient}</td>
                  <td className="px-5 py-3">
                    {m.metrics.opened ? (
                      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
                        <Eye className="h-2.5 w-2.5" /> Opened
                      </span>
                    ) : (
                      <span className="text-xs text-cos-slate-light">Not opened</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-cos-slate">
                    {new Date(m.created * 1000).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

