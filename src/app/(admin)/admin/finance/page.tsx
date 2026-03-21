"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Cpu,
  Clock,
  TrendingUp,
  RefreshCw,
  BarChart3,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Server,
  Loader2,
} from "lucide-react";

interface Totals {
  cost: number;
  calls: number;
  avgCostPerCall: number;
  inputTokens: number;
  outputTokens: number;
  avgDurationMs: number;
}

interface BreakdownItem {
  key: string;
  cost: number;
  calls: number;
}

interface DailyTrend {
  date: string;
  cost: number;
  calls: number;
}

interface FinanceData {
  period: string;
  totals: Totals;
  breakdown: BreakdownItem[];
  dailyTrend: DailyTrend[];
}

interface ServiceStatus {
  name: string;
  category: string;
  envVar: string;
  configured: boolean;
  status: "active" | "error" | "unconfigured";
  error?: string;
  description: string;
  costModel: string;
  freeTier: boolean;
  required: boolean;
  phase: string;
}

interface ServiceData {
  services: ServiceStatus[];
  summary: {
    total: number;
    configured: number;
    active: number;
    errors: number;
    unconfigured: number;
    required: number;
    requiredConfigured: number;
    requiredMissing: number;
  };
}

type Period = "7d" | "30d" | "90d" | "all";
type Breakdown = "feature" | "model" | "org" | "user";

const BREAKDOWN_COLORS = [
  "bg-cos-electric",
  "bg-cos-signal",
  "bg-cos-warm",
  "bg-cos-ember",
  "bg-cos-slate",
];

export default function AdminFinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [breakdown, setBreakdown] = useState<Breakdown>("feature");
  const [serviceData, setServiceData] = useState<ServiceData | null>(null);
  const [serviceLoading, setServiceLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/finance?period=${period}&breakdown=${breakdown}`
      );
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[Admin] Finance load error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, breakdown]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch service status
  useEffect(() => {
    setServiceLoading(true);
    fetch("/api/admin/service-status")
      .then((r) => r.json())
      .then((d) => setServiceData(d))
      .catch(() => {})
      .finally(() => setServiceLoading(false));
  }, []);

  const maxCost =
    data?.breakdown?.length
      ? Math.max(...data.breakdown.map((b) => b.cost))
      : 0;

  const maxDailyCost =
    data?.dailyTrend?.length
      ? Math.max(...data.dailyTrend.map((d) => d.cost))
      : 0;

  return (
    <div className="space-y-8">
      {/* Header — editorial asymmetric */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-cos-midnight">
            AI Costs & Usage
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Model spend, token usage, and service subscriptions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="text-right mr-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cos-electric">Total Spend ({period.toUpperCase()})</p>
              <p className="font-heading text-3xl font-extrabold tracking-tight text-cos-midnight leading-none mt-0.5">
                ${data.totals.cost.toFixed(2)}
              </p>
            </div>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border/60 bg-white px-3.5 py-2 text-xs font-medium text-cos-slate transition-all duration-300 hover:border-cos-electric/30 hover:text-cos-electric hover:shadow-[0_4px_12px_rgba(31,134,161,0.08)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-cos-lg bg-cos-cloud-dim p-1">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-cos-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                period === p
                  ? "bg-cos-surface text-cos-midnight shadow-sm"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {p === "all" ? "All Time" : p.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-cos-border" />

        <div className="flex items-center gap-0.5 rounded-cos-lg bg-cos-cloud-dim p-1">
          {(["feature", "model", "org", "user"] as Breakdown[]).map((b) => (
            <button
              key={b}
              onClick={() => setBreakdown(b)}
              className={`rounded-cos-md px-3.5 py-1.5 text-xs font-medium capitalize transition-all ${
                breakdown === b
                  ? "bg-cos-surface text-cos-midnight shadow-sm"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-cos-xl bg-cos-border/50" />
            ))}
          </div>
        </div>
      ) : !data ? (
        <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-4 text-sm text-cos-ember">
          Failed to load data.
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<DollarSign className="h-4 w-4" />}
              iconColor="text-cos-electric"
              iconBg="bg-cos-electric/10"
              label="Total Cost"
              value={`$${data.totals.cost.toFixed(4)}`}
            />
            <StatCard
              icon={<Cpu className="h-4 w-4" />}
              iconColor="text-cos-signal"
              iconBg="bg-cos-signal/10"
              label="Total Calls"
              value={data.totals.calls.toLocaleString()}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              iconColor="text-cos-warm"
              iconBg="bg-cos-warm/10"
              label="Avg Cost/Call"
              value={`$${data.totals.avgCostPerCall.toFixed(6)}`}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              iconColor="text-cos-slate-dim"
              iconBg="bg-cos-slate/10"
              label="Avg Duration"
              value={`${Math.round(data.totals.avgDurationMs)}ms`}
            />
          </div>

          {/* Token summary */}
          <div className="flex items-center gap-6 rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cos-warm" />
              <span className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                Tokens
              </span>
            </div>
            <div className="h-4 w-px bg-cos-border" />
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-semibold text-cos-midnight">
                {data.totals.inputTokens.toLocaleString()}
              </span>
              <span className="text-xs text-cos-slate">input</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-semibold text-cos-midnight">
                {data.totals.outputTokens.toLocaleString()}
              </span>
              <span className="text-xs text-cos-slate">output</span>
            </div>
            <div className="h-4 w-px bg-cos-border" />
            <span className="font-mono text-xs text-cos-slate-light">
              {(data.totals.inputTokens + data.totals.outputTokens).toLocaleString()} total
            </span>
          </div>

          {/* Breakdown */}
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
            <h2 className="font-heading text-base font-semibold text-cos-midnight mb-4">
              Cost by {breakdown}
            </h2>
            <div className="space-y-3">
              {data.breakdown?.length ? (
                data.breakdown.map((item, idx) => {
                  const pct =
                    maxCost > 0 ? Math.round((item.cost / maxCost) * 100) : 0;
                  const barColor = BREAKDOWN_COLORS[idx % BREAKDOWN_COLORS.length];
                  return (
                    <div key={item.key} className="group">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="w-36 truncate text-sm font-medium text-cos-midnight">
                          {item.key || "(unknown)"}
                        </span>
                        <div className="flex-1" />
                        <span className="font-mono text-xs font-semibold text-cos-midnight">
                          ${item.cost.toFixed(4)}
                        </span>
                        <span className="w-20 text-right text-[11px] text-cos-slate-light">
                          {item.calls} calls
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-cos-cloud-dim overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center">
                  <Cpu className="mx-auto h-8 w-8 text-cos-slate-light mb-2" />
                  <p className="text-sm text-cos-slate">
                    No AI usage data for this period.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Daily trend */}
          {data.dailyTrend?.length > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-base font-semibold text-cos-midnight">
                  Daily Trend
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Cost over time
                </div>
              </div>
              <div className="flex items-end gap-[2px]" style={{ height: 140 }}>
                {data.dailyTrend.map((day) => {
                  const height =
                    maxDailyCost > 0
                      ? Math.max((day.cost / maxDailyCost) * 100, 2)
                      : 2;
                  return (
                    <div
                      key={day.date}
                      className="group relative flex-1"
                      title={`${day.date}: $${day.cost.toFixed(4)} (${day.calls} calls)`}
                    >
                      <div
                        className="w-full rounded-t bg-cos-electric/40 transition-colors hover:bg-cos-electric"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-between text-[10px] text-cos-slate-light">
                <span>{data.dailyTrend[0]?.date}</span>
                <span>{data.dailyTrend[data.dailyTrend.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Service Subscriptions ─────────────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-cos-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-cos-midnight flex items-center gap-2">
              <Server className="h-5 w-5 text-cos-electric" />
              Service Subscriptions
            </h2>
            <p className="text-xs text-cos-slate mt-0.5">
              All paid APIs powering the platform — {serviceData?.summary.configured ?? 0}/{serviceData?.summary.total ?? 0} configured
            </p>
          </div>
          {serviceData?.summary && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {serviceData.summary.active} active
              </span>
              {serviceData.summary.errors > 0 && (
                <span className="flex items-center gap-1 text-cos-ember">
                  <XCircle className="h-3.5 w-3.5" />
                  {serviceData.summary.errors} errors
                </span>
              )}
              {serviceData.summary.unconfigured > 0 && (
                <span className="flex items-center gap-1 text-cos-slate">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {serviceData.summary.unconfigured} unconfigured
                </span>
              )}
            </div>
          )}
        </div>

        {serviceLoading ? (
          <div className="flex items-center justify-center py-8 text-cos-slate">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Checking service status...
          </div>
        ) : serviceData ? (
          <div className="overflow-hidden rounded-cos-xl border border-cos-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud-dim/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">Service</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">Cost Model</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">Phase</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">Free Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-border/50">
                {serviceData.services.map((s) => (
                  <tr key={s.envVar} className="hover:bg-cos-cloud-dim/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.required && (
                          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-cos-electric" title="Required" />
                        )}
                        <div>
                          <p className="font-medium text-cos-midnight text-sm">{s.name}</p>
                          <p className="text-[11px] text-cos-slate mt-0.5 line-clamp-1">{s.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "active" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      ) : s.status === "error" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={s.error}>
                          <XCircle className="h-3 w-3" />
                          Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          <AlertCircle className="h-3 w-3" />
                          Not configured
                        </span>
                      )}
                      {s.error && s.status === "active" && (
                        <p className="text-[10px] text-cos-slate mt-0.5">{s.error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-cos-slate">{s.costModel}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-cos-slate">{s.phase}</span>
                    </td>
                    <td className="px-4 py-3">
                      {s.freeTier ? (
                        <span className="text-xs text-green-600">Yes</span>
                      ) : (
                        <span className="text-xs text-cos-ember">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 transition-shadow hover:shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-cos-lg ${iconBg} ${iconColor} mb-3`}>
        {icon}
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight text-cos-midnight">
        {value}
      </p>
    </div>
  );
}
