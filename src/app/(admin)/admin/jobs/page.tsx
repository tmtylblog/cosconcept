"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Loader2,
  Zap,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePaginated, PaginationFooter } from "@/components/ui/pagination-footer";

interface InngestFunction {
  id: string;
  name: string;
  trigger: string;
  type: "event" | "cron";
}

interface RecentJob {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempts: number;
  lastError: string | null;
}

interface FailedJob {
  id: string;
  type: string;
  lastError: string | null;
  createdAt: string;
}

interface JobsData {
  functions: InngestFunction[];
  recentJobs: RecentJob[];
  failedJobs: FailedJob[];
  stats: Record<string, number>;
  totalJobs: number;
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
  const [jobsPage, setJobsPage] = useState(1);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const pag = usePaginated(data?.recentJobs ?? [], jobsPage);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleCleanup() {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/admin/jobs/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stalePending: true, oldCompleted: true }),
      });
      if (res.ok) {
        const result = await res.json();
        setCleanResult(`Deleted ${result.total} jobs`);
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

  const eventFns = data.functions.filter((f) => f.type === "event");
  const cronFns = data.functions.filter((f) => f.type === "cron");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cos-text">Background Jobs</h1>
          <p className="text-sm text-cos-text-secondary mt-1">
            All jobs run via Inngest &mdash; {data.functions.length} functions registered
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <a href="https://app.inngest.com" target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-cos-electric hover:bg-cos-electric/90 text-white">
              <ExternalLink className="h-4 w-4 mr-1" />
              Inngest Dashboard
            </Button>
          </a>
        </div>
      </div>

      {/* Inngest Functions — Event-triggered */}
      <div className="rounded-lg border border-cos-border bg-cos-surface">
        <div className="border-b border-cos-border px-4 py-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-cos-electric" />
          <h2 className="text-sm font-semibold text-cos-text">Event-Triggered Functions ({eventFns.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-cos-border">
          {eventFns.map((fn) => (
            <div key={fn.id} className="bg-cos-surface px-4 py-3">
              <p className="text-sm font-medium text-cos-text">{fn.name}</p>
              <code className="text-xs text-cos-text-secondary">{fn.trigger}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Inngest Functions — Cron */}
      <div className="rounded-lg border border-cos-border bg-cos-surface">
        <div className="border-b border-cos-border px-4 py-3 flex items-center gap-2">
          <Timer className="h-4 w-4 text-cos-warm" />
          <h2 className="text-sm font-semibold text-cos-text">Cron Functions ({cronFns.length})</h2>
        </div>
        <div className="divide-y divide-cos-border">
          {cronFns.map((fn) => (
            <div key={fn.id} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium text-cos-text">{fn.name}</p>
              <code className="text-xs bg-cos-bg px-2 py-1 rounded text-cos-text-secondary">{fn.trigger}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Job Tracking Log (backgroundJobs table — used for status polling) */}
      {data.recentJobs.length > 0 && (
        <div className="rounded-lg border border-cos-border bg-cos-surface">
          <div className="border-b border-cos-border px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cos-text">Job Tracking Log ({data.totalJobs} total)</h2>
            <Button variant="outline" size="sm" disabled={cleaning} onClick={handleCleanup}>
              {cleaning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Purge Old
            </Button>
          </div>
          {cleanResult && <p className="px-4 py-2 text-xs text-cos-text-secondary">{cleanResult}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border text-left text-xs text-cos-text-secondary">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-border">
                {pag.pageItems.map((job) => (
                  <tr key={job.id} className="hover:bg-cos-bg">
                    <td className="px-4 py-2 font-mono text-xs">{job.type}</td>
                    <td className="px-4 py-2"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-2 text-cos-text-secondary text-xs">{timeAgo(job.createdAt)}</td>
                    <td className="px-4 py-2 text-cos-text-secondary text-xs">{duration(job.startedAt, job.completedAt)}</td>
                    <td className="px-4 py-2 text-xs text-red-500 max-w-[300px] truncate">{job.lastError || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <PaginationFooter page={pag.safePage} totalPages={pag.totalPages} total={pag.total} onPageChange={setJobsPage} />
          </div>
        </div>
      )}

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
                  <span className="text-xs text-red-500">{timeAgo(job.createdAt)}</span>
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
    </div>
  );
}
