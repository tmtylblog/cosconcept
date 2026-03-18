"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Layers,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Brain,
  Database,
  Cpu,
  Zap,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  FileText,
  Users,
  Microscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────

interface MatchCandidate {
  firmId: string;
  firmName: string;
  totalScore: number;
  structuredScore: number;
  vectorScore: number;
  llmScore?: number;
  matchExplanation?: string;
  bidirectionalFit?: { theyWantUs: number; weWantThem: number };
  preview: {
    categories: string[];
    topServices: string[];
    topSkills: string[];
    industries: string[];
    employeeCount?: number;
    website?: string;
  };
}

interface SearchTestResult {
  query: string;
  parsedFilters: Record<string, unknown>;
  layer1: { count: number; topCandidates: MatchCandidate[] };
  layer2: { count: number; topCandidates: MatchCandidate[] };
  layer3: { count: number; results: MatchCandidate[] };
  stats: {
    layer1Candidates: number;
    layer2Candidates: number;
    layer3Ranked: number;
    totalDurationMs: number;
    estimatedCostUsd: number;
    layer1Source?: "neo4j" | "pg";
  };
}

interface AbstractionFirm {
  firmId: string;
  firmName: string;
  hasProfile: boolean;
  confidenceScores: Record<string, number> | null;
  lastEnrichedAt: string | null;
}

interface AbstractionStats {
  totalFirms: number;
  profilesGenerated: number;
  missingProfiles: number;
  avgConfidence: number | null;
}

// ─── Main Page ──────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function AdminSearchPage() {
  // Search tool state
  const [query, setQuery] = useState("");
  const [searcherFirmId, setSearcherFirmId] = useState("");
  const [skipLlm, setSkipLlm] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchTestResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expandedLayer, setExpandedLayer] = useState<"layer1" | "layer2" | "layer3" | null>("layer3");

  // Abstraction state
  const [abstractions, setAbstractions] = useState<AbstractionFirm[]>([]);
  const [abstractionStats, setAbstractionStats] = useState<AbstractionStats | null>(null);
  const [abstractionsLoading, setAbstractionsLoading] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [absPage, setAbsPage] = useState(1);

  // ─── Search handlers ──────────────────────────────────────

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await fetch("/api/admin/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          searcherFirmId: searcherFirmId.trim() || undefined,
          skipLlmRanking: skipLlm,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: SearchTestResult = await res.json();
      setSearchResult(data);
      setExpandedLayer(skipLlm ? "layer2" : "layer3");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, searcherFirmId, skipLlm]);

  // ─── Abstraction handlers ─────────────────────────────────

  const loadAbstractions = useCallback(async (missingOnly = false) => {
    setAbstractionsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/abstractions?missing=${missingOnly}&limit=100`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAbstractionStats(data.stats);
      setAbstractions(data.firms);
    } catch (err) {
      console.error("[Admin] Abstractions load error:", err);
    } finally {
      setAbstractionsLoading(false);
    }
  }, []);

  const regenerate = useCallback(async (firmId: string) => {
    setRegeneratingId(firmId);
    try {
      const res = await fetch(`/api/admin/abstractions/${firmId}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reload the list
      await loadAbstractions(showMissingOnly);
    } catch (err) {
      console.error("[Admin] Regenerate error:", err);
    } finally {
      setRegeneratingId(null);
    }
  }, [loadAbstractions, showMissingOnly]);

  const toggleMissing = (val: boolean) => {
    setShowMissingOnly(val);
    loadAbstractions(val);
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Search & Matching
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Test the 3-layer cascade search engine and manage abstraction profiles.
        </p>
      </div>

      {/* ── Search Test Tool ─────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Layers className="h-4.5 w-4.5 text-cos-electric" />
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Search Test Tool
          </h2>
        </div>

        {/* Query input */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3 focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric/20">
            <Search className="h-4 w-4 shrink-0 text-cos-slate" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !searching && runSearch()}
              placeholder="Natural language query (e.g. B2B SaaS marketing agency in North America)"
              className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-2.5 focus-within:border-cos-electric min-w-56">
              <Filter className="h-3.5 w-3.5 shrink-0 text-cos-slate" />
              <input
                type="text"
                value={searcherFirmId}
                onChange={(e) => setSearcherFirmId(e.target.value)}
                placeholder="Searcher Firm ID (optional — enables bidirectional fit)"
                className="flex-1 bg-transparent text-xs text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-cos-slate">
              <input
                type="checkbox"
                checked={skipLlm}
                onChange={(e) => setSkipLlm(e.target.checked)}
                className="h-4 w-4 rounded border-cos-border accent-cos-electric"
              />
              Skip LLM ranking (faster)
            </label>

            <Button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="ml-auto"
            >
              {searching ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Run Search
                </>
              )}
            </Button>
          </div>
        </div>

        {searchError && (
          <div className="flex items-center gap-2 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-4 py-3 text-sm text-cos-ember">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {searchError}
          </div>
        )}

        {/* Results */}
        {searchResult && (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-cloud-dim px-5 py-3.5">
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-cos-signal" />
                <span className="font-mono font-semibold text-cos-midnight">
                  {searchResult.stats.totalDurationMs}ms
                </span>
              </div>
              <div className="h-4 w-px bg-cos-border" />
              <div className="flex items-center gap-1.5 text-xs">
                <DollarSign className="h-3.5 w-3.5 text-cos-warm" />
                <span className="font-mono font-semibold text-cos-midnight">
                  ${searchResult.stats.estimatedCostUsd.toFixed(4)}
                </span>
              </div>
              <div className="h-4 w-px bg-cos-border" />
              <div className="flex items-center gap-2 text-xs text-cos-slate">
                <span>
                  Layer 1:{" "}
                  <strong className="text-cos-midnight">{searchResult.stats.layer1Candidates}</strong>
                </span>
                <span>→</span>
                <span>
                  Layer 2:{" "}
                  <strong className="text-cos-midnight">{searchResult.stats.layer2Candidates}</strong>
                </span>
                <span>→</span>
                <span>
                  Layer 3:{" "}
                  <strong className="text-cos-midnight">{searchResult.stats.layer3Ranked}</strong>
                </span>
              </div>
              {/* Parsed filters */}
              {Object.keys(searchResult.parsedFilters).length > 0 && (
                <>
                  <div className="h-4 w-px bg-cos-border" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(searchResult.parsedFilters).map(([k, v]) =>
                      v && (!Array.isArray(v) || v.length > 0) ? (
                        <span
                          key={k}
                          className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] font-medium text-cos-electric"
                        >
                          {k}: {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                        </span>
                      ) : null
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Layer accordions */}
            <LayerAccordion
              title={`Layer 1 — Structured Filter (${searchResult.stats.layer1Source === "pg" ? "PG Fallback" : "Neo4j"})`}
              icon={<Database className="h-3.5 w-3.5" />}
              iconColor={searchResult.stats.layer1Source === "pg" ? "text-amber-600" : "text-purple-600"}
              iconBg={searchResult.stats.layer1Source === "pg" ? "bg-amber-50" : "bg-purple-50"}
              count={searchResult.layer1.count}
              candidates={searchResult.layer1.topCandidates}
              scoreKey="structuredScore"
              isOpen={expandedLayer === "layer1"}
              onToggle={() =>
                setExpandedLayer(expandedLayer === "layer1" ? null : "layer1")
              }
              showEvidence
            />
            <LayerAccordion
              title="Layer 2 — Vector Re-rank"
              icon={<Cpu className="h-3.5 w-3.5" />}
              iconColor="text-cos-signal"
              iconBg="bg-cos-signal/10"
              count={searchResult.layer2.count}
              candidates={searchResult.layer2.topCandidates}
              scoreKey="vectorScore"
              isOpen={expandedLayer === "layer2"}
              onToggle={() =>
                setExpandedLayer(expandedLayer === "layer2" ? null : "layer2")
              }
            />
            <LayerAccordion
              title={`Layer 3 — LLM Deep Ranking${skipLlm ? " (skipped)" : ""}`}
              icon={<Brain className="h-3.5 w-3.5" />}
              iconColor="text-cos-electric"
              iconBg="bg-cos-electric/10"
              count={searchResult.layer3.count}
              candidates={searchResult.layer3.results}
              scoreKey="llmScore"
              showExplanation
              isOpen={expandedLayer === "layer3"}
              onToggle={() =>
                setExpandedLayer(expandedLayer === "layer3" ? null : "layer3")
              }
            />
          </div>
        )}
      </section>

      {/* ── Abstraction Profile Status ───────────────────── */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4.5 w-4.5 text-cos-electric" />
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Abstraction Profile Status
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-cos-slate">
              <input
                type="checkbox"
                checked={showMissingOnly}
                onChange={(e) => toggleMissing(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-cos-border accent-cos-electric"
              />
              Missing profiles only
            </label>
            <button
              onClick={() => loadAbstractions(showMissingOnly)}
              disabled={abstractionsLoading}
              className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-1.5 text-xs font-medium text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${abstractionsLoading ? "animate-spin" : ""}`}
              />
              Load
            </button>
          </div>
        </div>

        {abstractionStats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SmallStatCard
              label="Total Firms"
              value={abstractionStats.totalFirms}
              color="text-cos-midnight"
            />
            <SmallStatCard
              label="Profiles Generated"
              value={abstractionStats.profilesGenerated}
              color="text-cos-signal"
            />
            <SmallStatCard
              label="Missing Profiles"
              value={abstractionStats.missingProfiles}
              color={abstractionStats.missingProfiles > 0 ? "text-cos-ember" : "text-cos-signal"}
            />
            <SmallStatCard
              label="Avg Confidence"
              value={
                abstractionStats.avgConfidence != null
                  ? `${(abstractionStats.avgConfidence * 100).toFixed(0)}%`
                  : "—"
              }
              color="text-cos-warm"
            />
          </div>
        )}

        {abstractions.length > 0 && (
          <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud-dim">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Firm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Last Generated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-border">
                {abstractions
                  .slice((absPage - 1) * PAGE_SIZE, absPage * PAGE_SIZE)
                  .map((firm) => {
                  const overallConf = firm.confidenceScores?.overall;
                  const isRegen = regeneratingId === firm.firmId;
                  return (
                    <tr key={firm.firmId} className="hover:bg-cos-electric/5">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-cos-midnight">{firm.firmName}</p>
                          <p className="font-mono text-[11px] text-cos-slate-light">
                            {firm.firmId}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {firm.hasProfile ? (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-xs font-medium text-cos-signal">
                            <CheckCircle2 className="h-3 w-3" />
                            Generated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-ember/10 px-2 py-0.5 text-xs font-medium text-cos-ember">
                            <AlertCircle className="h-3 w-3" />
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {overallConf != null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-cos-cloud-dim">
                              <div
                                className="h-full rounded-full bg-cos-electric"
                                style={{ width: `${Math.round(overallConf * 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-cos-midnight">
                              {(overallConf * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-cos-slate-light">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate">
                        {firm.lastEnrichedAt
                          ? new Date(firm.lastEnrichedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => regenerate(firm.firmId)}
                          disabled={isRegen}
                          className="inline-flex items-center gap-1 rounded-cos-lg px-2.5 py-1 text-xs font-medium text-cos-electric hover:bg-cos-electric/10 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${isRegen ? "animate-spin" : ""}`}
                          />
                          {isRegen ? "Regenerating…" : "Regenerate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {abstractions.length > PAGE_SIZE && (() => {
              const totalPages = Math.ceil(abstractions.length / PAGE_SIZE);
              return (
                <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
                  <span className="text-xs text-cos-slate">
                    Showing {(absPage - 1) * PAGE_SIZE + 1}–{Math.min(absPage * PAGE_SIZE, abstractions.length)} of {abstractions.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAbsPage((p) => Math.max(1, p - 1))} disabled={absPage === 1} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Previous</button>
                    <span className="text-xs text-cos-slate">Page {absPage} of {totalPages}</span>
                    <button onClick={() => setAbsPage((p) => Math.min(totalPages, p + 1))} disabled={absPage === totalPages} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40">Next</button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {!abstractionStats && !abstractionsLoading && (
          <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
              <Brain className="h-6 w-6 text-cos-electric" />
            </div>
            <p className="mt-3 text-sm font-medium text-cos-midnight">
              Abstraction Profile Status
            </p>
            <p className="mt-1 text-xs text-cos-slate">
              Click Load to see abstraction profile coverage across all firms.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Layer Accordion ────────────────────────────────────────

function LayerAccordion({
  title,
  icon,
  iconColor,
  iconBg,
  count,
  candidates,
  scoreKey,
  showExplanation,
  showEvidence,
  isOpen,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  count: number;
  candidates: MatchCandidate[];
  scoreKey: keyof MatchCandidate;
  showExplanation?: boolean;
  showEvidence?: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-cos-electric/5"
      >
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-cos-md ${iconBg} ${iconColor}`}>
          {icon}
        </span>
        <span className="flex-1 font-medium text-cos-midnight">{title}</span>
        <span className="font-mono text-sm font-semibold text-cos-midnight">
          {count}
        </span>
        <span className="text-xs text-cos-slate-light">candidates</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-cos-slate" />
        ) : (
          <ChevronRight className="h-4 w-4 text-cos-slate" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-cos-border">
          {candidates.length === 0 ? (
            <p className="px-5 py-4 text-sm text-cos-slate">
              No candidates returned at this layer.
            </p>
          ) : (
            <div className="divide-y divide-cos-border">
              {candidates.map((c, idx) => {
                const score = c[scoreKey] as number | undefined;
                const hasEvidence = showEvidence && (c.preview.skillEvidence?.length || c.preview.serviceEvidence?.length || c.preview.caseStudyCount);
                const isEvidenceOpen = expandedEvidence === c.firmId;

                return (
                  <div key={c.firmId} className="px-5 py-3.5 text-sm">
                    <div className="flex items-start gap-4">
                      <span className="mt-0.5 w-5 text-right font-mono text-[11px] text-cos-slate-light">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-cos-midnight truncate">{c.firmName}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.preview.categories.slice(0, 2).map((cat) => (
                            <span key={cat} className="rounded-cos-pill bg-cos-electric/8 px-2 py-0.5 text-[11px] text-cos-electric">
                              {cat}
                            </span>
                          ))}
                          {c.preview.industries.slice(0, 2).map((ind) => (
                            <span key={ind} className="rounded-cos-pill bg-cos-slate/8 px-2 py-0.5 text-[11px] text-cos-slate">
                              {ind}
                            </span>
                          ))}
                        </div>

                        {/* Evidence summary bar */}
                        {showEvidence && (
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-cos-slate-light">
                            {c.preview.caseStudyCount != null && c.preview.caseStudyCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <FileText className="h-3 w-3" />
                                {c.preview.caseStudyCount} CS
                              </span>
                            )}
                            {c.preview.teamRelevance != null && c.preview.teamRelevance > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                {c.preview.teamRelevance} team
                              </span>
                            )}
                            {c.preview.skillEvidence && c.preview.skillEvidence.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Zap className="h-3 w-3" />
                                {c.preview.skillEvidence.length} skills
                              </span>
                            )}
                            {c.preview.classifierConfidence != null && (
                              <span className={cn(
                                "font-mono",
                                c.preview.classifierConfidence > 0.7 ? "text-cos-signal" :
                                c.preview.classifierConfidence < 0.3 ? "text-cos-ember" : "text-cos-slate-light"
                              )}>
                                conf: {(c.preview.classifierConfidence * 100).toFixed(0)}%
                              </span>
                            )}
                            {hasEvidence && (
                              <button
                                onClick={() => setExpandedEvidence(isEvidenceOpen ? null : c.firmId)}
                                className="flex items-center gap-0.5 text-cos-electric hover:text-cos-electric/80 font-medium"
                              >
                                <Microscope className="h-3 w-3" />
                                {isEvidenceOpen ? "Hide" : "Evidence"}
                              </button>
                            )}
                          </div>
                        )}

                        {showExplanation && c.matchExplanation && (
                          <p className="mt-1.5 text-xs text-cos-slate line-clamp-2">
                            {c.matchExplanation}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {score != null && (
                          <p className="font-mono text-sm font-semibold text-cos-midnight">
                            {(score * 100).toFixed(1)}
                          </p>
                        )}
                        <p className="font-mono text-[11px] text-cos-slate-light">
                          total: {(c.totalScore * 100).toFixed(1)}
                        </p>
                      </div>
                    </div>

                    {/* Expanded evidence panel */}
                    {isEvidenceOpen && (
                      <div className="mt-2 ml-9 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 p-3 space-y-2 text-[11px]">
                        {/* Skills with evidence */}
                        {c.preview.skillEvidence && c.preview.skillEvidence.length > 0 && (
                          <div>
                            <p className="font-bold text-cos-midnight mb-1">Matched Skills (HAS_SKILL edges)</p>
                            <div className="flex flex-wrap gap-1">
                              {c.preview.skillEvidence.map((sk, i) => (
                                <span key={i} className={cn(
                                  "inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
                                  sk.confidence > 0.7 ? "bg-cos-signal/10 text-cos-signal" :
                                  sk.confidence > 0.3 ? "bg-cos-warm/10 text-cos-warm" :
                                  "bg-cos-slate/10 text-cos-slate"
                                )}>
                                  {sk.name}
                                  <span className="text-[9px] opacity-70">
                                    ({sk.caseStudyCount > 0 ? `${sk.caseStudyCount} ev` : "0 ev"}, {(sk.confidence * 100).toFixed(0)}%)
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Services with evidence */}
                        {c.preview.serviceEvidence && c.preview.serviceEvidence.length > 0 && (
                          <div>
                            <p className="font-bold text-cos-midnight mb-1">Matched Services (OFFERS_SERVICE edges)</p>
                            <div className="flex flex-wrap gap-1">
                              {c.preview.serviceEvidence.map((svc, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] font-medium text-cos-slate">
                                  {svc.name}
                                  {svc.caseStudyCount > 0 && <span className="text-[9px] opacity-70">({svc.caseStudyCount} ev)</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Summary counts */}
                        <div className="flex gap-4 pt-1 border-t border-cos-electric/10 text-cos-slate-light">
                          <span>Case studies: <strong className="text-cos-midnight">{c.preview.caseStudyCount ?? 0}</strong></span>
                          <span>Team relevance: <strong className="text-cos-midnight">{c.preview.teamRelevance ?? 0}</strong></span>
                          <span>Classifier: <strong className="text-cos-midnight">{c.preview.classifierConfidence != null ? `${(c.preview.classifierConfidence * 100).toFixed(0)}%` : "—"}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small stat card ────────────────────────────────────────

function SmallStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-bold tracking-tight ${color}`}>
        {value}
      </p>
    </div>
  );
}
