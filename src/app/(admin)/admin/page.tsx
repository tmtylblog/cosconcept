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
  GitMerge,
  FileText,
  Wrench,
  Brain,
  Database,
  Network,
  CircleDot,
  ArrowRight,
  Sparkles,
  BookOpen,
  Globe,
} from "lucide-react";

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  planDistribution: Record<string, number>;
  totalFirms: number;
  totalExperts: number;
  enrichedExperts: number;
  totalClients: number;
  totalCaseStudies: number;
  caseStudyStatuses: Record<string, number>;
  totalServices: number;
  totalSpecialistProfiles: number;
  totalAbstractionProfiles: number;
  totalAuditEntries: number;
  graph: {
    totalNodes: number;
    totalEdges: number;
    serviceFirms: number;
    companies: number;
    persons: number;
    skills: number;
    industries: number;
    caseStudies: number;
    services: number;
    categories: number;
  };
  onboarding: {
    started: number;
    completed: number;
    rate: number;
  };
}

const PLAN_COLORS: Record<string, { bar: string; text: string }> = {
  free: { bar: "bg-cos-slate", text: "text-cos-slate" },
  pro: { bar: "bg-cos-signal", text: "text-cos-signal" },
  enterprise: { bar: "bg-cos-electric", text: "text-cos-electric" },
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
          {[...Array(8)].map((_, i) => (
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
  const enrichmentRate = metrics.totalExperts > 0
    ? Math.round((metrics.enrichedExperts / metrics.totalExperts) * 100)
    : 0;
  const onboardingPct = Math.round(metrics.onboarding.rate * 100);

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

      {/* ── Platform Section ─────────────────────────────── */}
      <Section title="Platform" icon={<Building2 className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<Building2 className="h-4 w-4" />} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" label="Organizations" value={metrics.totalOrgs} />
          <StatCard icon={<Users className="h-4 w-4" />} iconColor="text-cos-signal" iconBg="bg-cos-signal/10" label="Users" value={metrics.totalUsers} />
          <StatCard icon={<CreditCard className="h-4 w-4" />} iconColor="text-cos-warm" iconBg="bg-cos-warm/10" label="Active Subscriptions" value={metrics.activeSubscriptions} />
          <StatCard icon={<DollarSign className="h-4 w-4" />} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" label="MRR" value={`$${metrics.mrr.toLocaleString()}`} />
        </div>

        {/* Plan distribution inline */}
        <div className="mt-4 rounded-cos-lg border border-cos-border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-cos-slate">Plan Distribution</span>
            <span className="text-xs text-cos-slate">{totalPlanCount} total</span>
          </div>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-cos-cloud-dim">
            {Object.entries(metrics.planDistribution).map(([plan, count]) => {
              const pct = totalPlanCount > 0 ? (count / totalPlanCount) * 100 : 0;
              if (pct === 0) return null;
              const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
              return (
                <div
                  key={plan}
                  className={`${colors.bar} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                  title={`${plan}: ${count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="flex gap-4 mt-2">
            {Object.entries(metrics.planDistribution).map(([plan, count]) => {
              const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
              return (
                <div key={plan} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 rounded-full ${colors.bar}`} />
                  <span className="capitalize text-cos-midnight font-medium">{plan}</span>
                  <span className={`font-mono font-semibold ${colors.text}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ── Enrichment Pipeline Section ───────────────────── */}
      <Section title="Enrichment Pipeline" icon={<Sparkles className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<Globe className="h-4 w-4" />} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" label="Customer Firms" value={metrics.totalFirms} />
          <StatCard icon={<Wrench className="h-4 w-4" />} iconColor="text-cos-signal" iconBg="bg-cos-signal/10" label="Services Discovered" value={metrics.totalServices.toLocaleString()} />
          <StatCard icon={<FileText className="h-4 w-4" />} iconColor="text-cos-warm" iconBg="bg-cos-warm/10" label="Case Studies" value={metrics.totalCaseStudies.toLocaleString()} />
          <StatCard icon={<Briefcase className="h-4 w-4" />} iconColor="text-cos-ember" iconBg="bg-cos-ember/10" label="Clients Tracked" value={metrics.totalClients.toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mt-4">
          <StatCard icon={<UserCheck className="h-4 w-4" />} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" label="Expert Profiles" value={metrics.totalExperts.toLocaleString()} sub={`${metrics.enrichedExperts.toLocaleString()} enriched (${enrichmentRate}%)`} />
          <StatCard icon={<Brain className="h-4 w-4" />} iconColor="text-cos-signal" iconBg="bg-cos-signal/10" label="Specialist Profiles" value={metrics.totalSpecialistProfiles.toLocaleString()} sub="AI-generated niche profiles" />
          <StatCard icon={<BookOpen className="h-4 w-4" />} iconColor="text-cos-warm" iconBg="bg-cos-warm/10" label="Abstraction Profiles" value={metrics.totalAbstractionProfiles.toLocaleString()} sub="Vector-searchable firm profiles" />
          <StatCard icon={<Database className="h-4 w-4" />} iconColor="text-cos-slate" iconBg="bg-cos-slate/10" label="Audit Trail Entries" value={metrics.totalAuditEntries.toLocaleString()} sub="Enrichment step records" />
        </div>

        {/* Case study status breakdown */}
        {Object.keys(metrics.caseStudyStatuses).length > 0 && (
          <div className="mt-4 rounded-cos-lg border border-cos-border bg-white p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-cos-slate">Case Study Pipeline</span>
            <div className="flex flex-wrap gap-3 mt-2">
              {Object.entries(metrics.caseStudyStatuses).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 rounded-full ${
                    status === "published" ? "bg-cos-signal" :
                    status === "pending" ? "bg-cos-warm" :
                    status === "processing" ? "bg-cos-electric" :
                    "bg-cos-slate"
                  }`} />
                  <span className="capitalize text-cos-midnight font-medium">{status}</span>
                  <span className="font-mono font-semibold text-cos-slate">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Knowledge Graph Section ───────────────────────── */}
      <Section title="Knowledge Graph" icon={<Network className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <BigStatCard
            value={metrics.graph.totalNodes.toLocaleString()}
            label="Total Nodes"
            icon={<CircleDot className="h-5 w-5" />}
            color="text-cos-electric"
          />
          <BigStatCard
            value={metrics.graph.totalEdges.toLocaleString()}
            label="Total Relationships"
            icon={<ArrowRight className="h-5 w-5" />}
            color="text-cos-signal"
          />
          <BigStatCard
            value={(metrics.graph.totalNodes + metrics.graph.totalEdges).toLocaleString()}
            label="Graph Elements"
            icon={<Network className="h-5 w-5" />}
            color="text-cos-warm"
          />
        </div>

        {/* Node type breakdown */}
        <div className="mt-4 rounded-cos-lg border border-cos-border bg-white p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-cos-slate">Node Breakdown</span>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3 lg:grid-cols-4">
            <NodeStat label="ServiceFirms" count={metrics.graph.serviceFirms} color="bg-cos-electric" />
            <NodeStat label="Companies" count={metrics.graph.companies} color="bg-cos-warm" />
            <NodeStat label="Persons" count={metrics.graph.persons} color="bg-cos-signal" />
            <NodeStat label="Skills" count={metrics.graph.skills} color="bg-purple-500" />
            <NodeStat label="Industries" count={metrics.graph.industries} color="bg-blue-500" />
            <NodeStat label="Case Studies" count={metrics.graph.caseStudies} color="bg-orange-500" />
            <NodeStat label="Services" count={metrics.graph.services} color="bg-emerald-500" />
            <NodeStat label="Categories" count={metrics.graph.categories} color="bg-pink-500" />
          </div>
        </div>
      </Section>

      {/* ── Onboarding Section ────────────────────────────── */}
      {metrics.onboarding.started > 0 && (
        <Section title="Onboarding" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={<ArrowRight className="h-4 w-4" />} iconColor="text-cos-electric" iconBg="bg-cos-electric/10" label="Started" value={metrics.onboarding.started} />
            <StatCard icon={<UserCheck className="h-4 w-4" />} iconColor="text-cos-signal" iconBg="bg-cos-signal/10" label="Completed" value={metrics.onboarding.completed} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} iconColor="text-cos-warm" iconBg="bg-cos-warm/10" label="Completion Rate" value={`${onboardingPct}%`} />
          </div>
        </Section>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <QuickLink href="/admin/knowledge-graph" label="Knowledge Graph" icon={<Share2 className="h-4 w-4" />} />
        <QuickLink href="/admin/customers" label="Customers" icon={<Building2 className="h-4 w-4" />} />
        <QuickLink href="/admin/users" label="Manage Users" icon={<Users className="h-4 w-4" />} />
        <QuickLink href="/admin/enrichment" label="Enrichment" icon={<Sparkles className="h-4 w-4" />} />
        <QuickLink href="/admin/finance" label="AI Costs" icon={<TrendingUp className="h-4 w-4" />} />
        <QuickLink href="/admin/api-health" label="API Health" icon={<Database className="h-4 w-4" />} />
        <QuickLink href="/admin/neo4j" label="Neo4j Admin" icon={<GitMerge className="h-4 w-4" />} />
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-cos-electric">{icon}</span>
        <h2 className="font-heading text-base font-semibold text-cos-midnight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  sub?: string;
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
      {sub && (
        <p className="mt-0.5 text-[11px] text-cos-slate-light">{sub}</p>
      )}
    </div>
  );
}

function BigStatCard({ value, label, icon, color }: { value: string; label: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 text-center transition-shadow hover:shadow-sm">
      <div className={`inline-flex items-center justify-center ${color} mb-2`}>
        {icon}
      </div>
      <p className="font-heading text-3xl font-bold tracking-tight text-cos-midnight">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-cos-slate">{label}</p>
    </div>
  );
}

function NodeStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-sm text-cos-midnight">{label}</span>
      </div>
      <span className="font-mono text-sm font-semibold text-cos-midnight">{count.toLocaleString()}</span>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
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
