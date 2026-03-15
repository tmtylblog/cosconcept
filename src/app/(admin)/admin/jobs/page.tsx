"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface JobStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
}

interface RecentJob {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  payload: Record<string, unknown>;
}

interface FailedJob {
  id: string;
  type: string;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
}

interface StaleJob {
  id: string;
  type: string;
  createdAt: string;
}

interface JobsData {
  stats: JobStats;
  typeSummary: Record<string, Record<string, number>>;
  recentJobs: RecentJob[];
  failedJobs: FailedJob[];
  staleCount: number;
  staleJobs: StaleJob[];
}

const STATUS_STYLES: Record<string, { bg: string; icon: typeof Activity }> = {
  pending: { bg: "bg-yellow-100 text-yellow-800", icon: Clock },
  running: { bg: "bg-blue-100 text-blue-800", icon: Activity },
  done: { bg: "bg-green-100 text-green-800", icon: CheckCircle2 },
  failed: { bg: "bg-red-100 text-red-800", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AdminJobsPage() {
  const [data, setData] = useState<JobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleCleanup(opts: { stalePending?: boolean; oldCompleted?: boolean }) {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/admin/jobs/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (res.ok) {
        const result = await res.json();
        setCleanResult(`Deleted ${result.total} jobs (${result.staleDeleted} stale, ${result.oldDeleted} old)`);
        await fetchData();
      }
    } catch {
      setCleanResult("Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-red-500">Failed to load job data</div>;
  }

  const totalJobs = data.stats.pending + data.stats.running + data.stats.done + data.stats.failed;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cos-text">Background Jobs</h1>
          <p className="text-sm text-cos-text-secondary mt-1">
            Monitor and manage Inngest functions and legacy queue jobs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <a
            href="https://app.inngest.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" />
              Inngest Dashboard
            </Button>
          </a>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending" value={data.stats.pending} color="yellow" />
        <StatCard label="Running" value={data.stats.running} color="blue" />
        <StatCard label="Completed" value={data.stats.done} color="green" />
        <StatCard label="Failed" value={data.stats.failed} color="red" />
      </div>

      {/* Stale Jobs Warning */}
      {data.staleCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              {data.staleCount} stale pending job{data.staleCount > 1 ? "s" : ""} (older than 1 hour)
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={cleaning}
            onClick={() => handleCleanup({ stalePending: true })}
          >
            {cleaning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Clean Up
          </Button>
        </div>
      )}

      {cleanResult && (
        <p className="text-sm text-cos-text-secondary">{cleanResult}</p>
      )}

      {/* Per-Type Summary */}
      <div className="rounded-lg border border-cos-border bg-cos-surface">
        <div className="border-b border-cos-border px-4 py-3">
          <h2 className="text-sm font-semibold text-cos-text">Jobs by Type</h2>
        </div>
        <div className="divide-y divide-cos-border">
          {Object.entries(data.typeSummary)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([type, statuses]) => {
              const total = Object.values(statuses).reduce((a, b) => a + b, 0);
              return (
                <div key={type} className="flex items-center justify-between px-4 py-2.5">
                  <code className="text-sm font-mono text-cos-text">{type}</code>
                  <div className="flex items-center gap-3 text-xs">
                    {statuses.done && <span className="text-green-600">{statuses.done} done</span>}
                    {statuses.running && <span className="text-blue-600">{statuses.running} running</span>}
                    {statuses.pending && <span className="text-yellow-600">{statuses.pending} pending</span>}
                    {statuses.failed && <span className="text-red-600">{statuses.failed} failed</span>}
                    <span className="text-cos-text-secondary font-medium">{total} total</span>
                  </div>
                </div>
              );
            })}
          {Object.keys(data.typeSummary).length === 0 && (
            <p className="px-4 py-3 text-sm text-cos-text-secondary">No jobs in queue</p>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="rounded-lg border border-cos-border bg-cos-surface">
        <div className="border-b border-cos-border px-4 py-3">
          <h2 className="text-sm font-semibold text-cos-text">Recent Jobs ({data.recentJobs.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border text-left text-xs text-cos-text-secondary">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Attempts</th>
                <th className="px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border">
              {data.recentJobs.map((job) => (
                <tr key={job.id} className="hover:bg-cos-bg">
                  <td className="px-4 py-2 font-mono text-xs">{job.type}</td>
                  <td className="px-4 py-2"><StatusBadge status={job.status} /></td>
                  <td className="px-4 py-2 text-cos-text-secondary text-xs">{timeAgo(job.createdAt)}</td>
                  <td className="px-4 py-2 text-cos-text-secondary text-xs">{duration(job.startedAt, job.completedAt)}</td>
                  <td className="px-4 py-2 text-cos-text-secondary text-xs">{job.attempts}/{job.maxAttempts}</td>
                  <td className="px-4 py-2 text-xs text-red-500 max-w-[300px] truncate">{job.lastError || "-"}</td>
                </tr>
              ))}
              {data.recentJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-center text-cos-text-secondary">No recent jobs</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failed Jobs */}
      {data.failedJobs.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/50">
          <div className="border-b border-red-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-red-800">Failed Jobs ({data.failedJobs.length})</h2>
          </div>
          <div className="divide-y divide-red-100">
            {data.failedJobs.map((job) => (
              <div key={job.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-red-700">{job.type}</code>
                  <span className="text-xs text-red-500">{timeAgo(job.createdAt)} | {job.attempts}/{job.maxAttempts} attempts</span>
                </div>
                {job.lastError && (
                  <p className="mt-1 text-xs text-red-600 font-mono whitespace-pre-wrap break-all">
                    {job.lastError.slice(0, 500)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={cleaning}
          onClick={() => handleCleanup({ oldCompleted: true })}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Purge Old Jobs (7d+)
        </Button>
        <span className="text-xs text-cos-text-secondary self-center">
          {totalJobs} total jobs in database
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-green-200 bg-green-50 text-green-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
