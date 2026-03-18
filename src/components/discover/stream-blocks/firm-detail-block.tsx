"use client";

import { useState } from "react";
import {
  Building2,
  Globe,
  ExternalLink,
  Linkedin,
  Users,
  User,
  BookOpen,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FirmDetailData } from "@/hooks/use-discover-stream";

// ─── Types ────────────────────────────────────────────────

type TabId = "overview" | "case_studies" | "experts" | "services";

interface FirmDetailBlockProps {
  data: FirmDetailData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onViewExpert?: (legacyId: string, displayName: string) => void;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────

export function FirmDetailBlock({
  data,
  loading,
  error,
  searchQuery,
  onViewExpert,
  onClose,
}: FirmDetailBlockProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (loading) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white p-6 shadow-sm">
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-cos-lg bg-cos-cloud" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-cos-cloud" />
              <div className="h-3 w-32 rounded bg-cos-cloud" />
            </div>
          </div>
          <div className="h-20 rounded-cos-xl bg-cos-cloud/60" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-cos-cloud" />
            <div className="h-6 w-20 rounded-full bg-cos-cloud" />
            <div className="h-6 w-14 rounded-full bg-cos-cloud" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-slide-up rounded-cos-2xl border border-cos-ember/20 bg-cos-ember/5 p-6 text-center">
        <p className="text-sm text-cos-ember">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "case_studies", label: "Case Studies", count: data.caseStudies.length },
    { id: "experts", label: "Experts", count: data.experts.length },
    { id: "services", label: "Details" },
  ];

  return (
    <div className="animate-slide-up rounded-cos-2xl border border-cos-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-cos-border/50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
          <Building2 className="h-5 w-5 text-cos-electric" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold text-cos-midnight truncate">
            {data.name}
          </h3>
          <p className="text-xs text-cos-slate truncate">
            {data.categories.slice(0, 3).join(" · ") || "Professional Services"}
            {data.sizeBand && ` · ${data.sizeBand.replace(/_/g, " ")}`}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="shrink-0 text-cos-slate hover:text-cos-midnight p-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-cos-border/50 px-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-cos-electric"
                : "text-cos-slate hover:text-cos-midnight"
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">{tab.count}</span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cos-electric rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto cos-scrollbar">
        {activeTab === "overview" && (
          <OverviewTab data={data} searchQuery={searchQuery} onViewExpert={onViewExpert} />
        )}
        {activeTab === "case_studies" && (
          <CaseStudiesTab caseStudies={data.caseStudies} />
        )}
        {activeTab === "experts" && (
          <ExpertsTab experts={data.experts} onViewExpert={onViewExpert} />
        )}
        {activeTab === "services" && (
          <DetailsTab data={data} />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────

function OverviewTab({
  data,
  searchQuery,
  onViewExpert,
}: {
  data: FirmDetailData;
  searchQuery: string;
  onViewExpert?: (legacyId: string, displayName: string) => void;
}) {
  return (
    <>
      {/* Description */}
      {data.description && (
        <p className="text-sm text-cos-midnight/80 leading-relaxed">
          {data.description}
        </p>
      )}

      {/* Quick facts */}
      <div className="flex flex-wrap gap-2">
        {data.website && (
          <a
            href={data.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-electric hover:text-cos-electric transition-colors"
          >
            <Globe className="h-3 w-3" />
            {(() => { try { return new URL(data.website).hostname; } catch { return data.website; } })()}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {data.linkedinUrl && (
          <a
            href={data.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-electric hover:text-cos-electric transition-colors"
          >
            <Linkedin className="h-3 w-3" />
            LinkedIn
          </a>
        )}
        {data.sizeBand && (
          <span className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate">
            <Users className="h-3 w-3" />
            {data.sizeBand.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Highlights: top experts, case studies */}
      {data.experts.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
            Key Experts
          </p>
          <div className="space-y-1.5">
            {data.experts.slice(0, 3).map((exp) => (
              <button
                key={exp.legacyId}
                onClick={() => onViewExpert?.(exp.legacyId, exp.displayName)}
                className="flex w-full items-center gap-2 rounded-cos-xl border border-cos-border px-3 py-2 text-left hover:border-cos-warm/40 hover:bg-cos-warm/5 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full bg-cos-warm/10">
                  <User className="h-3.5 w-3.5 text-cos-warm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-cos-midnight">
                    {exp.displayName}
                  </p>
                  {exp.title && (
                    <p className="truncate text-[10px] italic text-cos-slate">{exp.title}</p>
                  )}
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
              </button>
            ))}
          </div>
        </div>
      )}

      {data.caseStudies.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
            Recent Case Studies
          </p>
          <div className="space-y-1.5">
            {data.caseStudies.slice(0, 2).map((cs, i) => (
              <div key={cs.legacyId ?? i} className="rounded-cos-xl border border-cos-border p-3">
                {cs.summary ? (
                  <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-2">
                    {cs.summary}
                  </p>
                ) : (
                  <p className="text-xs italic text-cos-slate">No summary</p>
                )}
                {(cs.skills.length > 0 || cs.industries.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {cs.skills.slice(0, 3).map((s) => (
                      <span key={s} className="rounded-cos-full bg-cos-cloud px-1.5 py-0.5 text-[10px] text-cos-slate">
                        {s}
                      </span>
                    ))}
                    {cs.industries.slice(0, 2).map((ind) => (
                      <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-1.5 py-0.5 text-[10px] text-cos-warm">
                        {ind}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills preview */}
      {data.skills.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.skills.slice(0, 10).map((s) => (
              <span key={s} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">
                {s}
              </span>
            ))}
            {data.skills.length > 10 && (
              <span className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate-light">
                +{data.skills.length - 10}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Case Studies Tab ─────────────────────────────────────

function CaseStudiesTab({
  caseStudies,
}: {
  caseStudies: FirmDetailData["caseStudies"];
}) {
  if (caseStudies.length === 0) {
    return <p className="text-sm italic text-cos-slate py-4 text-center">No case studies available.</p>;
  }

  return (
    <div className="space-y-2">
      {caseStudies.map((cs, i) => (
        <div key={cs.legacyId ?? i} className="rounded-cos-xl border border-cos-border p-3">
          {cs.summary ? (
            <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-3">
              {cs.summary}
            </p>
          ) : (
            <p className="text-xs italic text-cos-slate">No summary</p>
          )}
          {(cs.skills.length > 0 || cs.industries.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cs.skills.slice(0, 4).map((s) => (
                <span key={s} className="rounded-cos-full bg-cos-cloud px-1.5 py-0.5 text-[10px] text-cos-slate">
                  {s}
                </span>
              ))}
              {cs.industries.slice(0, 3).map((ind) => (
                <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-1.5 py-0.5 text-[10px] text-cos-warm">
                  {ind}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Experts Tab ──────────────────────────────────────────

function ExpertsTab({
  experts,
  onViewExpert,
}: {
  experts: FirmDetailData["experts"];
  onViewExpert?: (legacyId: string, displayName: string) => void;
}) {
  if (experts.length === 0) {
    return <p className="text-sm italic text-cos-slate py-4 text-center">No experts listed.</p>;
  }

  return (
    <div className="space-y-1.5">
      {experts.map((exp) => (
        <button
          key={exp.legacyId}
          onClick={() => onViewExpert?.(exp.legacyId, exp.displayName)}
          className="flex w-full items-center gap-2 rounded-cos-xl border border-cos-border px-3 py-2 text-left hover:border-cos-warm/40 hover:bg-cos-warm/5 transition-colors"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full bg-cos-warm/10">
            <User className="h-3.5 w-3.5 text-cos-warm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-cos-midnight">
              {exp.displayName}
            </p>
            {exp.title && (
              <p className="truncate text-[10px] italic text-cos-slate">{exp.title}</p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
        </button>
      ))}
    </div>
  );
}

// ─── Details Tab ──────────────────────────────────────────

function DetailsTab({ data }: { data: FirmDetailData }) {
  return (
    <>
      {data.categories.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Categories</p>
          <div className="flex flex-wrap gap-1.5">
            {data.categories.map((c) => (
              <span key={c} className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{c}</span>
            ))}
          </div>
        </div>
      )}
      {data.skills.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((s) => (
              <span key={s} className="rounded-cos-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">{s}</span>
            ))}
          </div>
        </div>
      )}
      {data.industries.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Industries</p>
          <div className="flex flex-wrap gap-1.5">
            {data.industries.map((ind) => (
              <span key={ind} className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-xs text-cos-warm">{ind}</span>
            ))}
          </div>
        </div>
      )}
      {data.markets.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">Markets</p>
          <div className="flex flex-wrap gap-1.5">
            {data.markets.map((m) => (
              <span key={m} className="rounded-cos-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{m}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
