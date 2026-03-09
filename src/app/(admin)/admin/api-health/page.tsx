"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Zap,
  Database,
  Globe,
  Mail,
  CreditCard,
  Mic,
  Video,
  Bot,
  Cpu,
  CircleDashed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { KeyRound } from "lucide-react";

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  unit: string;
  percentUsed: number;
}

interface ApiHealthCheck {
  name: string;
  status: "healthy" | "warning" | "error" | "not_configured";
  latencyMs: number;
  quota?: QuotaInfo;
  message?: string;
  phase?: string;
  checkedAt: string;
}

interface HealthResponse {
  overall: "healthy" | "warning" | "error";
  services: ApiHealthCheck[];
  checkedAt: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  OpenRouter: <Cpu className="h-5 w-5" />,
  "People Data Labs": <Bot className="h-5 w-5" />,
  "Jina Reader": <Globe className="h-5 w-5" />,
  Deepgram: <Mic className="h-5 w-5" />,
  ElevenLabs: <Zap className="h-5 w-5" />,
  Resend: <Mail className="h-5 w-5" />,
  "Recall.ai": <Video className="h-5 w-5" />,
  Stripe: <CreditCard className="h-5 w-5" />,
  Neo4j: <Database className="h-5 w-5" />,
  "Neon Postgres": <Database className="h-5 w-5" />,
};

const STATUS_CONFIG = {
  healthy: {
    dot: "bg-cos-signal",
    badge: "bg-cos-signal/8 text-cos-signal border-cos-signal/20",
    icon: CheckCircle2,
    label: "Healthy",
  },
  warning: {
    dot: "bg-cos-warm",
    badge: "bg-cos-warm/8 text-cos-warm border-cos-warm/20",
    icon: AlertTriangle,
    label: "Warning",
  },
  error: {
    dot: "bg-cos-ember",
    badge: "bg-cos-ember/8 text-cos-ember border-cos-ember/20",
    icon: XCircle,
    label: "Error",
  },
  not_configured: {
    dot: "bg-cos-slate/40",
    badge: "bg-cos-cloud-dim text-cos-slate border-cos-border",
    icon: CircleDashed,
    label: "Not Configured",
  },
};

function QuotaBar({ quota }: { quota: QuotaInfo }) {
  const pct = Math.min(quota.percentUsed, 100);
  const barColor =
    pct >= 90 ? "bg-cos-ember" : pct >= 70 ? "bg-cos-warm" : "bg-cos-signal";

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-cos-midnight">
          {quota.remaining.toLocaleString()} {quota.unit}
          <span className="font-normal text-cos-slate"> remaining</span>
        </span>
        <span className="text-cos-slate">
          {quota.used.toLocaleString()} / {quota.limit.toLocaleString()} used
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-cos-cloud">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ServiceCard({ check }: { check: ApiHealthCheck }) {
  const config = STATUS_CONFIG[check.status];
  const StatusIcon = config.icon;
  const isNotConfigured = check.status === "not_configured";

  return (
    <div
      className={cn(
        "rounded-cos-xl border bg-cos-surface p-5 transition-shadow hover:shadow-sm",
        check.status === "error"
          ? "border-cos-ember/30"
          : check.status === "warning"
            ? "border-cos-warm/30"
            : isNotConfigured
              ? "border-cos-border/50 opacity-60"
              : "border-cos-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-cos-lg",
              check.status === "error"
                ? "bg-cos-ember/8 text-cos-ember"
                : check.status === "warning"
                  ? "bg-cos-warm/8 text-cos-warm"
                  : isNotConfigured
                    ? "bg-cos-cloud text-cos-slate/50"
                    : "bg-cos-cloud text-cos-slate"
            )}
          >
            {SERVICE_ICONS[check.name] ?? <Activity className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-cos-midnight">
              {check.name}
            </h3>
            {isNotConfigured && check.phase ? (
              <p className="text-xs text-cos-slate/60">{check.phase}</p>
            ) : (
              <p className="text-xs text-cos-slate">
                {check.latencyMs}ms
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-cos-pill border px-2.5 py-1 text-xs font-medium",
            config.badge
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </span>
      </div>

      {/* Quota bar */}
      {check.quota && <QuotaBar quota={check.quota} />}

      {/* Message */}
      {check.message && (
        <p
          className={cn(
            "mt-3 text-xs",
            check.status === "error"
              ? "text-cos-ember"
              : isNotConfigured
                ? "text-cos-slate/60"
                : "text-cos-slate"
          )}
        >
          {check.message}
        </p>
      )}

      {/* Quick link to credentials */}
      {(isNotConfigured || check.status === "error") && (
        <Link
          href="/admin/api-health/credentials"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
        >
          <KeyRound className="h-3 w-3" />
          {isNotConfigured ? "Set up credential" : "Update credential"}
        </Link>
      )}
    </div>
  );
}

export default function AdminApiHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/admin/api-health");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      console.error("Failed to fetch API health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchHealth();
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-36 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  const errors = data?.services.filter((s) => s.status === "error") ?? [];
  const warnings = data?.services.filter((s) => s.status === "warning") ?? [];
  const healthy = data?.services.filter((s) => s.status === "healthy") ?? [];
  const notConfigured = data?.services.filter((s) => s.status === "not_configured") ?? [];

  // Active services first (errors, warnings, healthy), then not configured at bottom
  const sorted = [...errors, ...warnings, ...healthy, ...notConfigured];

  const overallConfig = STATUS_CONFIG[data?.overall ?? "error"];

  // Count only active services (exclude not_configured from summary)
  const activeServices = data?.services.filter((s) => s.status !== "not_configured") ?? [];
  const activeErrors = activeServices.filter((s) => s.status === "error");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            API Health
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            External service status and quota monitoring.
            {notConfigured.length > 0 && (
              <span className="text-cos-slate/60">
                {" "}{notConfigured.length} service{notConfigured.length > 1 ? "s" : ""} pending setup.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-cos-pill border px-3.5 py-1.5 text-xs font-medium",
              overallConfig.badge
            )}
          >
            <span
              className={cn("h-2 w-2 rounded-full", overallConfig.dot)}
            />
            {activeErrors.length === 0 && warnings.length === 0
              ? "All Active Services Operational"
              : data?.overall === "warning"
                ? "Some Quotas Low"
                : "Issues Detected"}
          </span>
          <Link
            href="/admin/api-health/credentials"
            className="inline-flex h-9 items-center gap-1.5 rounded-cos-lg border border-cos-border bg-cos-surface px-3 text-xs font-medium text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Manage Credentials
          </Link>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Alert banner for active errors/warnings */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-cos-xl border p-4",
            errors.length > 0
              ? "border-cos-ember/20 bg-cos-ember/5"
              : "border-cos-warm/20 bg-cos-warm/5"
          )}
        >
          {errors.length > 0 ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-cos-ember" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-cos-warm" />
          )}
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                errors.length > 0 ? "text-cos-ember" : "text-cos-warm"
              )}
            >
              {errors.length > 0
                ? `${errors.length} service${errors.length > 1 ? "s" : ""} with errors`
                : `${warnings.length} service${warnings.length > 1 ? "s" : ""} with low quota`}
            </p>
            <p className="mt-0.5 text-xs text-cos-slate">
              {[...errors, ...warnings].map((s) => s.name).join(", ")}
              {errors.length > 0 &&
                " — check API keys and billing in the respective dashboards."}
              {errors.length === 0 &&
                warnings.length > 0 &&
                " — consider topping up credits before they run out."}
            </p>
          </div>
        </div>
      )}

      {/* Active services */}
      {(errors.length > 0 || warnings.length > 0 || healthy.length > 0) && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
            Active Services ({activeServices.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[...errors, ...warnings, ...healthy].map((check) => (
              <ServiceCard key={check.name} check={check} />
            ))}
          </div>
        </>
      )}

      {/* Not configured services */}
      {notConfigured.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-cos-slate/60">
            Pending Setup ({notConfigured.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notConfigured.map((check) => (
              <ServiceCard key={check.name} check={check} />
            ))}
          </div>
        </>
      )}

      {/* Last checked */}
      {data?.checkedAt && (
        <p className="text-center text-xs text-cos-slate">
          Last checked: {new Date(data.checkedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
