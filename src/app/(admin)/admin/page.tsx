"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  CreditCard,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  UserCheck,
  Briefcase,
  Share2,
} from "lucide-react";

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  planDistribution: Record<string, number>;
  totalExperts: number;
  totalClients: number;
}

const PLAN_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  free: {
    bg: "bg-cos-slate/5",
    bar: "bg-cos-slate",
    text: "text-cos-slate",
  },
  pro: {
    bg: "bg-cos-signal/5",
    bar: "bg-cos-signal",
    text: "text-cos-signal",
  },
  enterprise: {
    bg: "bg-cos-electric/5",
    bar: "bg-cos-electric",
    text: "text-cos-electric",
  },
};

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to fetch metrics (${r.status})`);
        return r.json();
      })
      .then(setMetrics)
      .catch((err) => console.error("[Admin] Metrics load error:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-4 text-sm text-cos-ember">
        Failed to load metrics. Check your connection and try refreshing.
      </div>
    );
  }

  const totalPlanCount = Object.values(metrics.planDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Overview
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Platform health at a glance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={<Building2 className="h-4.5 w-4.5" />}
          iconColor="text-cos-electric"
          iconBg="bg-cos-electric/10"
          label="Organizations"
          value={metrics.totalOrgs}
        />
        <StatCard
          icon={<Users className="h-4.5 w-4.5" />}
          iconColor="text-cos-signal"
          iconBg="bg-cos-signal/10"
          label="Users"
          value={metrics.totalUsers}
        />
        <StatCard
          icon={<UserCheck className="h-4.5 w-4.5" />}
          iconColor="text-cos-warm"
          iconBg="bg-cos-warm/10"
          label="Expert Profiles"
          value={metrics.totalExperts.toLocaleString()}
        />
        <StatCard
          icon={<Briefcase className="h-4.5 w-4.5" />}
          iconColor="text-cos-ember"
          iconBg="bg-cos-ember/10"
          label="Clients"
          value={metrics.totalClients.toLocaleString()}
        />
        <StatCard
          icon={<CreditCard className="h-4.5 w-4.5" />}
          iconColor="text-cos-signal"
          iconBg="bg-cos-signal/10"
          label="Subscriptions"
          value={metrics.activeSubscriptions}
        />
        <StatCard
          icon={<DollarSign className="h-4.5 w-4.5" />}
          iconColor="text-cos-electric"
          iconBg="bg-cos-electric/10"
          label="MRR"
          value={`$${metrics.mrr.toLocaleString()}`}
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
            const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
            return (
              <div key={plan}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium capitalize text-cos-midnight">
                    {plan}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-semibold ${colors.text}`}>
                      {count}
                    </span>
                    <span className="text-xs text-cos-slate-light">
                      ({pct}%)
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-cos-cloud-dim overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors.bar} transition-all duration-700 ease-out`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <QuickLink href="/admin/knowledge-graph" label="Knowledge Graph" icon={<Share2 className="h-4 w-4" />} />
        <QuickLink href="/admin/organizations" label="Organizations" icon={<Building2 className="h-4 w-4" />} />
        <QuickLink href="/admin/users" label="Manage Users" icon={<Users className="h-4 w-4" />} />
        <QuickLink href="/admin/knowledge-graph?tab=experts" label="Expert Profiles" icon={<UserCheck className="h-4 w-4" />} />
        <QuickLink href="/admin/knowledge-graph?tab=clients" label="Client Database" icon={<Briefcase className="h-4 w-4" />} />
        <QuickLink href="/admin/finance" label="AI Costs" icon={<TrendingUp className="h-4 w-4" />} />
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

function QuickLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-2.5 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 transition-all hover:border-cos-electric/30 hover:shadow-sm"
    >
      <span className="text-cos-slate transition-colors group-hover:text-cos-electric">
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium text-cos-midnight">
        {label}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-cos-slate-light transition-all group-hover:text-cos-electric group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}
