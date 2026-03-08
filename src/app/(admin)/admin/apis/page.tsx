"use client";

import { useState, useEffect } from "react";
import {
  Globe,
  Copy,
  Check,
  Activity,
  Database,
  Clock,
  ExternalLink,
  RefreshCw,
  Shield,
  Zap,
  BookOpen,
  Users,
  FileText,
  Building2,
} from "lucide-react";

interface ApiEndpoint {
  name: string;
  path: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  recordCount: number;
  lastChecked: string;
  error?: string;
}

interface HealthData {
  status: string;
  apis: ApiEndpoint[];
  checkedAt: string;
}

const API_DOCS: Record<
  string,
  {
    icon: React.ReactNode;
    description: string;
    params: string[];
    example: string;
  }
> = {
  "Taxonomy (Skills, Categories, Relationships)": {
    icon: <BookOpen className="h-5 w-5" />,
    description:
      "Skills taxonomy (L1-L2), firm categories, and symbiotic firm relationships",
    params: ["section=categories|skills|relationships"],
    example: "?section=skills",
  },
  Experts: {
    icon: <Users className="h-5 w-5" />,
    description:
      "Expert profiles with skills, industries, and firm affiliations",
    params: ["limit=50", "offset=0", "firmId=xxx"],
    example: "?limit=20&firmId=firm_123",
  },
  "Case Studies": {
    icon: <FileText className="h-5 w-5" />,
    description:
      "Case study profiles with extracted insights and firm links",
    params: ["limit=50", "offset=0", "firmId=xxx"],
    example: "?limit=20",
  },
  "Firms Directory": {
    icon: <Building2 className="h-5 w-5" />,
    description:
      "Public firm directory with profiles and enrichment data",
    params: ["limit=50", "offset=0", "firmType=xxx"],
    example: "?firmType=agency&limit=20",
  },
};

const STATUS_STYLES = {
  healthy: {
    badge: "bg-cos-signal/8 text-cos-signal border-cos-signal/20",
    dot: "bg-cos-signal",
  },
  degraded: {
    badge: "bg-cos-warm/8 text-cos-warm border-cos-warm/20",
    dot: "bg-cos-warm",
  },
  down: {
    badge: "bg-cos-ember/8 text-cos-ember border-cos-ember/20",
    dot: "bg-cos-ember",
  },
};

export default function AdminApisPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/public/health");
      const data = await res.json();
      setHealth(data);
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchHealth();
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-40 rounded-cos-md bg-cos-border" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  const overallStatus = health?.status as keyof typeof STATUS_STYLES ?? "down";
  const statusStyle = STATUS_STYLES[overallStatus] ?? STATUS_STYLES.down;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            External APIs
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Public API endpoints for third-party integrations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-cos-pill border px-3.5 py-1.5 text-xs font-medium ${statusStyle.badge}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
            {overallStatus === "healthy"
              ? "All Systems Operational"
              : "Some Issues Detected"}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Auth Info */}
      <div className="rounded-cos-xl border border-cos-electric/15 bg-cos-electric/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <Shield className="h-4.5 w-4.5 text-cos-electric" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-cos-midnight">
              Authentication
            </h3>
            <p className="mt-1 text-sm text-cos-slate leading-relaxed">
              All public APIs accept an optional{" "}
              <code className="rounded-cos-sm bg-cos-electric/10 px-1.5 py-0.5 font-mono text-xs text-cos-electric">
                x-api-key
              </code>{" "}
              header. If{" "}
              <code className="rounded-cos-sm bg-cos-electric/10 px-1.5 py-0.5 font-mono text-xs text-cos-electric">
                PUBLIC_API_KEY
              </code>{" "}
              env var is set, the key is required. Otherwise APIs are open.
            </p>
          </div>
        </div>
      </div>

      {/* API Cards */}
      <div className="space-y-4">
        {health?.apis.map((api) => {
          const docs = API_DOCS[api.name];
          const apiStatus = STATUS_STYLES[api.status];
          return (
            <div
              key={api.path}
              className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden transition-shadow hover:shadow-sm"
            >
              <div className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-cloud text-cos-slate">
                      {docs?.icon ?? <Zap className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-cos-midnight">
                        {api.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-cos-slate">
                        {docs?.description ?? "Public API endpoint"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-cos-pill border px-2.5 py-1 text-xs font-medium ${apiStatus.badge}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${apiStatus.dot}`}
                    />
                    {api.status}
                  </span>
                </div>

                {/* URL bar */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 overflow-x-auto rounded-cos-lg border border-cos-border bg-cos-cloud px-4 py-2.5 font-mono text-sm">
                    <span className="font-semibold text-cos-signal">GET</span>{" "}
                    <span className="text-cos-midnight">{api.path}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(api.path)}
                    className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric"
                    title="Copy URL"
                  >
                    {copiedPath === api.path ? (
                      <Check className="h-4 w-4 text-cos-signal" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={api.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {/* Stats */}
                <div className="mt-4 flex items-center gap-5 text-xs">
                  <div className="flex items-center gap-1.5 text-cos-slate">
                    <Database className="h-3.5 w-3.5 text-cos-electric" />
                    <span className="font-mono font-semibold text-cos-midnight">
                      {api.recordCount.toLocaleString()}
                    </span>{" "}
                    records
                  </div>
                  <div className="flex items-center gap-1.5 text-cos-slate">
                    <Activity className="h-3.5 w-3.5 text-cos-signal" />
                    <span className="font-mono font-semibold text-cos-midnight">
                      {api.latencyMs}ms
                    </span>{" "}
                    latency
                  </div>
                  <div className="flex items-center gap-1.5 text-cos-slate">
                    <Clock className="h-3.5 w-3.5 text-cos-warm" />
                    {new Date(api.lastChecked).toLocaleTimeString()}
                  </div>
                </div>

                {/* Query params */}
                {docs?.params && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {docs.params.map((param) => (
                      <span
                        key={param}
                        className="rounded-cos-pill bg-cos-cloud px-2.5 py-0.5 font-mono text-[11px] text-cos-slate"
                      >
                        {param}
                      </span>
                    ))}
                  </div>
                )}

                {/* Example */}
                {docs?.example && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[11px] text-cos-slate-light">
                      Example:
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(api.path + docs.example)
                      }
                      className="font-mono text-[11px] text-cos-electric hover:underline"
                    >
                      {api.path}
                      {docs.example}
                    </button>
                  </div>
                )}

                {api.error && (
                  <div className="mt-3 rounded-cos-lg border border-cos-ember/15 bg-cos-ember/5 px-3.5 py-2.5 text-sm text-cos-ember">
                    {api.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Reference */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
        <h3 className="font-heading text-base font-semibold text-cos-midnight mb-4">
          Quick Integration Guide
        </h3>
        <div className="space-y-3 text-sm text-cos-slate">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cos-electric" />
            <div>
              <span className="font-medium text-cos-midnight">CORS:</span> All
              endpoints allow{" "}
              <code className="rounded-cos-sm bg-cos-cloud px-1.5 py-0.5 font-mono text-xs">
                *
              </code>{" "}
              origins — call directly from any frontend.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cos-signal" />
            <div>
              <span className="font-medium text-cos-midnight">Caching:</span>{" "}
              Taxonomy cached for 1 hour. Experts/Case Studies/Firms cached for 5
              minutes.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cos-warm" />
            <div>
              <span className="font-medium text-cos-midnight">
                Rate Limits:
              </span>{" "}
              No hard limits currently. Be reasonable ({"<"}100 req/min).
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cos-slate" />
            <div>
              <span className="font-medium text-cos-midnight">
                Pagination:
              </span>{" "}
              Use{" "}
              <code className="rounded-cos-sm bg-cos-cloud px-1.5 py-0.5 font-mono text-xs">
                limit
              </code>{" "}
              and{" "}
              <code className="rounded-cos-sm bg-cos-cloud px-1.5 py-0.5 font-mono text-xs">
                offset
              </code>{" "}
              params. Max 200 per request.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
