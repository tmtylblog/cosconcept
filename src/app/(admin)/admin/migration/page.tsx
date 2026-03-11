"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Building2,
  Users,
  Mail,
  GitBranch,
  GitMerge,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
} from "lucide-react";

interface MigrationStats {
  companies: {
    total: number;
    syncedToGraph: number;
    pendingGraphSync: number;
    flagged: number;
    investorCarryOver: number;
    isIcp: number;
    notIcp: number;
  };
  contacts: {
    total: number;
    syncedToGraph: number;
    pendingGraphSync: number;
    withEmail: number;
    experts: number;
    internal: number;
    ambiguous: number;
  };
  outreach: {
    total: number;
    linkedToCompany: number;
    linkedToContact: number;
  };
  batches: Array<{
    entityType: string;
    status: string;
    totalImported: number;
    totalSkipped: number;
    totalErrors: number;
    batchCount: number;
  }>;
}

function ProgressBar({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-cos-midnight/10 ${className}`}
    >
      <div
        className="h-full rounded-full bg-cos-electric transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-cos-electric",
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-cos-border/30 bg-white/80 p-5 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        <span className="text-sm font-medium text-cos-midnight/60">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-cos-midnight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && (
        <p className="mt-1 text-xs text-cos-midnight/50">{sub}</p>
      )}
    </div>
  );
}

type JobStatus = "idle" | "running" | "done" | "error";

export default function MigrationDashboard() {
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({});
  const [jobResults, setJobResults] = useState<Record<string, string>>({});

  async function runTrackAJob(jobId: string) {
    setJobStatuses((s) => ({ ...s, [jobId]: "running" }));
    setJobResults((r) => ({ ...r, [jobId]: "" }));
    try {
      const res = await fetch("/api/admin/run-migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJobStatuses((s) => ({ ...s, [jobId]: "error" }));
        setJobResults((r) => ({ ...r, [jobId]: data.error ?? "Unknown error" }));
      } else {
        setJobStatuses((s) => ({ ...s, [jobId]: "done" }));
        setJobResults((r) => ({ ...r, [jobId]: `Triggered. Running in background — check Inngest for progress.` }));
      }
    } catch (err) {
      setJobStatuses((s) => ({ ...s, [jobId]: "error" }));
      setJobResults((r) => ({ ...r, [jobId]: String(err) }));
    }
  }

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/import/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSyncGraph = async (entityType: "companies" | "contacts") => {
    setSyncing(entityType);
    try {
      const res = await fetch("/api/admin/import/sync-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, limit: 500 }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh stats
        await fetchStats();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-cos-ember/30 bg-cos-ember/5 p-6">
          <div className="flex items-center gap-2 text-cos-ember">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Error</span>
          </div>
          <p className="mt-2 text-sm text-cos-midnight/70">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const companyPct = stats.companies.total > 0
    ? Math.round((stats.companies.syncedToGraph / stats.companies.total) * 100)
    : 0;

  const contactPct = stats.contacts.total > 0
    ? Math.round((stats.contacts.syncedToGraph / stats.contacts.total) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-cos-midnight">
            <Database className="h-7 w-7 text-cos-electric" />
            Data Migration
          </h1>
          <p className="mt-1 text-sm text-cos-midnight/50">
            n8n → COS Knowledge Graph
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-cos-border/30 px-4 py-2 text-sm font-medium text-cos-midnight/70 transition-colors hover:bg-cos-cloud/50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-cos-warm/30 bg-cos-warm/5 p-3 text-sm text-cos-midnight/70">
          <AlertTriangle className="mr-1.5 inline h-4 w-4 text-cos-warm" />
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Companies"
          value={stats.companies.total}
          sub={`${stats.companies.investorCarryOver} investor carry-overs`}
        />
        <StatCard
          icon={Users}
          label="Contacts"
          value={stats.contacts.total}
          sub={`${stats.contacts.experts} experts · ${stats.contacts.internal} internal`}
          color="text-cos-signal"
        />
        <StatCard
          icon={Mail}
          label="Outreach"
          value={stats.outreach.total}
          sub={`${stats.outreach.linkedToCompany} linked to companies`}
          color="text-cos-warm"
        />
        <StatCard
          icon={Shield}
          label="Flagged"
          value={stats.companies.flagged}
          sub="Need review"
          color="text-cos-ember"
        />
      </div>

      {/* Graph Sync Status */}
      <div className="mb-8 rounded-xl border border-cos-border/30 bg-white/80 p-6 backdrop-blur-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-cos-midnight">
          <GitBranch className="h-5 w-5 text-cos-electric" />
          Neo4j Graph Sync
        </h2>

        {/* Companies */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-cos-midnight/70">
              Companies
            </span>
            <span className="text-sm text-cos-midnight/50">
              {stats.companies.syncedToGraph.toLocaleString()} /{" "}
              {stats.companies.total.toLocaleString()} ({companyPct}%)
            </span>
          </div>
          <ProgressBar
            value={stats.companies.syncedToGraph}
            max={stats.companies.total}
          />
          {stats.companies.pendingGraphSync > 0 && (
            <button
              onClick={() => handleSyncGraph("companies")}
              disabled={syncing === "companies"}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/20 disabled:opacity-50"
            >
              {syncing === "companies" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync {stats.companies.pendingGraphSync.toLocaleString()} pending
            </button>
          )}
        </div>

        {/* Contacts */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-cos-midnight/70">
              Contacts
            </span>
            <span className="text-sm text-cos-midnight/50">
              {stats.contacts.syncedToGraph.toLocaleString()} /{" "}
              {stats.contacts.total.toLocaleString()} ({contactPct}%)
            </span>
          </div>
          <ProgressBar
            value={stats.contacts.syncedToGraph}
            max={stats.contacts.total}
          />
          {stats.contacts.pendingGraphSync > 0 && (
            <button
              onClick={() => handleSyncGraph("contacts")}
              disabled={syncing === "contacts"}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-cos-signal/10 px-3 py-1.5 text-xs font-medium text-cos-signal transition-colors hover:bg-cos-signal/20 disabled:opacity-50"
            >
              {syncing === "contacts" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync {stats.contacts.pendingGraphSync.toLocaleString()} pending
            </button>
          )}
        </div>
      </div>

      {/* Classification Breakdown */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Company Classification */}
        <div className="rounded-xl border border-cos-border/30 bg-white/80 p-5 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold text-cos-midnight/70">
            Company Classification
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                ICP (Professional Services)
              </span>
              <span className="font-medium">{stats.companies.isIcp}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-cos-midnight/40" />
                Not ICP (Potential Clients)
              </span>
              <span className="font-medium">{stats.companies.notIcp}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-cos-warm" />
                Investor Carry-Over
              </span>
              <span className="font-medium">
                {stats.companies.investorCarryOver}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Classification */}
        <div className="rounded-xl border border-cos-border/30 bg-white/80 p-5 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold text-cos-midnight/70">
            Contact Classification
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Experts
              </span>
              <span className="font-medium">{stats.contacts.experts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cos-midnight/40" />
                Internal
              </span>
              <span className="font-medium">{stats.contacts.internal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-cos-signal" />
                With Email
              </span>
              <span className="font-medium">{stats.contacts.withEmail}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Batch History */}
      {stats.batches.length > 0 && (
        <div className="rounded-xl border border-cos-border/30 bg-white/80 p-6 backdrop-blur-sm">
          <h2 className="mb-4 text-lg font-semibold text-cos-midnight">
            Import Batches
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border/20 text-left text-cos-midnight/50">
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium text-right">
                    Imported
                  </th>
                  <th className="pb-2 pr-4 font-medium text-right">
                    Skipped
                  </th>
                  <th className="pb-2 pr-4 font-medium text-right">
                    Errors
                  </th>
                  <th className="pb-2 font-medium text-right">Batches</th>
                </tr>
              </thead>
              <tbody>
                {stats.batches.map((b, i) => (
                  <tr
                    key={i}
                    className="border-b border-cos-border/10 last:border-0"
                  >
                    <td className="py-2 pr-4 capitalize">{b.entityType}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.status === "complete"
                            ? "bg-green-50 text-green-700"
                            : b.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-cos-warm/10 text-cos-warm"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {b.totalImported.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-cos-midnight/50">
                      {b.totalSkipped.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {b.totalErrors > 0 ? (
                        <span className="text-cos-ember">
                          {b.totalErrors.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-cos-midnight/30">0</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-cos-midnight/50">
                      {b.batchCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {stats.companies.total === 0 &&
        stats.contacts.total === 0 &&
        stats.outreach.total === 0 && (
          <div className="rounded-xl border border-dashed border-cos-border/30 p-12 text-center">
            <Database className="mx-auto mb-4 h-12 w-12 text-cos-midnight/20" />
            <h3 className="text-lg font-semibold text-cos-midnight/60">
              No data imported yet
            </h3>
            <p className="mt-2 text-sm text-cos-midnight/40">
              Import n8n workflow templates from{" "}
              <code className="rounded bg-cos-midnight/10 px-1 py-0.5">
                scripts/n8n-workflows/
              </code>{" "}
              and run them to start migrating data.
            </p>
          </div>
        )}

      {/* Track A: One-time Neo4j Schema Migrations */}
      <div className="mt-8 rounded-xl border border-cos-electric/20 bg-cos-electric/5 p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-cos-midnight">
          <GitMerge className="h-5 w-5 text-cos-electric" />
          Track A: Graph Schema Migrations
        </h2>
        <p className="mb-5 text-sm text-cos-midnight/50">
          One-time jobs to complete the canonical Company/Person node migration.
          Both are idempotent — safe to run more than once.
        </p>

        <div className="space-y-4">
          {[
            {
              id: "client-nodes-to-company",
              title: "Client Nodes → Company",
              desc: "Converts legacy Client nodes in Neo4j to canonical Company stubs and repoints all HAS_CLIENT / FOR_CLIENT edges.",
            },
            {
              id: "partnership-prefs-to-edges",
              title: "Partner Preferences → PREFERS Edges",
              desc: "Syncs any unsynced firm onboarding preferences from Postgres into Neo4j PREFERS edges.",
            },
          ].map((job) => {
            const status = jobStatuses[job.id] ?? "idle";
            const result = jobResults[job.id];
            return (
              <div key={job.id} className="flex items-start gap-4 rounded-lg border border-cos-border/30 bg-white/80 p-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-cos-midnight">{job.title}</p>
                  <p className="text-xs text-cos-midnight/50">{job.desc}</p>
                  {result && (
                    <p className={`mt-1.5 text-xs font-mono ${status === "error" ? "text-cos-ember" : "text-cos-electric"}`}>
                      {result}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => runTrackAJob(job.id)}
                  disabled={status === "running"}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-cos-electric/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === "done" && <CheckCircle2 className="h-3 w-3" />}
                  {status === "error" && <XCircle className="h-3 w-3" />}
                  {status === "running" ? "Running…" : "Run"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
