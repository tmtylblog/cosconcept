"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  Mail,
  Send,
  Eye,
  RefreshCw,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const CAMPAIGN_STATE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  sending:  { label: "Sending",  color: "text-cos-signal bg-cos-signal/10",   icon: Send },
  sent:     { label: "Sent",     color: "text-cos-electric bg-cos-electric/10", icon: CheckCircle2 },
  draft:    { label: "Draft",    color: "text-cos-slate bg-cos-slate/10",     icon: Clock },
  paused:   { label: "Paused",   color: "text-cos-warm bg-cos-warm/10",       icon: PauseCircle },
  stopped:  { label: "Stopped",  color: "text-cos-ember bg-cos-ember/10",     icon: XCircle },
  archived: { label: "Archived", color: "text-cos-slate-light bg-cos-cloud",  icon: XCircle },
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  regular:       "Broadcast",
  automated:     "Automated",
  transactional: "Transactional",
};

export default function CioDashboardPage() {
  const [data, setData] = useState<CioData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customer-success/cio");
      if (res.ok) setData(await res.json());
    } catch {
      console.error("Failed to fetch CIO data");
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

  const activeCampaigns = campaigns.filter((c) => c.state === "sending" || c.state === "sent");
  const totalSent = messages.reduce((sum, m) => sum + (m.metrics.sent ?? 0), 0);
  const totalOpened = messages.reduce((sum, m) => sum + (m.metrics.opened ?? 0), 0);
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0";

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

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Zap} label="Total Campaigns" value={campaigns.length} color="text-cos-electric" bg="bg-cos-electric/10" />
        <StatCard icon={Send} label="Active" value={activeCampaigns.length} color="text-cos-signal" bg="bg-cos-signal/10" />
        <StatCard icon={Mail} label="Recent Emails" value={messages.length} color="text-cos-warm" bg="bg-cos-warm/10" />
        <StatCard icon={Eye} label="Open Rate" value={`${openRate}%`} color="text-cos-electric" bg="bg-cos-electric/10" sub={`${totalOpened} of ${totalSent} sent`} />
      </div>

      {/* Campaigns */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-cos-border">
          <h2 className="text-sm font-semibold text-cos-midnight">
            Campaigns
            <span className="ml-2 text-xs font-normal text-cos-slate">{campaigns.length} total</span>
          </h2>
        </div>
        {campaigns.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cos-slate">No campaigns found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Name</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">State</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Type</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Emails Sent</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {campaigns.map((c) => {
                const stateConfig = CAMPAIGN_STATE_CONFIG[c.state] ?? CAMPAIGN_STATE_CONFIG.draft;
                const StateIcon = stateConfig.icon;
                return (
                  <tr key={c.id} className="transition-colors hover:bg-cos-electric/[0.02]">
                    <td className="px-5 py-3 font-medium text-cos-midnight">{c.name}</td>
                    <td className="px-5 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-1 text-xs font-medium", stateConfig.color)}>
                        <StateIcon className="h-3 w-3" />
                        {stateConfig.label}
                      </span>
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

      {/* Recent messages */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-cos-border">
          <h2 className="text-sm font-semibold text-cos-midnight">
            Recent Emails
            <span className="ml-2 text-xs font-normal text-cos-slate">Last {messages.length}</span>
          </h2>
        </div>
        {messages.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cos-slate">No recent messages found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Subject</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Recipient</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Type</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  <span className="flex items-center gap-1"><Send className="h-3 w-3" /> Sent</span>
                </th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Opened</span>
                </th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {messages.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-cos-electric/[0.02]">
                  <td className="px-5 py-3 font-medium text-cos-midnight max-w-xs truncate">{m.subject || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-cos-slate truncate max-w-[180px]">{m.recipient}</td>
                  <td className="px-5 py-3 text-xs text-cos-slate capitalize">{m.type}</td>
                  <td className="px-5 py-3">
                    {(m.metrics.sent ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Sent
                      </span>
                    ) : (
                      <span className="text-xs text-cos-slate-light">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {(m.metrics.opened ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
                        <Eye className="h-2.5 w-2.5" /> Opened
                      </span>
                    ) : (
                      <span className="text-xs text-cos-slate-light">—</span>
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

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  bg: string;
  sub?: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 transition-shadow hover:shadow-sm">
      <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-cos-lg mb-3", bg, color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight text-cos-midnight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cos-slate-light">{sub}</p>}
    </div>
  );
}
