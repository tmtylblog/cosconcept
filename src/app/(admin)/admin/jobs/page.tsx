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
  Play,
  Database,
  Users,
  Mail,
  Phone,
  BarChart3,
  GitBranch,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

// Group functions by category for display
const FUNCTION_CATEGORIES: Record<string, { label: string; icon: typeof Database; color: string; ids: string[] }> = {
  enrichment: {
    label: "Enrichment",
    icon: Database,
    color: "text-cos-electric",
    ids: [
      "enrich-deep-crawl",
      "enrich-case-study-ingest",
      "enrich-expert-linkedin",
      "enrich-team-ingest",
      "enrich-firm-abstraction",
      "enrich-firm-case-study-ingest",
      "enrich-backfill-all-firms",
      "company-enrich-stub",
      "skill-compute-strength",
      "backfill-has-client-edges",
    ],
  },
  research: {
    label: "Research & Matching",
    icon: Globe,
    color: "text-purple-600",
    ids: [
      "research-company",
      "assess-client-fit",
      "extract-opportunities",
    ],
  },
  communication: {
    label: "Communication",
    icon: Mail,
    color: "text-cos-warm",
    ids: [
      "email-process-inbound",
      "email-schedule-follow-up",
      "email-send-now",
    ],
  },
  calls: {
    label: "Call Intelligence",
    icon: Phone,
    color: "text-emerald-600",
    ids: [
      "calls-analyze",
      "calls-join-meeting",
    ],
  },
  graph: {
    label: "Knowledge Graph",
    icon: GitBranch,
    color: "text-blue-600",
    ids: [
      "graph-sync-firm",
      "sync-preferences",
    ],
  },
  growthOps: {
    label: "Growth Ops",
    icon: BarChart3,
    color: "text-cos-signal",
    ids: [
      "growth-attribution-check",
      "network-scan",
    ],
  },
  other: {
    label: "Other",
    icon: Zap,
    color: "text-cos-slate",
    ids: [
      "memory-extract",
    ],
  },
  cron: {
    label: "Scheduled (Cron)",
    icon: Timer,
    color: "text-cos-warm",
    ids: [
      "cron-weekly-recrawl",
      "cron-weekly-digest",
      "cron-check-stale-partnerships",
      "cron-linkedin-invite-scheduler",
    ],
  },
};

// Functions that can be triggered from the admin UI
const TRIGGERABLE_FUNCTIONS: Record<string, { endpoint: string; method: string; body?: object; confirm?: string }> = {
  "enrich-deep-crawl": {
    endpoint: "/api/admin/enrich/backfill-deep-crawl",
    method: "POST",
    body: { limit: 10 },
    confirm: "Queue deep crawl for up to 10 unenriched firms?",
  },
  "enrich-team-ingest": {
    endpoint: "/api/admin/enrich/team-ingest",
    method: "POST",
    body: {},
    confirm: "Queue team import for all firms without rosters?",
  },
  "enrich-firm-abstraction": {
    endpoint: "/api/admin/enrich/backfill-abstractions",
    method: "POST",
    body: {},
    confirm: "Queue abstraction profile generation for all firms missing profiles?",
  },
  "enrich-backfill-all-firms": {
    endpoint: "/api/admin/enrich/backfill-all",
    method: "POST",
    body: { skipCompleted: true },
    confirm: "Run full enrichment backfill for all firms? This will skip already-completed steps.",
  },
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

function FunctionCard({
  fn,
  onTrigger,
  triggering,
}: {
  fn: InngestFunction;
  onTrigger?: () => void;
  triggering?: boolean;
}) {
  const isCron = fn.type === "cron";
  return (
    <div className="bg-cos-surface px-4 py-3 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-cos-text truncate">{fn.name}</p>
        <code className="text-xs text-cos-text-secondary">{fn.trigger}</code>
      </div>
      {onTrigger && (
        <Button
          variant="outline"
          size="sm"
          onClick={onTrigger}
          disabled={triggering}
          className="shrink-0 text-xs h-7 px-2"
        >
          {triggering ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
      )}
      {isCron && (
        <span className="shrink-0 inline-flex items-center rounded-full bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
          <Timer className="h-2.5 w-2.5 mr-1" />
          cron
        </span>
      )}
    </div>
  );
}

export default function AdminJobsPage() {
  const [data, setData] = useState<JobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

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

  async function handleTrigger(fnId: string) {
    const config = TRIGGERABLE_FUNCTIONS[fnId];
    if (!config) return;
    if (config.confirm && !window.confirm(config.confirm)) return;

    setTriggeringId(fnId);
    setTriggerResult(null);
    try {
      const res = await fetch(config.endpoint, {
        method: config.method,
        headers: { "Content-Type": "application/json" },
        body: config.body ? JSON.stringify(config.body) : undefined,
      });
      const result = await res.json();
      if (res.ok) {
        setTriggerResult(`${fnId}: ${result.message || result.queued ? `Queued ${result.queued}` : "Triggered"}`);
      } else {
        setTriggerResult(`${fnId} failed: ${result.error}`);
      }
      await fetchData();
    } catch {
      setTriggerResult(`${fnId}: trigger failed`);
    } finally {
      setTriggeringId(null);
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

  // Build a map for quick lookup
  const fnMap = new Map(data.functions.map((f) => [f.id, f]));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cos-text">Background Jobs</h1>
          <p className="text-sm text-cos-text-secondary mt-1">
            {data.functions.length} Inngest functions registered &mdash; grouped by category
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

      {/* Trigger result notification */}
      {triggerResult && (
        <div className="rounded-lg border border-cos-electric/20 bg-cos-electric/5 px-4 py-2 text-sm text-cos-electric flex items-center justify-between">
          <span>{triggerResult}</span>
          <button onClick={() => setTriggerResult(null)} className="text-cos-slate hover:text-cos-midnight">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Job Stats Summary */}
      {Object.keys(data.stats).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.stats).map(([status, cnt]) => (
            <div key={status} className="rounded-lg border border-cos-border bg-cos-surface px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-midnight">{cnt}</div>
              <div className="text-[10px] uppercase tracking-wider text-cos-slate">
                <StatusBadge status={status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Functions grouped by category */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(FUNCTION_CATEGORIES).map(([catKey, cat]) => {
          const fns = cat.ids
            .map((id) => fnMap.get(id))
            .filter(Boolean) as InngestFunction[];
          if (fns.length === 0) return null;

          const CatIcon = cat.icon;
          return (
            <div key={catKey} className="rounded-lg border border-cos-border bg-cos-surface">
              <div className="border-b border-cos-border px-4 py-3 flex items-center gap-2">
                <CatIcon className={`h-4 w-4 ${cat.color}`} />
                <h2 className="text-sm font-semibold text-cos-text">
                  {cat.label} ({fns.length})
                </h2>
              </div>
              <div className="divide-y divide-cos-border">
                {fns.map((fn) => (
                  <FunctionCard
                    key={fn.id}
                    fn={fn}
                    onTrigger={
                      TRIGGERABLE_FUNCTIONS[fn.id]
                        ? () => handleTrigger(fn.id)
                        : undefined
                    }
                    triggering={triggeringId === fn.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Job Tracking Log */}
      {data.recentJobs.length > 0 && (
        <div className="rounded-lg border border-cos-border bg-cos-surface">
          <div className="border-b border-cos-border px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cos-text">Recent Job Log ({data.totalJobs} total)</h2>
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
                {data.recentJobs.map((job) => (
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
