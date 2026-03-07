"use client";

import { useEffect, useState } from "react";

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  planDistribution: Record<string, number>;
}

export default function AdminOverviewPage() {
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
      <div className="text-sm text-cos-slate">Loading admin metrics...</div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-sm text-cos-ember">Failed to load metrics.</div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-2xl font-bold text-cos-midnight">
        Admin Overview
      </h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Organizations" value={metrics.totalOrgs} />
        <StatCard label="Total Users" value={metrics.totalUsers} />
        <StatCard
          label="Active Subscriptions"
          value={metrics.activeSubscriptions}
        />
        <StatCard
          label="MRR"
          value={`$${metrics.mrr.toLocaleString()}`}
        />
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Plan Distribution
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          {Object.entries(metrics.planDistribution).map(([plan, count]) => (
            <div
              key={plan}
              className="rounded-cos-xl border border-cos-border bg-cos-surface p-4"
            >
              <p className="text-xs uppercase tracking-wider text-cos-slate">
                {plan}
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-cos-midnight">
                {count}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <p className="text-xs uppercase tracking-wider text-cos-slate">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-cos-midnight">
        {value}
      </p>
    </div>
  );
}
