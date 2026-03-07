"use client";

import { useEffect, useState } from "react";

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  planDistribution: Record<string, number>;
}

export default function AdminSubscriptionsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-cos-slate">Loading subscription data...</div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-sm text-cos-ember">Failed to load data.</div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-2xl font-bold text-cos-midnight">
        Subscriptions & Revenue
      </h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <p className="text-xs uppercase tracking-wider text-cos-slate">
            Monthly Recurring Revenue
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-cos-midnight">
            ${metrics.mrr.toLocaleString()}
          </p>
        </div>
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <p className="text-xs uppercase tracking-wider text-cos-slate">
            Active Subscriptions
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-cos-midnight">
            {metrics.activeSubscriptions}
          </p>
        </div>
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <p className="text-xs uppercase tracking-wider text-cos-slate">
            Total Orgs
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-cos-midnight">
            {metrics.totalOrgs}
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Plan Distribution
        </h2>
        <div className="mt-3 space-y-2">
          {Object.entries(metrics.planDistribution).map(([plan, count]) => {
            const total = Object.values(metrics.planDistribution).reduce(
              (a, b) => a + b,
              0
            );
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={plan} className="flex items-center gap-3">
                <span className="w-24 text-sm capitalize text-cos-midnight">
                  {plan}
                </span>
                <div className="flex-1 rounded-full bg-cos-slate/10">
                  <div
                    className="h-3 rounded-full bg-cos-electric"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm text-cos-slate">
                  {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
