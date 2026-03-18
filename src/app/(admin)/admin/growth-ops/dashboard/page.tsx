"use client";

import { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  TrendingUp,
  Clock,
  DollarSign,
  Target,
  Briefcase,
  Trophy,
  RefreshCw,
  BarChart3,
  Mail,
} from "lucide-react";

// Lazy-load sub-pages
const AttributionContent = lazy(() => import("../attribution/page"));
const InstantlyContent = lazy(() => import("../instantly/page"));

// ── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  responseRate: number;
  avgTimeToReply: number;
  pipelineValue: number;
  conversionRate: number;
  activeDeals: number;
  dealsWon: number;
}

interface FunnelStep { label: string; value: number }
interface BySource { instantly: number; linkedinCampaign: number; linkedinOrganic: number; direct: number }
interface Activity { id: string; dealId: string; type: string; description: string | null; createdAt: string | null }
interface DealsByStage { label: string; color: string; count: number }

interface StripeCustomer { name: string; plan: string; mrr: number; since: string }
interface StripeChurned { name: string; canceledAt: string }
interface StripeData {
  mrr: number;
  activeSubscriptions: number;
  canceledSubscriptions: number;
  activeCustomers: StripeCustomer[];
  churned: StripeChurned[];
}

interface DashboardData {
  metrics: Metrics;
  funnel: FunnelStep[];
  bySource: BySource;
  recentActivity: Activity[];
  dealsByStage: DealsByStage[];
  stripe: StripeData | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
] as const;

const TABS = [
  { key: "overview", label: "Overview", icon: TrendingUp },
  { key: "attribution", label: "Attribution", icon: BarChart3 },
  { key: "instantly", label: "Instantly", icon: Mail },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

// ── Overview Tab Content ─────────────────────────────────────────────────────

function OverviewTab() {
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
      setData(await res.json());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-cos-electric" /></div>;
  }
  if (error && !data) {
    return <div className="p-6 text-red-500"><p className="font-semibold">Failed to load dashboard</p><p className="text-sm mt-1">{error}</p></div>;
  }
  if (!data) return null;

  const { metrics, funnel, bySource, recentActivity, dealsByStage, stripe } = data;
  const funnelMax = Math.max(...funnel.map((f) => f.value), 1);
  const stageMax = Math.max(...dealsByStage.map((s) => s.count), 1);
  const sourceTotal = bySource.instantly + bySource.linkedinCampaign + bySource.linkedinOrganic + bySource.direct || 1;

  const metricCards = [
    { label: "Response Rate", value: `${metrics.responseRate}%`, icon: TrendingUp, color: "text-emerald-500" },
    { label: "Avg. Time to Reply", value: `${metrics.avgTimeToReply}h`, icon: Clock, color: "text-blue-500" },
    { label: "Pipeline Value", value: formatCurrency(metrics.pipelineValue), icon: DollarSign, color: "text-violet-500" },
    { label: "Conversion Rate", value: `${metrics.conversionRate}%`, icon: Target, color: "text-amber-500" },
    { label: "Active Deals", value: String(metrics.activeDeals), icon: Briefcase, color: "text-cyan-500" },
    { label: "Deals Won", value: String(metrics.dealsWon), icon: Trophy, color: "text-green-500" },
  ];

  const sourceItems = [
    { label: "Instantly", value: bySource.instantly, color: "#6366f1" },
    { label: "LinkedIn Campaign", value: bySource.linkedinCampaign, color: "#8b5cf6" },
    { label: "LinkedIn Organic", value: bySource.linkedinOrganic, color: "#06b6d4" },
    { label: "Direct", value: bySource.direct, color: "#10b981" },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-end gap-3">
        <div className="flex rounded-cos-lg border border-cos-border overflow-hidden">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === p.key ? "bg-cos-electric text-white" : "bg-white text-cos-slate hover:bg-cos-cloud"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={fetchData} disabled={loading} className="p-2 rounded-cos-lg border border-cos-border hover:bg-cos-cloud transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 text-cos-slate ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricCards.map((card) => (
          <div key={card.label} className="rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
              <span className="text-[10px] font-medium text-cos-slate uppercase tracking-wide">{card.label}</span>
            </div>
            <p className="font-heading text-xl font-bold text-cos-midnight">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Funnel + Deals by Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Acquisition Funnel</h2>
          <div className="space-y-3">
            {funnel.map((step, i) => {
              const pct = funnelMax > 0 ? (step.value / funnelMax) * 100 : 0;
              const prevValue = i > 0 ? funnel[i - 1].value : step.value;
              const dropoff = prevValue > 0 ? Math.round(((prevValue - step.value) / prevValue) * 100) : 0;
              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-cos-slate">{step.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-cos-midnight">{step.value}</span>
                      {i > 0 && dropoff > 0 && <span className="text-xs text-red-400">-{dropoff}%</span>}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-cos-cloud overflow-hidden">
                    <div className="h-full rounded-full bg-cos-electric transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Deals by Stage</h2>
          <div className="space-y-3">
            {dealsByStage.map((stage) => {
              const pct = stageMax > 0 ? (stage.count / stageMax) * 100 : 0;
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-cos-slate">{stage.label}</span>
                    </div>
                    <span className="font-medium text-cos-midnight">{stage.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-cos-cloud overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Source + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Source Breakdown</h2>
          <div className="space-y-3">
            {sourceItems.map((src) => {
              const pct = Math.round((src.value / sourceTotal) * 100);
              return (
                <div key={src.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: src.color }} />
                      <span className="text-cos-slate">{src.label}</span>
                    </div>
                    <span className="font-medium text-cos-midnight">{src.value} <span className="text-cos-slate-dim text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-cos-cloud overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: src.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-cos-slate-dim">No activity in this period.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentActivity.map((act) => (
                <div key={act.id} className="flex items-start gap-3 p-2 rounded-cos-lg hover:bg-cos-cloud transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-cos-electric mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cos-midnight truncate">{act.description ?? act.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-cos-slate-dim">{act.type.replace(/_/g, " ")} &middot; {timeAgo(act.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Stripe Revenue & Subscriptions */}
      {stripe && (
        <div className="space-y-4">
          {/* Revenue KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[10px] font-medium text-cos-slate uppercase tracking-wide">Monthly Recurring Revenue</span>
              </div>
              <p className="font-heading text-xl font-bold text-cos-midnight">{formatCurrency(stripe.mrr)}</p>
            </div>
            <div className="rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[10px] font-medium text-cos-slate uppercase tracking-wide">Active Subscriptions</span>
              </div>
              <p className="font-heading text-xl font-bold text-cos-midnight">{stripe.activeSubscriptions}</p>
            </div>
            <div className="rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] font-medium text-cos-slate uppercase tracking-wide">Churned</span>
              </div>
              <p className="font-heading text-xl font-bold text-cos-midnight">{stripe.canceledSubscriptions}</p>
            </div>
          </div>

          {/* Active Customers + Churned side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Active Customers (Stripe)</h2>
              {stripe.activeCustomers.length === 0 ? (
                <p className="text-sm text-cos-slate-dim">No active subscriptions.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {stripe.activeCustomers.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-cos-md hover:bg-cos-cloud/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-cos-midnight truncate">{c.name}</p>
                        <p className="text-[10px] text-cos-slate-dim">Since {c.since}</p>
                      </div>
                      <span className="text-sm font-medium text-cos-signal shrink-0 ml-3">${c.mrr.toLocaleString()}/mo</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-4">Churned Customers (Stripe)</h2>
              {stripe.churned.length === 0 ? (
                <p className="text-sm text-cos-slate-dim">No churned subscriptions.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {stripe.churned.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-cos-md hover:bg-cos-cloud/50 transition-colors">
                      <p className="text-sm text-cos-midnight truncate flex-1 min-w-0">{c.name}</p>
                      <span className="text-xs text-red-400 shrink-0 ml-3">Canceled {c.canceledAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Page (Tabbed) ─────────────────────────────────────────────

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "overview";

  function setTab(t: TabKey) {
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  return (
    <div>
      {/* Header + Tabs */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-cos-midnight mb-4">Growth Dashboard</h1>
        <div className="flex gap-1 border-b border-cos-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-cos-electric text-cos-electric"
                    : "border-transparent text-cos-slate hover:text-cos-midnight"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab />}
      {tab === "attribution" && (
        <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>}>
          <AttributionContent />
        </Suspense>
      )}
      {tab === "instantly" && (
        <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>}>
          <InstantlyContent />
        </Suspense>
      )}
    </div>
  );
}

export default function GrowthOpsDashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
