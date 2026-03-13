"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Globe,
  Youtube,
  Video,
  Layout,
  FileText,
} from "lucide-react";
import {
  classifySourceUrl,
  getSourceTypeLabel,
  type CaseStudySourceType,
} from "@/lib/enrichment/source-classifier";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────

interface CaseStudyAnalysis {
  title?: string;
  clientName?: string;
  clientIndustry?: string;
  projectDuration?: string;
  teamSize?: string;
  challenge?: string;
  solution?: string;
  approach?: string;
  outcomes?: string[];
  metrics?: Array<{ value: string; label: string; improvement?: string }>;
  confidence?: number;
  evidenceStrength?: string;
  evidenceReasoning?: string;
}

interface CaseStudyAutoTags {
  skills?: string[];
  industries?: string[];
  services?: string[];
  markets?: string[];
  languages?: string[];
  clientName?: string | null;
}

interface CaseStudyRow {
  id: string;
  sourceUrl: string;
  sourceType: string;
  status: string;
  statusMessage: string | null;
  title: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  previewImageUrl: string | null;
  autoTags: CaseStudyAutoTags | null;
  cosAnalysis: CaseStudyAnalysis | null;
  isHidden: boolean;
  createdAt: Date;
  ingestedAt: Date | null;
}

// ─── Component ────────────────────────────────────────────

export function CaseStudyDetailView({ caseStudy }: { caseStudy: CaseStudyRow }) {
  const analysis = caseStudy.cosAnalysis as CaseStudyAnalysis | null;
  const autoTags = caseStudy.autoTags as CaseStudyAutoTags | null;

  // Resolve source type
  const sourceType: CaseStudySourceType = (() => {
    if (
      caseStudy.sourceType === "pdf_upload" ||
      caseStudy.sourceType === "pdf" ||
      caseStudy.sourceType === "pdf_url"
    )
      return "pdf_upload";
    if (caseStudy.sourceUrl.startsWith("uploaded:")) return "pdf_upload";
    if (caseStudy.sourceType === "youtube") return "youtube";
    if (caseStudy.sourceType === "vimeo") return "vimeo";
    if (caseStudy.sourceType === "google_slides") return "google_slides";
    if (caseStudy.sourceType === "powerpoint_online") return "powerpoint_online";
    try {
      return classifySourceUrl(caseStudy.sourceUrl);
    } catch {
      return "url";
    }
  })();

  const sourceTypeLabel = getSourceTypeLabel(sourceType);

  // Preview: prefer previewImageUrl (device mockup), fall back to thumbnailUrl
  const previewUrl = caseStudy.previewImageUrl ?? caseStudy.thumbnailUrl;

  // Display title hierarchy
  const displayTitle =
    analysis?.title ?? caseStudy.title ?? "Untitled Case Study";

  // Is the source a real external URL?
  const hasExternalLink =
    !caseStudy.sourceUrl.startsWith("uploaded:") &&
    !caseStudy.sourceUrl.startsWith("manual:");

  return (
    <div className="min-h-screen bg-cos-cloud">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-cos-border bg-white/90 px-6 py-3 backdrop-blur-sm">
        <Link
          href="/firm/experience"
          className="flex items-center gap-1.5 text-sm text-cos-slate transition-colors hover:text-cos-midnight"
        >
          <ArrowLeft className="h-4 w-4" />
          Experience
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-cos-slate-light" />
        <span className="max-w-xs truncate text-sm text-cos-midnight">
          {displayTitle}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Source type badge */}
          <SourceBadge type={sourceType} label={sourceTypeLabel} />

          {/* Open original link */}
          {hasExternalLink && (
            <a
              href={caseStudy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-cos-electric transition-colors hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View original
            </a>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Title */}
        <h1 className="mb-1 font-heading text-2xl font-bold text-cos-midnight">
          {displayTitle}
        </h1>

        {/* Meta row */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-cos-slate">
          {(analysis?.clientName ?? autoTags?.clientName) && (
            <span className="font-medium text-cos-warm">
              {analysis?.clientName ?? autoTags?.clientName}
            </span>
          )}
          {analysis?.clientIndustry && (
            <>
              <span>·</span>
              <span>{analysis.clientIndustry}</span>
            </>
          )}
          {analysis?.projectDuration && (
            <>
              <span>·</span>
              <span>{analysis.projectDuration}</span>
            </>
          )}
          {analysis?.teamSize && (
            <>
              <span>·</span>
              <span>{analysis.teamSize}</span>
            </>
          )}
        </div>

        {/* Two-column: preview left (2/5), narrative right (3/5) */}
        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Preview — 2/5 */}
          <div className="lg:col-span-2">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-cos-xl border border-cos-border bg-cos-cloud-dim shadow-sm">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={displayTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <SourcePlaceholder sourceType={sourceType} />
              )}
            </div>
          </div>

          {/* Narrative — 3/5 */}
          <div className="space-y-4 lg:col-span-3">
            {analysis?.challenge && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                  Challenge
                </h3>
                <p className="text-sm leading-relaxed text-cos-midnight">
                  {analysis.challenge}
                </p>
              </div>
            )}
            {analysis?.solution && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                  Solution
                </h3>
                <p className="text-sm leading-relaxed text-cos-midnight">
                  {analysis.solution}
                </p>
              </div>
            )}
            {analysis?.approach && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                  Approach
                </h3>
                <p className="text-sm leading-relaxed text-cos-midnight">
                  {analysis.approach}
                </p>
              </div>
            )}

            {/* Fallback: show summary if no structured analysis */}
            {!analysis?.challenge && !analysis?.solution && !analysis?.approach && caseStudy.summary && (
              <p className="text-sm leading-relaxed text-cos-midnight">
                {caseStudy.summary}
              </p>
            )}
          </div>
        </div>

        {/* Outcomes */}
        {(analysis?.outcomes?.length ?? 0) > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-heading text-base font-semibold text-cos-midnight">
              Outcomes
            </h2>
            <ul className="space-y-2">
              {analysis!.outcomes!.map((outcome, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-cos-midnight">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cos-signal" />
                  {outcome}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Metrics */}
        {(analysis?.metrics?.length ?? 0) > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-heading text-base font-semibold text-cos-midnight">
              Key Metrics
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {analysis!.metrics!.map((metric, i) => (
                <div
                  key={i}
                  className="rounded-cos-xl border border-cos-border bg-white p-4 text-center"
                >
                  <div className="text-2xl font-bold text-cos-electric">
                    {metric.value}
                  </div>
                  <div className="mt-0.5 text-xs text-cos-slate">{metric.label}</div>
                  {metric.improvement && (
                    <div className="mt-0.5 text-[10px] text-cos-signal">
                      {metric.improvement}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Capabilities Demonstrated */}
        {(autoTags?.skills?.length || autoTags?.services?.length || autoTags?.industries?.length) ? (
          <section className="mb-8">
            <h2 className="mb-3 font-heading text-base font-semibold text-cos-midnight">
              Capabilities Demonstrated
            </h2>
            <div className="space-y-3">
              {(autoTags?.skills?.length ?? 0) > 0 && (
                <div>
                  <span className="mr-2 text-xs font-medium uppercase tracking-wide text-cos-slate-dim">
                    Skills
                  </span>
                  <div className="mt-1 inline-flex flex-wrap gap-1">
                    {autoTags!.skills!.map((s) => (
                      <span
                        key={s}
                        className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] text-cos-electric"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(autoTags?.services?.length ?? 0) > 0 && (
                <div>
                  <span className="mr-2 text-xs font-medium uppercase tracking-wide text-cos-slate-dim">
                    Services
                  </span>
                  <div className="mt-1 inline-flex flex-wrap gap-1">
                    {autoTags!.services!.map((s) => (
                      <span
                        key={s}
                        className="rounded-cos-pill bg-cos-midnight/8 px-2 py-0.5 text-[11px] text-cos-midnight/70"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(autoTags?.industries?.length ?? 0) > 0 && (
                <div>
                  <span className="mr-2 text-xs font-medium uppercase tracking-wide text-cos-slate-dim">
                    Industries
                  </span>
                  <div className="mt-1 inline-flex flex-wrap gap-1">
                    {autoTags!.industries!.map((ind) => (
                      <span
                        key={ind}
                        className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[11px] text-cos-signal"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Evidence Quality */}
        {analysis?.confidence !== undefined && (
          <section className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                Evidence Quality
              </h3>
              <EvidenceBadge confidence={analysis.confidence} />
            </div>
            <p className="text-xs leading-relaxed text-cos-slate">
              {analysis.evidenceReasoning ??
                (analysis.confidence >= 0.8
                  ? "Strong evidence of capability with specific, verifiable outcomes."
                  : analysis.confidence >= 0.5
                    ? "Moderate evidence with partial detail — adding more specifics to the source will improve match quality."
                    : "Limited evidence — consider adding measurable outcomes and client context to the original source.")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────

function SourceBadge({ type, label }: { type: CaseStudySourceType; label: string }) {
  const styles: Record<CaseStudySourceType, string> = {
    youtube: "bg-red-50 text-red-600",
    vimeo: "bg-blue-50 text-blue-600",
    google_slides: "bg-green-50 text-green-600",
    powerpoint_online: "bg-orange-50 text-orange-600",
    pdf_upload: "bg-cos-ember/10 text-cos-ember",
    url: "bg-cos-electric/10 text-cos-electric",
  };
  return (
    <span
      className={cn(
        "rounded-cos-pill px-2.5 py-0.5 text-[11px] font-medium",
        styles[type]
      )}
    >
      {label}
    </span>
  );
}

function SourcePlaceholder({ sourceType }: { sourceType: CaseStudySourceType }) {
  switch (sourceType) {
    case "youtube":
      return <Youtube className="h-12 w-12 text-red-400" />;
    case "vimeo":
      return <Video className="h-12 w-12 text-blue-400" />;
    case "google_slides":
      return <Layout className="h-12 w-12 text-green-400" />;
    case "powerpoint_online":
      return <FileText className="h-12 w-12 text-orange-400" />;
    case "pdf_upload":
      return <FileText className="h-12 w-12 text-cos-ember/60" />;
    default:
      return <Globe className="h-12 w-12 text-cos-slate-light" />;
  }
}

function EvidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-[11px] font-medium text-cos-signal">
        ● Strong
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-[11px] font-medium text-cos-warm">
        ● Moderate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-slate-light/20 px-2.5 py-0.5 text-[11px] font-medium text-cos-slate">
      ● Weak
    </span>
  );
}
