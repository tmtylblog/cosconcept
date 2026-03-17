"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Database,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Loader2,
  Rocket,
  Zap,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FirmEnrichment {
  firm: {
    id: string;
    name: string;
    website: string | null;
    organizationId: string;
  };
  stats: {
    totalEntries: number;
    totalCost: number;
    phases: string[];
    firstEnriched: string | null;
    lastEnriched: string | null;
  };
  entries: EnrichmentEntry[];
}

interface EnrichmentEntry {
  id: string;
  firmId: string;
  phase: string;
  source: string;
  rawInput: string | null;
  rawOutput: string | null;
  extractedData: unknown;
  model: string | null;
  costUsd: number | null;
  confidence: number | null;
  durationMs: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const PHASE_COLORS: Record<string, string> = {
  jina: "bg-cos-electric/10 text-cos-electric",
  classifier: "bg-cos-signal/10 text-cos-signal",
  pdl: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700",
  case_study: "bg-cos-warm/10 text-cos-warm",
  onboarding: "bg-emerald-100 text-emerald-700",
  memory: "bg-pink-100 text-pink-700",
  deep_crawl: "bg-orange-100 text-orange-700",
};

// ─── Full System Enrichment Section ─────────────────────

interface BackfillAllResult {
  dryRun?: boolean;
  mode: string;
  firmCount: number;
  totalPendingSteps: number;
  totalSkipSteps: number;
  estimatedCost?: {
    note: string;
    breakdown?: Record<string, string>;
  };
  firms?: {
    firmId: string;
    name: string;
    website: string | null;
    steps: Record<string, string>;
    pendingSteps: number;
    skipSteps: number;
    servicesCount: number;
    caseStudiesCount: number;
    expertsCount: number;
  }[];
  ok?: boolean;
  jobId?: string;
  message?: string;
}

interface BackfillJobStatus {
  id: string;
  status: string;
  result: {
    processed: number;
    total: number;
    mode?: string;
    currentFirm?: string;
    results?: {
      firmId: string;
      firmName: string;
      completed: number;
      skipped: number;
      failed: number;
      steps?: { completed: string[]; skipped: string[]; failed: string[] };
    }[];
  } | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ProviderHealth {
  name: string;
  status: string;
  quota?: { used: number; limit: number; remaining: number; unit: string; percentUsed: number };
  message?: string;
}

function FullSystemEnrichmentSection() {
  const [preview, setPreview] = useState<BackfillAllResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BackfillJobStatus | null>(null);
  const [selectedFirms, setSelectedFirms] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"incremental" | "full-system">("incremental");
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [expandedFirm, setExpandedFirm] = useState<string | null>(null);

  // Load provider health on mount
  useEffect(() => {
    fetch("/api/admin/api-health")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.services) {
          const relevant = (data.services as ProviderHealth[]).filter((s) =>
            ["People Data Labs", "EnrichLayer", "Jina Reader", "OpenRouter"].includes(s.name)
          );
          setProviders(relevant);
        }
      })
      .catch(() => {});
  }, []);

  async function runPreview() {
    setRunning(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/enrich/backfill-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  async function runEnrichment() {
    const firmIds = selectedFirms.size > 0 ? Array.from(selectedFirms) : undefined;
    const modeLabel = mode === "full-system" ? "Full System" : "Incremental";
    const confirmMsg = firmIds
      ? `Run ${modeLabel} enrichment for ${firmIds.length} selected firms?`
      : `Run ${modeLabel} enrichment for ALL firms?`;
    if (!window.confirm(confirmMsg)) return;

    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/enrich/backfill-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, skipCompleted: mode !== "full-system", firmIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setJobId(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/enrich/backfill-all?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === "done" || data.status === "failed") {
            clearInterval(interval);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  function toggleFirm(firmId: string) {
    setSelectedFirms((prev) => {
      const next = new Set(prev);
      if (next.has(firmId)) next.delete(firmId);
      else next.add(firmId);
      return next;
    });
  }

  function selectAll() {
    if (!preview?.firms) return;
    const allIds = preview.firms.map((f) => f.firmId);
    setSelectedFirms((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  }

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold text-cos-midnight flex items-center gap-2">
            <Rocket className="h-4 w-4 text-cos-electric" />
            Full System Enrichment
          </h2>
          <p className="mt-1 text-xs text-cos-slate">
            Processes every firm through the complete enrichment pipeline: Deep Crawl &rarr; Team Roster &rarr;
            Expert Enrichment &rarr; Case Studies &rarr; Graph Sync &rarr; Skill Strength &rarr; Abstraction.
            Uses EnrichLayer (primary) + PDL (fallback) for people, PDL (primary) + Jina+AI (fallback) for companies.
          </p>
        </div>
      </div>

      {/* Provider status */}
      {providers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <div
              key={p.name}
              className={`inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-1 text-[11px] font-medium ${
                p.status === "healthy"
                  ? "bg-cos-signal/10 text-cos-signal"
                  : p.status === "warning"
                  ? "bg-cos-warm/10 text-cos-warm"
                  : p.status === "not_configured"
                  ? "bg-cos-slate/10 text-cos-slate"
                  : "bg-cos-ember/10 text-cos-ember"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                p.status === "healthy" ? "bg-cos-signal" :
                p.status === "warning" ? "bg-cos-warm" :
                p.status === "not_configured" ? "bg-cos-slate" : "bg-cos-ember"
              }`} />
              {p.name}
              {p.quota && (
                <span className="text-[10px] opacity-70">
                  ({p.quota.remaining.toLocaleString()} {p.quota.unit} left)
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mode selector + actions */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-cos-lg border border-cos-border overflow-hidden">
          <button
            onClick={() => { setMode("incremental"); setPreview(null); }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "incremental"
                ? "bg-cos-electric text-white"
                : "bg-white text-cos-slate hover:bg-cos-cloud"
            }`}
          >
            Incremental
          </button>
          <button
            onClick={() => { setMode("full-system"); setPreview(null); }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-cos-border ${
              mode === "full-system"
                ? "bg-cos-electric text-white"
                : "bg-white text-cos-slate hover:bg-cos-cloud"
            }`}
          >
            Full System
          </button>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={runPreview} disabled={running} className="text-xs">
            {running && !jobId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
            Preview
          </Button>
          <Button
            size="sm"
            onClick={runEnrichment}
            disabled={running || !!jobId}
            className={`text-xs ${mode === "full-system" ? "bg-cos-warm hover:bg-cos-warm/90" : "bg-cos-electric hover:bg-cos-electric/90"}`}
          >
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : mode === "full-system" ? <Zap className="mr-1.5 h-3.5 w-3.5" /> : <Rocket className="mr-1.5 h-3.5 w-3.5" />}
            {selectedFirms.size > 0
              ? `Enrich ${selectedFirms.size} Selected`
              : mode === "full-system"
              ? "Full System Enrich All"
              : "Incremental Enrich All"}
          </Button>
        </div>
      </div>

      {mode === "full-system" && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-warm/20 bg-cos-warm/5 px-3 py-2 text-xs text-cos-warm">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          Full System mode: Pro treatment for all firms. Enriches ALL experts (no cap), forces re-abstraction,
          skips nothing. Higher API cost but produces the most complete knowledge graph.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-ember/20 bg-cos-ember/5 px-3 py-2 text-sm text-cos-ember">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Job progress */}
      {jobId && (
        <div className="rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-cos-electric">
            {jobStatus?.status === "done" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : jobStatus?.status === "failed" ? (
              <XCircle className="h-4 w-4 text-cos-ember" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {jobStatus?.status === "done"
              ? "Enrichment complete!"
              : jobStatus?.status === "failed"
              ? "Enrichment failed"
              : `Running ${jobStatus?.result?.mode ?? mode} enrichment... ${jobStatus?.result?.processed ?? 0}/${jobStatus?.result?.total ?? "?"}`}
          </div>
          {jobStatus?.result && (
            <>
              <div className="w-full bg-cos-border rounded-full h-2">
                <div
                  className="bg-cos-electric h-2 rounded-full transition-all"
                  style={{
                    width: `${jobStatus.result.total ? (jobStatus.result.processed / jobStatus.result.total) * 100 : 0}%`,
                  }}
                />
              </div>
              {jobStatus.result.currentFirm && jobStatus.status === "running" && (
                <p className="text-xs text-cos-slate">Processing: {jobStatus.result.currentFirm}</p>
              )}
              {jobStatus.result.results && jobStatus.status === "done" && (
                <div className="overflow-hidden rounded-cos-lg border border-cos-border mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cos-border bg-cos-cloud/50">
                        <th className="px-3 py-1.5 text-left text-cos-slate">Firm</th>
                        <th className="px-3 py-1.5 text-center text-cos-signal">Done</th>
                        <th className="px-3 py-1.5 text-center text-cos-slate">Skipped</th>
                        <th className="px-3 py-1.5 text-center text-cos-ember">Failed</th>
                        <th className="px-3 py-1.5 text-center text-cos-slate">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cos-border/60">
                      {jobStatus.result.results.map((r) => (
                        <>
                          <tr key={r.firmId} className="hover:bg-cos-electric/[0.02]">
                            <td className="px-3 py-1.5 text-cos-midnight font-medium">{r.firmName}</td>
                            <td className="px-3 py-1.5 text-center text-cos-signal">{r.completed}</td>
                            <td className="px-3 py-1.5 text-center text-cos-slate">{r.skipped}</td>
                            <td className="px-3 py-1.5 text-center text-cos-ember">{r.failed}</td>
                            <td className="px-3 py-1.5 text-center">
                              {r.steps && (
                                <button
                                  onClick={() => setExpandedFirm(expandedFirm === r.firmId ? null : r.firmId)}
                                  className="text-cos-electric hover:underline text-[10px]"
                                >
                                  {expandedFirm === r.firmId ? "hide" : "show"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expandedFirm === r.firmId && r.steps && (
                            <tr key={`${r.firmId}-details`}>
                              <td colSpan={5} className="px-3 py-2 bg-cos-cloud/30">
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                  <div>
                                    <span className="font-semibold text-cos-signal">Completed:</span>
                                    {r.steps.completed.map((s) => (
                                      <div key={s} className="text-cos-midnight ml-2">{s}</div>
                                    ))}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-cos-slate">Skipped:</span>
                                    {r.steps.skipped.map((s) => (
                                      <div key={s} className="text-cos-slate ml-2">{s}</div>
                                    ))}
                                  </div>
                                  {r.steps.failed.length > 0 && (
                                    <div>
                                      <span className="font-semibold text-cos-ember">Failed:</span>
                                      {r.steps.failed.map((s) => (
                                        <div key={s} className="text-cos-ember ml-2">{s}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <p className="text-[10px] text-cos-slate font-mono">Job ID: {jobId}</p>
        </div>
      )}

      {/* Preview results */}
      {preview && !jobId && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-midnight">{preview.firmCount}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide">Total Firms</div>
            </div>
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-electric">{preview.totalPendingSteps}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide">Steps to Run</div>
            </div>
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-signal">{preview.totalSkipSteps}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide">Steps to Skip</div>
            </div>
          </div>

          {preview.estimatedCost && (
            <div className="rounded-cos-lg border border-cos-warm/20 bg-cos-warm/5 px-3 py-2 text-xs text-cos-warm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                {preview.estimatedCost.note}
              </div>
              {preview.estimatedCost.breakdown && (
                <div className="mt-2 ml-5 space-y-0.5 text-[10px] text-cos-warm/80">
                  {Object.entries(preview.estimatedCost.breakdown).map(([k, v]) => (
                    <div key={k}>{k}: {v}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Per-firm breakdown */}
          {preview.firms && preview.firms.length > 0 && (
            <div className="overflow-hidden rounded-cos-lg border border-cos-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cos-border bg-cos-cloud/50">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate w-8">
                      <input
                        type="checkbox"
                        checked={selectedFirms.size === (preview.firms?.length ?? 0) && selectedFirms.size > 0}
                        onChange={selectAll}
                        className="rounded border-cos-border"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Firm</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Svcs</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Cases</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Experts</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Pending</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Steps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cos-border/60">
                  {preview.firms.map((f) => (
                    <>
                      <tr key={f.firmId} className={`hover:bg-cos-electric/[0.02] ${selectedFirms.has(f.firmId) ? "bg-cos-electric/5" : ""}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedFirms.has(f.firmId)}
                            onChange={() => toggleFirm(f.firmId)}
                            className="rounded border-cos-border"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-cos-midnight text-sm">{f.name}</div>
                          <div className="font-mono text-[10px] text-cos-slate-light">{f.website ?? "no website"}</div>
                        </td>
                        <td className="px-3 py-2 text-center text-xs">{f.servicesCount}</td>
                        <td className="px-3 py-2 text-center text-xs">{f.caseStudiesCount}</td>
                        <td className="px-3 py-2 text-center text-xs">{f.expertsCount}</td>
                        <td className="px-3 py-2 text-center">
                          {f.pendingSteps > 0 ? (
                            <span className="inline-flex items-center rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] font-medium text-cos-electric">
                              {f.pendingSteps} steps
                            </span>
                          ) : (
                            <span className="text-cos-signal text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 inline" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setExpandedFirm(expandedFirm === f.firmId ? null : f.firmId)}
                            className="text-cos-electric hover:underline text-[10px]"
                          >
                            {expandedFirm === f.firmId ? "hide" : "show"}
                          </button>
                        </td>
                      </tr>
                      {expandedFirm === f.firmId && (
                        <tr key={`${f.firmId}-steps`}>
                          <td colSpan={7} className="px-4 py-2 bg-cos-cloud/30">
                            <div className="flex flex-wrap gap-2 text-[10px]">
                              {Object.entries(f.steps).map(([step, status]) => (
                                <span
                                  key={step}
                                  className={`inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 ${
                                    status === "pending"
                                      ? "bg-cos-electric/10 text-cos-electric"
                                      : "bg-cos-slate/10 text-cos-slate"
                                  }`}
                                >
                                  {status === "pending" ? (
                                    <Rocket className="h-2.5 w-2.5" />
                                  ) : (
                                    <SkipForward className="h-2.5 w-2.5" />
                                  )}
                                  {step}: {status}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.totalPendingSteps === 0 && (
            <div className="flex items-center gap-2 rounded-cos-lg border border-cos-signal/20 bg-cos-signal/5 px-3 py-2 text-xs text-cos-signal font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              All firms are fully enriched &mdash; nothing to run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function AdminEnrichmentPage() {
  const [firmQuery, setFirmQuery] = useState("");
  const [firmId, setFirmId] = useState("");
  const [data, setData] = useState<FirmEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const fetchEnrichment = useCallback(
    async (id: string) => {
      if (!id.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/enrichment/${id.trim()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const statusIcon = (status: string) => {
    if (status === "success")
      return <CheckCircle2 className="h-3.5 w-3.5 text-cos-signal" />;
    if (status === "error")
      return <XCircle className="h-3.5 w-3.5 text-cos-ember" />;
    return <SkipForward className="h-3.5 w-3.5 text-cos-slate" />;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">
          Enrichment
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Full system enrichment pipeline &amp; audit trail.
        </p>
      </div>

      {/* Full System Enrichment */}
      <FullSystemEnrichmentSection />

      {/* Enrichment Audit Trail */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const id = firmId || firmQuery;
          if (id) fetchEnrichment(id);
        }}
        className="flex items-center gap-2"
      >
        <div className="flex flex-1 items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-2.5 focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
          <Search className="h-4 w-4 text-cos-slate" />
          <input
            type="text"
            value={firmId || firmQuery}
            onChange={(e) => {
              setFirmId(e.target.value);
              setFirmQuery(e.target.value);
            }}
            placeholder="Enter firm ID to inspect enrichment trail..."
            className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
          />
        </div>
        <Button type="submit" disabled={loading || !(firmId || firmQuery)}>
          {loading ? "Loading..." : "Inspect"}
        </Button>
      </form>

      {error && (
        <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 p-4 text-sm text-cos-ember">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Firm header */}
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-cos-midnight">
                  {data.firm.name}
                </h2>
                {data.firm.website && (
                  <p className="mt-0.5 text-sm text-cos-slate">
                    {data.firm.website}
                  </p>
                )}
                <p className="mt-1 font-mono text-xs text-cos-slate-light">
                  ID: {data.firm.id}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-cos-electric" />
                <span className="text-cos-slate">Entries:</span>
                <span className="font-medium text-cos-midnight">
                  {data.stats.totalEntries}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-cos-warm" />
                <span className="text-cos-slate">Cost:</span>
                <span className="font-medium text-cos-midnight">
                  ${data.stats.totalCost.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-cos-signal" />
                <span className="text-cos-slate">First:</span>
                <span className="text-xs text-cos-midnight">
                  {data.stats.firstEnriched
                    ? new Date(data.stats.firstEnriched).toLocaleDateString()
                    : "\u2014"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-cos-signal" />
                <span className="text-cos-slate">Last:</span>
                <span className="text-xs text-cos-midnight">
                  {data.stats.lastEnriched
                    ? new Date(data.stats.lastEnriched).toLocaleDateString()
                    : "\u2014"}
                </span>
              </div>
            </div>

            {/* Phase badges */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.stats.phases.map((phase) => (
                <span
                  key={phase}
                  className={`rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${
                    PHASE_COLORS[phase] || "bg-cos-slate/10 text-cos-slate"
                  }`}
                >
                  {phase}
                </span>
              ))}
            </div>
          </div>

          {/* Entries list */}
          <div className="space-y-2">
            <h3 className="font-heading text-base font-semibold text-cos-midnight">
              Audit Trail ({data.entries.length} entries)
            </h3>
            {data.entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-cos-xl border border-cos-border bg-cos-surface"
              >
                <button
                  onClick={() =>
                    setExpandedEntry(
                      expandedEntry === entry.id ? null : entry.id
                    )
                  }
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-cos-electric/5"
                >
                  {statusIcon(entry.status)}
                  <span
                    className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                      PHASE_COLORS[entry.phase] ||
                      "bg-cos-slate/10 text-cos-slate"
                    }`}
                  >
                    {entry.phase}
                  </span>
                  <span className="flex-1 truncate text-sm text-cos-midnight">
                    {entry.source}
                  </span>
                  {entry.model && (
                    <span className="font-mono text-xs text-cos-slate-light">
                      {entry.model}
                    </span>
                  )}
                  {entry.costUsd != null && (
                    <span className="font-mono text-xs text-cos-slate">
                      ${entry.costUsd.toFixed(4)}
                    </span>
                  )}
                  {entry.durationMs != null && (
                    <span className="text-xs text-cos-slate-light">
                      {entry.durationMs}ms
                    </span>
                  )}
                  <span className="text-xs text-cos-slate-light">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  {expandedEntry === entry.id ? (
                    <ChevronDown className="h-4 w-4 text-cos-slate" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-cos-slate" />
                  )}
                </button>

                {expandedEntry === entry.id && (
                  <div className="border-t border-cos-border p-4 text-sm">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {entry.rawInput && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Raw Input
                          </p>
                          <pre className="max-h-48 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                            {entry.rawInput.length > 2000
                              ? entry.rawInput.slice(0, 2000) + "\n..."
                              : entry.rawInput}
                          </pre>
                        </div>
                      )}
                      {entry.rawOutput && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                            Raw Output
                          </p>
                          <pre className="max-h-48 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                            {entry.rawOutput.length > 2000
                              ? entry.rawOutput.slice(0, 2000) + "\n..."
                              : entry.rawOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                    {entry.extractedData != null && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                          Extracted Data
                        </p>
                        <pre className="max-h-48 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                          {JSON.stringify(entry.extractedData, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.errorMessage && (
                      <div className="mt-3 rounded-cos-md bg-cos-ember/5 p-3 text-sm text-cos-ember">
                        {entry.errorMessage}
                      </div>
                    )}
                    {entry.confidence != null && (
                      <p className="mt-2 text-xs text-cos-slate">
                        Confidence: {(entry.confidence * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {data.entries.length === 0 && (
              <div className="rounded-cos-xl border border-dashed border-cos-border py-8 text-center text-sm text-cos-slate">
                No enrichment entries found for this firm.
              </div>
            )}
          </div>
        </>
      )}

      {!data && !error && !loading && (
        <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Database className="h-6 w-6 text-cos-electric" />
          </div>
          <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
            Enrichment Audit Trail
          </h3>
          <p className="mt-1 max-w-xs text-xs text-cos-slate">
            Enter a firm ID to inspect the full enrichment pipeline history
            including raw inputs/outputs, costs, and extracted data.
          </p>
        </div>
      )}
    </div>
  );
}
