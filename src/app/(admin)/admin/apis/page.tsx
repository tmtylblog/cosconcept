"use client";

/**
 * Admin External APIs Dashboard
 *
 * Shows all public API endpoints with URLs, health status,
 * record counts, and quick-copy functionality.
 */

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
  Building,
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
      "Skills taxonomy (L1→L2), firm categories, and symbiotic firm relationships",
    params: ["section=categories|skills|relationships"],
    example: "?section=skills",
  },
  Experts: {
    icon: <Users className="h-5 w-5" />,
    description: "Expert profiles with skills, industries, and firm affiliations",
    params: ["limit=50", "offset=0", "firmId=xxx"],
    example: "?limit=20&firmId=firm_123",
  },
  "Case Studies": {
    icon: <FileText className="h-5 w-5" />,
    description: "Case study profiles with extracted insights and firm links",
    params: ["limit=50", "offset=0", "firmId=xxx"],
    example: "?limit=20",
  },
  "Firms Directory": {
    icon: <Building className="h-5 w-5" />,
    description: "Public firm directory with profiles and enrichment data",
    params: ["limit=50", "offset=0", "firmType=xxx"],
    example: "?firmType=agency&limit=20",
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

  const statusColors = {
    healthy: "bg-emerald-100 text-emerald-700 border-emerald-200",
    degraded: "bg-amber-100 text-amber-700 border-amber-200",
    down: "bg-red-100 text-red-700 border-red-200",
  };

  const statusDots = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-red-500",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="h-6 w-6 text-indigo-600" />
            External APIs
          </h1>
          <p className="text-gray-500 mt-1">
            Public API endpoints for third-party integrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
              statusColors[health?.status as keyof typeof statusColors] ??
              statusColors.down
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                statusDots[health?.status as keyof typeof statusDots] ??
                statusDots.down
              }`}
            />
            {health?.status === "healthy"
              ? "All Systems Operational"
              : "Some Issues Detected"}
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 text-gray-600 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Auth Info */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-indigo-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-indigo-900">Authentication</h3>
            <p className="text-sm text-indigo-700 mt-1">
              All public APIs accept an optional{" "}
              <code className="bg-indigo-100 px-1 py-0.5 rounded text-xs">
                x-api-key
              </code>{" "}
              header. If{" "}
              <code className="bg-indigo-100 px-1 py-0.5 rounded text-xs">
                PUBLIC_API_KEY
              </code>{" "}
              env var is set, the key is required. Otherwise APIs are open.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-indigo-600 font-medium">
                API Key Status:
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {process.env.PUBLIC_API_KEY ? "Required" : "Open (no key set)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* API Cards */}
      <div className="space-y-4">
        {health?.apis.map((api) => {
          const docs = API_DOCS[api.name];
          return (
            <div
              key={api.path}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-50 rounded-lg text-gray-600">
                      {docs?.icon ?? <Zap className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {api.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {docs?.description ?? "Public API endpoint"}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[api.status]}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${statusDots[api.status]}`}
                    />
                    {api.status}
                  </div>
                </div>

                {/* URL with copy */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm text-gray-700 overflow-x-auto">
                    <span className="text-emerald-600 font-medium">GET</span>{" "}
                    {api.path}
                  </div>
                  <button
                    onClick={() => copyToClipboard(api.path)}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedPath === api.path ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-600" />
                    )}
                  </button>
                  <a
                    href={api.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4 text-gray-600" />
                  </a>
                </div>

                {/* Stats row */}
                <div className="mt-4 flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Database className="h-3.5 w-3.5" />
                    <span className="font-medium text-gray-700">
                      {api.recordCount.toLocaleString()}
                    </span>{" "}
                    records
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Activity className="h-3.5 w-3.5" />
                    <span className="font-medium text-gray-700">
                      {api.latencyMs}ms
                    </span>{" "}
                    latency
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(api.lastChecked).toLocaleTimeString()}
                  </div>
                </div>

                {/* Query params */}
                {docs?.params && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {docs.params.map((param) => (
                      <span
                        key={param}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono"
                      >
                        {param}
                      </span>
                    ))}
                  </div>
                )}

                {/* Example */}
                {docs?.example && (
                  <div className="mt-3">
                    <span className="text-xs text-gray-400">Example: </span>
                    <button
                      onClick={() => copyToClipboard(api.path + docs.example)}
                      className="text-xs font-mono text-indigo-600 hover:text-indigo-700"
                    >
                      {api.path}
                      {docs.example}
                    </button>
                  </div>
                )}

                {api.error && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {api.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Reference */}
      <div className="mt-8 bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Quick Integration Guide</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-700">CORS:</span> All endpoints
            allow <code className="bg-white px-1 py-0.5 rounded text-xs">*</code>{" "}
            origins — call directly from any frontend.
          </div>
          <div>
            <span className="font-medium text-gray-700">Caching:</span> Taxonomy
            cached for 1 hour. Experts/Case Studies/Firms cached for 5 minutes.
          </div>
          <div>
            <span className="font-medium text-gray-700">Rate Limits:</span>{" "}
            No hard limits currently. Be reasonable ({"<"}100 req/min).
          </div>
          <div>
            <span className="font-medium text-gray-700">Pagination:</span> Use{" "}
            <code className="bg-white px-1 py-0.5 rounded text-xs">
              limit
            </code>{" "}
            and{" "}
            <code className="bg-white px-1 py-0.5 rounded text-xs">
              offset
            </code>{" "}
            params. Max 200 per request.
          </div>
        </div>
      </div>
    </div>
  );
}
