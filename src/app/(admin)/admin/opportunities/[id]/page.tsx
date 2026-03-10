"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Lightbulb,
  Zap,
  Radio,
  FileText,
  Building2,
  Calendar,
  Tag,
  DollarSign,
  Clock,
  Globe,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface OppDetail {
  id: string;
  title: string;
  description: string | null;
  evidence: string | null;
  signalType: string;
  priority: string;
  resolutionApproach: string;
  requiredCategories: string[] | null;
  requiredSkills: string[] | null;
  requiredIndustries: string[] | null;
  requiredMarkets: string[] | null;
  estimatedValue: string | null;
  timeline: string | null;
  clientDomain: string | null;
  clientName: string | null;
  anonymizeClient: boolean;
  clientSizeBand: string | null;
  source: string;
  sourceId: string | null;
  attachments: { name: string; url?: string }[] | null;
  status: string;
  createdAt: string;
  firmId: string | null;
  firmName: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  transcriptPreview: string | null;
}

function priorityColor(p: string) {
  if (p === "high") return "bg-red-100 text-red-700";
  if (p === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function statusColor(s: string) {
  switch (s) {
    case "new": return "bg-blue-100 text-blue-700";
    case "in_review": return "bg-amber-100 text-amber-700";
    case "actioned": return "bg-green-100 text-green-700";
    case "dismissed": return "bg-slate-100 text-slate-500";
    default: return "bg-slate-100 text-slate-600";
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--cos-border)] bg-white p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--cos-text-muted)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--cos-border)] bg-slate-50 px-2.5 py-0.5 text-xs text-[var(--cos-text-secondary)]">
      {label}
    </span>
  );
}

function TranscriptBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > 400 && !expanded;
  return (
    <div>
      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--cos-text-secondary)]">
        {truncated ? text.slice(0, 400) + "…" : text}
      </pre>
      {text.length > 400 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--cos-primary)] hover:underline"
        >
          {expanded ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Collapse" : "Show full transcript excerpt"}
        </button>
      )}
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [opp, setOpp] = useState<OppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/opportunities/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setOpp(data); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--cos-text-muted)]">
        Loading…
      </div>
    );
  }

  if (notFound || !opp) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--cos-text-muted)]">Opportunity not found.</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-[var(--cos-primary)] hover:underline">
          ← Back
        </button>
      </div>
    );
  }

  const sizeBandLabel: Record<string, string> = {
    individual: "Individual",
    micro_1_10: "Micro (1–10)",
    small_11_50: "Small (11–50)",
    emerging_51_200: "Emerging (51–200)",
    mid_201_500: "Mid (201–500)",
    upper_mid_501_1000: "Upper Mid (501–1K)",
    large_1001_5000: "Large (1K–5K)",
    major_5001_10000: "Major (5K–10K)",
    global_10000_plus: "Global (10K+)",
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Back + header */}
      <div>
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1.5 text-sm text-[var(--cos-text-muted)] hover:text-[var(--cos-text-primary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Opportunities
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-[var(--cos-primary)]/10 p-2">
              <Lightbulb className="h-5 w-5 text-[var(--cos-primary)]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">{opp.title}</h1>
              <p className="mt-1 text-sm text-[var(--cos-text-muted)]">
                {opp.firmName ?? "Unknown firm"} · {new Date(opp.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColor(opp.priority)}`}>
              {opp.priority} priority
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(opp.status)}`}>
              {opp.status.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-5">
        {/* Left: main content */}
        <div className="col-span-2 space-y-5">
          {/* Description */}
          {opp.description && (
            <Section title="Description">
              <p className="text-sm leading-relaxed text-[var(--cos-text-secondary)]">{opp.description}</p>
            </Section>
          )}

          {/* Evidence */}
          {opp.evidence && (
            <Section title="Evidence Signal">
              <div className="flex items-start gap-2">
                {opp.signalType === "latent"
                  ? <Radio className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  : <Zap className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />}
                <blockquote className="text-sm italic leading-relaxed text-[var(--cos-text-secondary)]">
                  "{opp.evidence}"
                </blockquote>
              </div>
              <p className="mt-2 text-xs text-[var(--cos-text-muted)]">
                Signal type: <span className="capitalize font-medium">{opp.signalType}</span>
              </p>
            </Section>
          )}

          {/* Required profile */}
          <Section title="Partner Requirements">
            <div className="space-y-4">
              {opp.requiredCategories && opp.requiredCategories.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--cos-text-muted)]">Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opp.requiredCategories.map((c) => <Pill key={c} label={c} />)}
                  </div>
                </div>
              )}
              {opp.requiredSkills && opp.requiredSkills.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--cos-text-muted)]">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opp.requiredSkills.map((s) => <Pill key={s} label={s} />)}
                  </div>
                </div>
              )}
              {opp.requiredIndustries && opp.requiredIndustries.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--cos-text-muted)]">Industries</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opp.requiredIndustries.map((i) => <Pill key={i} label={i} />)}
                  </div>
                </div>
              )}
              {opp.requiredMarkets && opp.requiredMarkets.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--cos-text-muted)]">Markets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opp.requiredMarkets.map((m) => <Pill key={m} label={m} />)}
                  </div>
                </div>
              )}
              {(!opp.requiredCategories?.length && !opp.requiredSkills?.length && !opp.requiredIndustries?.length) && (
                <p className="text-sm text-[var(--cos-text-muted)]">No requirements extracted.</p>
              )}
            </div>
          </Section>

          {/* Source transcript */}
          {opp.transcriptPreview && (
            <Section title="Source Transcript Excerpt">
              <TranscriptBlock text={opp.transcriptPreview} />
              {opp.sourceId && (
                <a
                  href={`/admin/calls`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--cos-primary)] hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  View in Call Transcripts
                </a>
              )}
            </Section>
          )}
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          {/* Quick facts */}
          <Section title="Details">
            <dl className="space-y-3 text-sm">
              {opp.estimatedValue && (
                <div className="flex items-start gap-2">
                  <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                  <div>
                    <dt className="text-xs text-[var(--cos-text-muted)]">Estimated value</dt>
                    <dd className="font-medium text-[var(--cos-text-primary)]">{opp.estimatedValue}</dd>
                  </div>
                </div>
              )}
              {opp.timeline && (
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                  <div>
                    <dt className="text-xs text-[var(--cos-text-muted)]">Timeline</dt>
                    <dd className="font-medium text-[var(--cos-text-primary)]">{opp.timeline}</dd>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                <div>
                  <dt className="text-xs text-[var(--cos-text-muted)]">Resolution approach</dt>
                  <dd className="font-medium capitalize text-[var(--cos-text-primary)]">{opp.resolutionApproach}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                <div>
                  <dt className="text-xs text-[var(--cos-text-muted)]">Source</dt>
                  <dd className="font-medium capitalize text-[var(--cos-text-primary)]">{opp.source}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                <div>
                  <dt className="text-xs text-[var(--cos-text-muted)]">Created</dt>
                  <dd className="font-medium text-[var(--cos-text-primary)]">
                    {new Date(opp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </dd>
                </div>
              </div>
            </dl>
          </Section>

          {/* Client */}
          <Section title="Client">
            {opp.anonymizeClient ? (
              <p className="text-sm italic text-[var(--cos-text-muted)]">Client anonymized</p>
            ) : (
              <dl className="space-y-3 text-sm">
                {opp.clientName && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                    <div>
                      <dt className="text-xs text-[var(--cos-text-muted)]">Company</dt>
                      <dd className="font-medium text-[var(--cos-text-primary)]">{opp.clientName}</dd>
                    </div>
                  </div>
                )}
                {opp.clientDomain && (
                  <div className="flex items-start gap-2">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cos-text-muted)]" />
                    <div>
                      <dt className="text-xs text-[var(--cos-text-muted)]">Domain</dt>
                      <dd className="font-medium text-[var(--cos-text-primary)]">{opp.clientDomain}</dd>
                    </div>
                  </div>
                )}
                {opp.clientSizeBand && (
                  <div>
                    <dt className="text-xs text-[var(--cos-text-muted)]">Size</dt>
                    <dd className="mt-0.5 font-medium text-[var(--cos-text-primary)]">
                      {sizeBandLabel[opp.clientSizeBand] ?? opp.clientSizeBand}
                    </dd>
                  </div>
                )}
                {!opp.clientName && !opp.clientDomain && !opp.clientSizeBand && (
                  <p className="text-sm text-[var(--cos-text-muted)]">No client info recorded.</p>
                )}
              </dl>
            )}
          </Section>

          {/* Firm + creator */}
          <Section title="Firm">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--cos-text-muted)]">Firm</dt>
                <dd className="font-medium text-[var(--cos-text-primary)]">{opp.firmName ?? "—"}</dd>
              </div>
              {opp.createdByName && (
                <div>
                  <dt className="text-xs text-[var(--cos-text-muted)]">Created by</dt>
                  <dd className="font-medium text-[var(--cos-text-primary)]">{opp.createdByName}</dd>
                  {opp.createdByEmail && (
                    <dd className="text-xs text-[var(--cos-text-muted)]">{opp.createdByEmail}</dd>
                  )}
                </div>
              )}
            </dl>
          </Section>

          {/* Attachments */}
          {opp.attachments && opp.attachments.length > 0 && (
            <Section title="Attachments">
              <ul className="space-y-1.5">
                {opp.attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-[var(--cos-primary)] hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      <span className="text-[var(--cos-text-secondary)]">{a.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
