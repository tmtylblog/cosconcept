"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import {
  ArrowLeft,
  Globe,
  Zap,
  Microscope,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Building2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface OnboardingEvent {
  id: string;
  stage: string;
  event: string;
  label: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface EnrichmentAuditEntry {
  phase: string;
  source: string;
  status: string;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  confidence: number | null;
  errorMessage: string | null;
  extractedData: unknown;
  createdAt: string;
}

interface PartnerPreferences {
  preferredFirmTypes: string[];
  preferredSizeBands: string[];
  preferredIndustries: string[];
  preferredMarkets: string[];
  partnershipModels: string[];
  dealBreakers: string[];
  growthGoals: string | null;
  rawOnboardingData: Record<string, unknown> | null;
}

interface SessionDetail {
  domain: string;
  firmId: string | null;
  userId: string | null;
  organizationId: string | null;
  firmName: string | null;
  enrichmentStatus: string | null;
  isPlatformMember: boolean;
  firstEventAt: string;
  lastEventAt: string;
  events: OnboardingEvent[];
  enrichmentAudit: EnrichmentAuditEntry[];
  enrichmentData: Record<string, unknown> | null;
  partnerPreferences: PartnerPreferences | null;
}

// ─── Stage helpers ───────────────────────────────────────────

const STAGE_ICONS: Record<string, React.ReactNode> = {
  domain_submitted: <Globe className="h-3.5 w-3.5" />,
  cache_lookup: <Zap className="h-3.5 w-3.5" />,
  enrichment_stage_done: <Microscope className="h-3.5 w-3.5" />,
  interview: <MessageSquare className="h-3.5 w-3.5" />,
  complete: <CheckCircle2 className="h-3.5 w-3.5" />,
  error: <XCircle className="h-3.5 w-3.5" />,
};

const STAGE_COLORS: Record<string, { bg: string; text: string; line: string }> = {
  domain_submitted: { bg: "bg-cos-electric/10", text: "text-cos-electric", line: "bg-cos-electric/30" },
  cache_lookup: { bg: "bg-cos-warm/10", text: "text-cos-warm", line: "bg-cos-warm/30" },
  enrichment_stage_done: { bg: "bg-purple-50", text: "text-purple-600", line: "bg-purple-200" },
  interview: { bg: "bg-blue-50", text: "text-blue-600", line: "bg-blue-200" },
  complete: { bg: "bg-cos-signal/10", text: "text-cos-signal", line: "bg-cos-signal/30" },
  error: { bg: "bg-cos-ember/10", text: "text-cos-ember", line: "bg-cos-ember/30" },
};

const EVENT_LABELS: Record<string, string> = {
  domain_submitted: "Domain Submitted",
  cache_hit: "Cache: Full Hit",
  cache_hit_partial: "Cache: Partial Hit",
  cache_miss: "Cache: Miss",
  pdl_start: "PDL: Started",
  pdl_done: "PDL: Complete",
  jina_start: "Scrape: Started",
  jina_done: "Scrape: Complete",
  classify_start: "Classify: Started",
  classify_done: "Classify: Complete",
  deep_crawl_start: "Deep Crawl: Started",
  deep_crawl_done: "Deep Crawl: Complete",
  interview_start: "Interview Started",
  interview_complete: "Interview Complete",
  onboarding_complete: "Onboarding Complete",
  error: "Error",
};

const PHASE_COLORS: Record<string, string> = {
  pdl: "bg-purple-100 text-purple-700",
  jina: "bg-cos-electric/10 text-cos-electric",
  classifier: "bg-cos-signal/10 text-cos-signal",
  deep_crawl: "bg-orange-100 text-orange-700",
  onboarding: "bg-emerald-100 text-emerald-700",
};

const CACHE_SOURCE_LABELS: Record<string, { label: string; sub: string }> = {
  cache: { label: "Enrichment Cache", sub: "domain-keyed local cache table" },
  postgres: { label: "Platform Database", sub: "previously enriched firm in serviceFirms" },
  neo4j: { label: "Knowledge Graph", sub: "data found in Neo4j graph DB" },
};

/** Format a UTC ISO timestamp to the user's local date + time */
function fmtTs(iso: string, opts?: { dateOnly?: boolean; timeOnly?: boolean }): string {
  const d = new Date(iso);
  if (opts?.timeOnly) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }
  if (opts?.dateOnly) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Page ────────────────────────────────────────────────────

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain: domainParam } = use(params);
  const domain = decodeURIComponent(domainParam);

  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [activeEnrichTab, setActiveEnrichTab] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/admin/onboarding/sessions/${encodeURIComponent(domain)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: SessionDetail) => {
        setData(d);
        // Set default enrichment tab to first available phase
        const phases = [...new Set(d.enrichmentAudit.map((e) => e.phase))];
        if (phases.length > 0) setActiveEnrichTab(phases[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [domain]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-cos-md bg-cos-border" />
        <div className="h-32 rounded-cos-xl bg-cos-border/50" />
        <div className="h-64 rounded-cos-xl bg-cos-border/50" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <a
          href="/admin/onboarding"
          className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Onboarding
        </a>
        <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-4 text-sm text-cos-ember">
          {error ?? "Session not found"}
        </div>
      </div>
    );
  }

  const enrichmentPhases = [...new Set(data.enrichmentAudit.map((e) => e.phase))];
  const filteredAudit =
    activeEnrichTab === "all"
      ? data.enrichmentAudit
      : data.enrichmentAudit.filter((e) => e.phase === activeEnrichTab);

  // Derive status from events + enrichmentStatus
  const isComplete = data.events.some((e) => e.stage === "onboarding_complete");
  const isFailed = data.events.some((e) => e.event.includes("failed")) ||
    data.enrichmentAudit.some((e) => e.status === "error");
  const enrichStatus = data.enrichmentStatus;
  const status =
    isComplete || enrichStatus === "enriched" || enrichStatus === "verified"
      ? "Complete"
      : isFailed
      ? "Failed"
      : data.events.some((e) => e.stage === "interview_answer")
      ? "In Interview"
      : data.events.some((e) => e.stage === "enrichment_stage_done")
      ? "Enriching"
      : data.events.length > 1
      ? "In Progress"
      : "Started";
  const statusColor =
    status === "Complete"
      ? "bg-cos-signal/10 text-cos-signal"
      : status === "Failed"
      ? "bg-cos-ember/10 text-cos-ember"
      : status === "In Interview" || status === "Enriching" || status === "In Progress"
      ? "bg-cos-warm/10 text-cos-warm"
      : "bg-cos-slate/10 text-cos-slate";

  // Cache event analysis
  const cacheEvent = data.events.find((e) => e.stage === "cache_lookup");
  const cacheSource = cacheEvent?.metadata?.source as string | undefined;
  const cacheGaps = cacheEvent?.metadata?.gaps as string[] | undefined;
  const cacheSourceInfo = cacheSource ? CACHE_SOURCE_LABELS[cacheSource] : null;

  // Enrichment summary
  const enrichmentData = data.enrichmentData ?? {};
  const ed = enrichmentData as Record<string, unknown>;

  return (
    <div className="space-y-8">
      {/* Back nav */}
      <a
        href="/admin/onboarding"
        className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Onboarding
      </a>

      {/* Header */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
                {data.firmName ?? domain}
              </h1>
              <span
                className={`inline-flex items-center rounded-cos-pill px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}
              >
                {status}
              </span>
            </div>
            {data.domain && data.domain !== data.firmId && (
              <p className="mt-1 text-sm text-cos-slate">
                <Building2 className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
                {data.domain}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-cos-slate-light space-y-0.5">
            <p>
              Started:{" "}
              <span className="text-cos-slate">{fmtTs(data.firstEventAt)}</span>
            </p>
            <p>
              Last event:{" "}
              <span className="text-cos-slate">{fmtTs(data.lastEventAt)}</span>
            </p>
            {data.firmId && (
              <p className="font-mono text-[11px]">firmId: {data.firmId}</p>
            )}
          </div>
        </div>

        {/* Cache status banner */}
        {cacheEvent && (
          <div
            className={`flex items-start gap-3 rounded-cos-lg px-4 py-3 text-sm ${
              cacheEvent.event === "cache_hit_full"
                ? "bg-cos-signal/8 border border-cos-signal/20"
                : cacheEvent.event === "cache_hit_partial"
                ? "bg-cos-warm/8 border border-cos-warm/20"
                : "bg-cos-slate/8 border border-cos-border"
            }`}
          >
            <Zap
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                cacheEvent.event === "cache_hit_full"
                  ? "text-cos-signal"
                  : cacheEvent.event === "cache_hit_partial"
                  ? "text-cos-warm"
                  : "text-cos-slate"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${
                cacheEvent.event === "cache_hit_full"
                  ? "text-cos-signal"
                  : cacheEvent.event === "cache_hit_partial"
                  ? "text-cos-warm"
                  : "text-cos-slate"
              }`}>
                {cacheEvent.event === "cache_hit_full"
                  ? "Full Cache Hit — no paid API calls needed"
                  : cacheEvent.event === "cache_hit_partial"
                  ? "Partial Cache Hit — some data reused"
                  : "Cache Miss — full enrichment run"}
              </p>
              {cacheSourceInfo && (
                <p className="mt-0.5 text-xs text-cos-slate">
                  Source: <span className="font-medium text-cos-midnight">{cacheSourceInfo.label}</span>
                  <span className="ml-1 text-cos-slate-light">({cacheSourceInfo.sub})</span>
                </p>
              )}
              {cacheGaps && cacheGaps.length > 0 && (
                <p className="mt-0.5 text-xs text-cos-slate">
                  Still needed fresh:{" "}
                  {cacheGaps.map((g) => (
                    <span key={g} className="mr-1.5 font-mono text-[11px] rounded px-1.5 py-0.5 bg-cos-warm/15 text-cos-warm">
                      {g}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section 1: Event Timeline */}
      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-cos-midnight">
          Event Timeline
        </h2>
        <div className="relative space-y-2 pl-8">
          {/* Vertical line */}
          <div className="absolute left-3.5 top-2 bottom-2 w-px bg-cos-border" />

          {data.events.map((ev) => {
            const colors = STAGE_COLORS[ev.stage] ?? STAGE_COLORS.domain_submitted;
            const icon = STAGE_ICONS[ev.stage] ?? <Globe className="h-3.5 w-3.5" />;
            const label = ev.label ?? EVENT_LABELS[ev.event] ?? ev.event.replace(/_/g, " ");
            const isExpanded = expandedEventId === ev.id;
            const hasMetadata = ev.metadata && Object.keys(ev.metadata).length > 0;

            return (
              <div key={ev.id} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[22px] flex h-5 w-5 items-center justify-center rounded-full ${colors.bg} ${colors.text}`}
                >
                  {icon}
                </div>

                <div className="rounded-cos-lg border border-cos-border bg-cos-surface">
                  <div
                    className={`flex items-center gap-3 px-4 py-2.5 ${hasMetadata ? "cursor-pointer hover:bg-cos-electric/5" : ""}`}
                    onClick={() =>
                      hasMetadata &&
                      setExpandedEventId(isExpanded ? null : ev.id)
                    }
                  >
                    <span
                      className={`rounded-cos-pill px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}
                    >
                      {ev.stage}
                    </span>
                    <span className="flex-1 text-sm font-medium text-cos-midnight">
                      {label}
                    </span>
                    <span className="text-[11px] text-cos-slate-light">
                      {fmtTs(ev.createdAt)}
                    </span>
                    {hasMetadata &&
                      (isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-cos-slate" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-cos-slate" />
                      ))}
                  </div>
                  {isExpanded && hasMetadata && (
                    <div className="border-t border-cos-border px-4 py-3">
                      <pre className="overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight max-h-48">
                        {JSON.stringify(ev.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Enrichment Audit */}
      {data.enrichmentAudit.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-cos-midnight">
            Enrichment Pipeline
          </h2>

          {/* Phase tabs */}
          <div className="flex flex-wrap gap-1 rounded-cos-xl bg-cos-cloud-dim p-1 w-fit">
            <button
              onClick={() => setActiveEnrichTab("all")}
              className={`rounded-cos-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeEnrichTab === "all"
                  ? "bg-cos-surface text-cos-midnight shadow-sm"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              All ({data.enrichmentAudit.length})
            </button>
            {enrichmentPhases.map((phase) => (
              <button
                key={phase}
                onClick={() => setActiveEnrichTab(phase)}
                className={`rounded-cos-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                  activeEnrichTab === phase
                    ? "bg-cos-surface text-cos-midnight shadow-sm"
                    : "text-cos-slate hover:text-cos-midnight"
                }`}
              >
                {phase}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredAudit.map((entry, idx) => {
              const key = `${entry.phase}-${idx}`;
              const isExpanded = expandedPhase === key;
              const phaseColor = PHASE_COLORS[entry.phase] ?? "bg-cos-slate/10 text-cos-slate";
              return (
                <div key={key} className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
                  <button
                    onClick={() => setExpandedPhase(isExpanded ? null : key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cos-electric/5"
                  >
                    {entry.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cos-signal" />
                    ) : entry.status === "error" ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-cos-ember" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-cos-slate" />
                    )}
                    <span className={`rounded-cos-pill px-2 py-0.5 text-[11px] font-medium ${phaseColor}`}>
                      {entry.phase}
                    </span>
                    <span className="flex-1 truncate text-sm text-cos-midnight">
                      {entry.source}
                    </span>
                    {entry.model && (
                      <span className="font-mono text-[11px] text-cos-slate-light">
                        {entry.model}
                      </span>
                    )}
                    {entry.costUsd != null && (
                      <span className="flex items-center gap-0.5 text-xs text-cos-slate">
                        <DollarSign className="h-3 w-3" />
                        {entry.costUsd.toFixed(4)}
                      </span>
                    )}
                    {entry.durationMs != null && (
                      <span className="flex items-center gap-0.5 text-xs text-cos-slate-light">
                        <Clock className="h-3 w-3" />
                        {entry.durationMs}ms
                      </span>
                    )}
                    {entry.confidence != null && (
                      <span className="font-mono text-xs text-cos-slate">
                        {(entry.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-cos-slate" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-cos-slate" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-cos-border space-y-3 p-4">
                      {entry.errorMessage && (
                        <div className="rounded-cos-md bg-cos-ember/5 px-3 py-2 text-xs text-cos-ember">
                          {entry.errorMessage}
                        </div>
                      )}
                      {entry.extractedData != null && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                            Extracted Data
                          </p>
                          <pre className="max-h-56 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                            {JSON.stringify(entry.extractedData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 3: Interview Answers */}
      {data.partnerPreferences && (
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-cos-midnight">
            Interview Answers
          </h2>
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 space-y-4">
            <QARow
              label="Preferred Firm Types"
              values={data.partnerPreferences.preferredFirmTypes}
            />
            <QARow
              label="Preferred Size Bands"
              values={data.partnerPreferences.preferredSizeBands}
            />
            <QARow
              label="Preferred Industries"
              values={data.partnerPreferences.preferredIndustries}
            />
            <QARow
              label="Preferred Markets"
              values={data.partnerPreferences.preferredMarkets}
            />
            <QARow
              label="Partnership Models"
              values={data.partnerPreferences.partnershipModels}
            />
            <QARow
              label="Deal Breakers"
              values={data.partnerPreferences.dealBreakers}
            />
            {data.partnerPreferences.growthGoals && (
              <div>
                <p className="text-xs font-semibold text-cos-slate mb-1">Growth Goals</p>
                <p className="text-sm text-cos-midnight">
                  {data.partnerPreferences.growthGoals}
                </p>
              </div>
            )}
            {data.partnerPreferences.rawOnboardingData && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Raw Q&A Data
                </p>
                <pre className="max-h-56 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                  {JSON.stringify(data.partnerPreferences.rawOnboardingData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 4: Current Firm Profile */}
      {data.enrichmentData && Object.keys(data.enrichmentData).length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-cos-midnight">
            Current Firm Profile
          </h2>
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 space-y-4">
            {typeof ed.about === "string" && ed.about && (
              <div>
                <p className="text-xs font-semibold text-cos-slate mb-1">About</p>
                <p className="text-sm text-cos-midnight">{ed.about}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ArrayField label="Categories" values={ed.categories as string[] | undefined} />
              <ArrayField label="Services" values={ed.services as string[] | undefined} />
              <ArrayField label="Skills" values={ed.skills as string[] | undefined} />
              <ArrayField label="Industries" values={ed.industries as string[] | undefined} />
              <ArrayField label="Markets" values={ed.markets as string[] | undefined} />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Full Enrichment JSON
              </p>
              <pre className="max-h-56 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                {JSON.stringify(data.enrichmentData, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function QARow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-cos-slate mb-1">{label}</p>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="rounded-cos-pill bg-cos-electric/8 px-2.5 py-0.5 text-xs font-medium text-cos-midnight"
            >
              {v}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-cos-slate-light italic">Not answered</span>
      )}
    </div>
  );
}

function ArrayField({
  label,
  values,
}: {
  label: string;
  values: string[] | undefined;
}) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-cos-slate mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {values.slice(0, 6).map((v) => (
          <span
            key={v}
            className="rounded-cos-pill bg-cos-cloud-dim px-2 py-0.5 text-[11px] text-cos-midnight"
          >
            {v}
          </span>
        ))}
        {values.length > 6 && (
          <span className="text-[11px] text-cos-slate-light">+{values.length - 6}</span>
        )}
      </div>
    </div>
  );
}
