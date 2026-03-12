"use client";

import { useState, useCallback } from "react";
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
  RefreshCw,
  Briefcase,
  FileText,
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

interface BackfillResult {
  dryRun: boolean;
  firmsProcessed: number;
  totalServicesSeeded: number;
  totalCsQueued: number;
  results: { firmId: string; name: string; servicesSeeded: number; caseStudiesQueued: number; skipped?: string }[];
}

function BackfillSection() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/enrich/backfill-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  const actionableResults = result?.results.filter(r => r.servicesSeeded > 0 || r.caseStudiesQueued > 0) ?? [];
  const skippedResults = result?.results.filter(r => r.servicesSeeded === 0 && r.caseStudiesQueued === 0) ?? [];

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold text-cos-midnight flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-cos-electric" />
            Backfill Services &amp; Case Studies
          </h2>
          <p className="mt-1 text-xs text-cos-slate">
            For all firms with enrichment data but no services/case study rows yet — seeds
            services from their website scrape and queues discovered case study URLs for AI ingestion.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={running} className="text-xs">
            {running ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
            Preview
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={running} className="bg-cos-electric hover:bg-cos-electric/90 text-xs">
            {running ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Run Backfill (All Firms)
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-ember/20 bg-cos-ember/5 px-3 py-2 text-sm text-cos-ember">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-midnight">{result.firmsProcessed}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide">Firms checked</div>
            </div>
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-electric">{result.totalServicesSeeded}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide flex items-center justify-center gap-1">
                <Briefcase className="h-3 w-3" /> Services {result.dryRun ? "to seed" : "seeded"}
              </div>
            </div>
            <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
              <div className="text-2xl font-bold text-cos-signal">{result.totalCsQueued}</div>
              <div className="text-[10px] text-cos-slate uppercase tracking-wide flex items-center justify-center gap-1">
                <FileText className="h-3 w-3" /> Case studies {result.dryRun ? "to queue" : "queued"}
              </div>
            </div>
          </div>

          {result.dryRun && (
            <div className="flex items-center gap-2 rounded-cos-lg border border-cos-warm/20 bg-cos-warm/5 px-3 py-2 text-xs text-cos-warm font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Preview only — no changes made. Click &quot;Run Backfill&quot; to apply.
            </div>
          )}

          {/* Firms with data to action */}
          {actionableResults.length > 0 && (
            <div className="overflow-hidden rounded-cos-lg border border-cos-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cos-border bg-cos-cloud/50">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Firm</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Services</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Case Studies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cos-border/60">
                  {actionableResults.map(r => (
                    <tr key={r.firmId} className="hover:bg-cos-electric/[0.02]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-cos-midnight text-sm">{r.name}</div>
                        <div className="font-mono text-[10px] text-cos-slate-light">{r.firmId}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.servicesSeeded > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] font-medium text-cos-electric">
                            <Briefcase className="h-3 w-3" /> {r.servicesSeeded}
                          </span>
                        ) : <span className="text-cos-slate-light text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.caseStudiesQueued > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[11px] font-medium text-cos-signal">
                            <FileText className="h-3 w-3" /> {r.caseStudiesQueued}
                          </span>
                        ) : <span className="text-cos-slate-light text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {actionableResults.length === 0 && (
            <div className="flex items-center gap-2 rounded-cos-lg border border-cos-signal/20 bg-cos-signal/5 px-3 py-2 text-xs text-cos-signal font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              All firms already have services/case studies — nothing to backfill.
            </div>
          )}

          {skippedResults.length > 0 && (
            <details className="text-xs text-cos-slate">
              <summary className="cursor-pointer hover:text-cos-midnight">{skippedResults.length} firms skipped (already populated or no data)</summary>
              <div className="mt-2 space-y-1 pl-3">
                {skippedResults.map(r => (
                  <div key={r.firmId} className="flex items-center gap-2">
                    <span className="text-cos-midnight font-medium">{r.name}</span>
                    {r.skipped && <span className="text-cos-slate-light">— {r.skipped}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

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
          Enrichment Audit
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Inspect enrichment pipeline results for any firm.
        </p>
      </div>

      {/* Backfill tool */}
      <BackfillSection />

      {/* Search */}
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
                    : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-cos-signal" />
                <span className="text-cos-slate">Last:</span>
                <span className="text-xs text-cos-midnight">
                  {data.stats.lastEnriched
                    ? new Date(data.stats.lastEnriched).toLocaleDateString()
                    : "—"}
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
