"use client";

import { useEffect, useState } from "react";
import { CreditCard, Building2, DollarSign } from "lucide-react";

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  planDistribution: Record<string, number>;
}

const PLAN_STYLES: Record<string, { bar: string; text: string }> = {
  free: { bar: "bg-cos-slate", text: "text-cos-slate" },
  pro: { bar: "bg-cos-signal", text: "text-cos-signal" },
  enterprise: { bar: "bg-cos-electric", text: "text-cos-electric" },
};

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
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-4 text-sm text-cos-ember">
        Failed to load data.
      </div>
    );
  }

  const totalPlanCount = Object.values(metrics.planDistribution).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Subscriptions & Revenue
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Subscription plans, MRR, and plan distribution.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          iconColor="text-cos-electric"
          iconBg="bg-cos-electric/10"
          label="Monthly Recurring Revenue"
          value={`$${metrics.mrr.toLocaleString()}`}
        />
        <StatCard
          icon={<CreditCard className="h-4 w-4" />}
          iconColor="text-cos-signal"
          iconBg="bg-cos-signal/10"
          label="Active Subscriptions"
          value={metrics.activeSubscriptions}
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          iconColor="text-cos-warm"
          iconBg="bg-cos-warm/10"
          label="Total Organizations"
          value={metrics.totalOrgs}
        />
      </div>

      {/* Plan Distribution */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-base font-semibold text-cos-midnight">
            Plan Distribution
          </h2>
          <span className="text-xs text-cos-slate">
            {totalPlanCount} total
          </span>
        </div>
        <div className="space-y-4">
          {Object.entries(metrics.planDistribution).map(([plan, count]) => {
            const pct = totalPlanCount > 0 ? Math.round((count / totalPlanCount) * 100) : 0;
            const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free;
            return (
              <div key={plan}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium capitalize text-cos-midnight">
                    {plan}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-semibold ${style.text}`}>
                      {count}
                    </span>
                    <span className="text-xs text-cos-slate-light">
                      ({pct}%)
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-cos-cloud-dim overflow-hidden">
                  <div
                    className={`h-full rounded-full ${style.bar} transition-all duration-700 ease-out`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
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
