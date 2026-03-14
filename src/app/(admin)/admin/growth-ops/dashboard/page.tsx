"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  TrendingUp,
  Clock,
  DollarSign,
  Target,
  Briefcase,
  Trophy,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  responseRate: number;
  avgTimeToReply: number;
  pipelineValue: number;
  conversionRate: number;
  activeDeals: number;
  dealsWon: number;
}

interface FunnelStep {
  label: string;
  value: number;
}

interface BySource {
  instantly: number;
  linkedinCampaign: number;
  linkedinOrganic: number;
  direct: number;
}

interface Activity {
  id: string;
  dealId: string;
  type: string;
  description: string | null;
  createdAt: string | null;
}

interface DealsByStage {
  label: string;
  color: string;
  count: number;
}

interface DashboardData {
  metrics: Metrics;
  funnel: FunnelStep[];
  bySource: BySource;
  recentActivity: Activity[];
  dealsByStage: DealsByStage[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
] as const;

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GrowthOpsDashboardPage() {
  const [period, setPeriod] = useState<string>("30d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/growth-ops/dashboard?period=${period}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-cos-primary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 text-red-500">
        <p className="font-semibold">Failed to load dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, funnel, bySource, recentActivity, dealsByStage } = data;
  const funnelMax = Math.max(...funnel.map((f) => f.value), 1);
  const stageMax = Math.max(...dealsByStage.map((s) => s.count), 1);
  const sourceTotal = bySource.instantly + bySource.linkedinCampaign + bySource.linkedinOrganic + bySource.direct || 1;

  const metricCards = [
    {
      label: "Response Rate",
      value: `${metrics.responseRate}%`,
      icon: TrendingUp,
      color: "text-emerald-500",
    },
    {
      label: "Avg. Time to Reply",
      value: `${metrics.avgTimeToReply}h`,
      icon: Clock,
      color: "text-blue-500",
    },
    {
      label: "Pipeline Value",
      value: formatCurrency(metrics.pipelineValue),
      icon: DollarSign,
      color: "text-violet-500",
    },
    {
      label: "Conversion Rate",
      value: `${metrics.conversionRate}%`,
      icon: Target,
      color: "text-amber-500",
    },
    {
      label: "Active Deals",
      value: String(metrics.activeDeals),
      icon: Briefcase,
      color: "text-cyan-500",
    },
    {
      label: "Deals Won",
      value: String(metrics.dealsWon),
      icon: Trophy,
      color: "text-green-500",
    },
  ];

  const sourceItems = [
    { label: "Instantly", value: bySource.instantly, color: "#6366f1" },
    { label: "LinkedIn Campaign", value: bySource.linkedinCampaign, color: "#8b5cf6" },
    { label: "LinkedIn Organic", value: bySource.linkedinOrganic, color: "#06b6d4" },
    { label: "Direct / HubSpot", value: bySource.direct, color: "#10b981" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-cos-text-primary">
          Growth Ops Dashboard
        </h1>
        <div className="flex items-center gap-3">
          {/* Period selector pills */}
          <div className="flex rounded-lg border border-cos-border overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p.key
                    ? "bg-cos-primary text-white"
                    : "bg-cos-bg-secondary text-cos-text-secondary hover:bg-cos-bg-tertiary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-cos-border hover:bg-cos-bg-secondary transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-cos-border bg-cos-bg-primary p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-cos-text-secondary">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-cos-text-primary">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Two column: Funnel + Deals by Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Acquisition Funnel */}
        <div className="rounded-xl border border-cos-border bg-cos-bg-primary p-5">
          <h2 className="text-sm font-semibold text-cos-text-primary mb-4">
            Acquisition Funnel
          </h2>
          <div className="space-y-3">
            {funnel.map((step, i) => {
              const pct = funnelMax > 0 ? (step.value / funnelMax) * 100 : 0;
              const prevValue = i > 0 ? funnel[i - 1].value : step.value;
              const dropoff =
                prevValue > 0
                  ? Math.round(((prevValue - step.value) / prevValue) * 100)
                  : 0;

              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-cos-text-secondary">{step.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-cos-text-primary">
                        {step.value}
                      </span>
                      {i > 0 && dropoff > 0 && (
                        <span className="text-xs text-red-400">-{dropoff}%</span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-cos-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cos-primary to-cos-primary/70 transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deals by Stage */}
        <div className="rounded-xl border border-cos-border bg-cos-bg-primary p-5">
          <h2 className="text-sm font-semibold text-cos-text-primary mb-4">
            Deals by Stage
          </h2>
          <div className="space-y-3">
            {dealsByStage.map((stage) => {
              const pct = stageMax > 0 ? (stage.count / stageMax) * 100 : 0;
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-cos-text-secondary">{stage.label}</span>
                    </div>
                    <span className="font-medium text-cos-text-primary">
                      {stage.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-cos-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two column: Source breakdown + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Breakdown */}
        <div className="rounded-xl border border-cos-border bg-cos-bg-primary p-5">
          <h2 className="text-sm font-semibold text-cos-text-primary mb-4">
            Source Breakdown
          </h2>
          <div className="space-y-3">
            {sourceItems.map((src) => {
              const pct = Math.round((src.value / sourceTotal) * 100);
              return (
                <div key={src.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: src.color }}
                      />
                      <span className="text-cos-text-secondary">{src.label}</span>
                    </div>
                    <span className="font-medium text-cos-text-primary">
                      {src.value}{" "}
                      <span className="text-cos-text-tertiary text-xs">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-cos-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: src.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="rounded-xl border border-cos-border bg-cos-bg-primary p-5">
          <h2 className="text-sm font-semibold text-cos-text-primary mb-4">
            Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-cos-text-tertiary">
              No activity in this period.
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentActivity.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-cos-bg-secondary transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-cos-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cos-text-primary truncate">
                      {act.description ?? act.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-cos-text-tertiary">
                      {act.type.replace(/_/g, " ")} &middot; {timeAgo(act.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
