"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Cpu,
  Clock,
  TrendingUp,
  RefreshCw,
  BarChart3,
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

type Period = "7d" | "30d" | "90d" | "all";
type Breakdown = "feature" | "model" | "org" | "user";

export default function AdminFinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [breakdown, setBreakdown] = useState<Breakdown>("feature");

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">
            AI Costs & Usage
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Track AI model spend across features, models, and users.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-cos-md border border-cos-border bg-cos-surface px-3 py-1.5 text-xs text-cos-slate hover:bg-cos-cloud"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 rounded-cos-lg border border-cos-border bg-cos-surface p-0.5">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-cos-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-cos-electric text-white"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {p === "all" ? "All Time" : p.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-cos-lg border border-cos-border bg-cos-surface p-0.5">
          {(["feature", "model", "org", "user"] as Breakdown[]).map((b) => (
            <button
              key={b}
              onClick={() => setBreakdown(b)}
              className={`rounded-cos-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                breakdown === b
                  ? "bg-cos-electric text-white"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="text-sm text-cos-slate">Loading finance data...</div>
      ) : !data ? (
        <div className="text-sm text-cos-ember">Failed to load data.</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<DollarSign className="h-4 w-4 text-cos-electric" />}
              label="Total Cost"
              value={`$${data.totals.cost.toFixed(4)}`}
            />
            <StatCard
              icon={<Cpu className="h-4 w-4 text-cos-signal" />}
              label="Total Calls"
              value={data.totals.calls.toLocaleString()}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-cos-warm" />}
              label="Avg Cost/Call"
              value={`$${data.totals.avgCostPerCall.toFixed(6)}`}
            />
            <StatCard
              icon={<Clock className="h-4 w-4 text-cos-slate" />}
              label="Avg Duration"
              value={`${Math.round(data.totals.avgDurationMs)}ms`}
            />
          </div>

          {/* Token summary */}
          <div className="flex items-center gap-6 rounded-cos-xl border border-cos-border bg-cos-surface p-4 text-sm">
            <span className="text-cos-slate">Tokens:</span>
            <span className="font-medium text-cos-midnight">
              {data.totals.inputTokens.toLocaleString()} input
            </span>
            <span className="font-medium text-cos-midnight">
              {data.totals.outputTokens.toLocaleString()} output
            </span>
            <span className="text-cos-slate">
              {(
                data.totals.inputTokens + data.totals.outputTokens
              ).toLocaleString()}{" "}
              total
            </span>
          </div>

          {/* Breakdown */}
          <div>
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Cost by {breakdown}
            </h2>
            <div className="mt-3 space-y-2">
              {data.breakdown?.length ? (
                data.breakdown.map((item) => {
                  const pct =
                    maxCost > 0 ? Math.round((item.cost / maxCost) * 100) : 0;
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="w-40 truncate text-sm text-cos-midnight">
                        {item.key || "(unknown)"}
                      </span>
                      <div className="flex-1 rounded-full bg-cos-slate/10">
                        <div
                          className="h-3 rounded-full bg-cos-electric transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 text-right font-mono text-xs text-cos-slate">
                        ${item.cost.toFixed(4)}
                      </span>
                      <span className="w-16 text-right text-xs text-cos-slate-light">
                        {item.calls} calls
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-cos-slate">
                  No AI usage data for this period.
                </p>
              )}
            </div>
          </div>

          {/* Daily trend */}
          {data.dailyTrend?.length > 0 && (
            <div>
              <h2 className="font-heading text-lg font-semibold text-cos-midnight">
                Daily Trend
              </h2>
              <div className="mt-3 rounded-cos-xl border border-cos-border bg-cos-surface p-4">
                <div className="flex items-end gap-1" style={{ height: 120 }}>
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
                          className="w-full rounded-t-sm bg-cos-electric/60 transition-colors hover:bg-cos-electric"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-cos-slate-light">
                  <span>{data.dailyTrend[0]?.date}</span>
                  <span>
                    <BarChart3 className="inline h-3 w-3" /> Cost over time
                  </span>
                  <span>
                    {data.dailyTrend[data.dailyTrend.length - 1]?.date}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs uppercase tracking-wider text-cos-slate">
          {label}
        </p>
      </div>
      <p className="mt-2 font-heading text-2xl font-bold text-cos-midnight">
        {value}
      </p>
    </div>
  );
}
