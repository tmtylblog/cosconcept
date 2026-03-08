"use client";

import { FileText, Building2 } from "lucide-react";

interface CaseStudyResult {
  title: string;
  firmName: string;
  clientName?: string | null;
  skills: string[];
  industries: string[];
  summary: string;
}

function Pill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "industry" }) {
  const base = "inline-block rounded-cos-pill px-2 py-0.5 text-[10px] font-medium";
  const styles =
    variant === "industry"
      ? `${base} bg-cos-warm/10 text-cos-warm`
      : `${base} bg-cos-surface-raised text-cos-slate`;

  return <span className={styles}>{children}</span>;
}

export function CaseStudyCard({ study }: { study: CaseStudyResult }) {
  // Strip HTML tags from summary
  const cleanSummary = study.summary
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .trim();

  return (
    <div className="rounded-cos-lg border border-cos-border/50 bg-white p-3 transition-colors hover:border-cos-electric/30">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-md bg-cos-electric/10">
          <FileText className="h-3.5 w-3.5 text-cos-electric" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold leading-snug text-cos-midnight">
            {study.title}
          </h4>

          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cos-slate">
            <Building2 className="h-3 w-3" />
            <span className="font-medium">{study.firmName}</span>
            {study.clientName && (
              <>
                <span className="text-cos-slate-light">for</span>
                <span>{study.clientName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {cleanSummary && (
        <p className="mt-1.5 text-xs leading-relaxed text-cos-slate">
          {cleanSummary.slice(0, 150)}
          {cleanSummary.length > 150 ? "..." : ""}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {study.industries.slice(0, 2).map((ind) => (
          <Pill key={ind} variant="industry">{ind}</Pill>
        ))}
        {study.skills.slice(0, 3).map((skill) => (
          <Pill key={skill}>{skill}</Pill>
        ))}
      </div>
    </div>
  );
}

export function CaseStudyResultList({
  results,
}: {
  results: {
    caseStudies: CaseStudyResult[];
    totalFound: number;
    error?: string;
  };
}) {
  if (results.error) {
    return (
      <div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
        <p className="text-xs text-cos-slate">{results.error}</p>
      </div>
    );
  }

  if (!results.caseStudies || results.caseStudies.length === 0) {
    return (
      <div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
        <p className="text-xs text-cos-slate">No matching case studies found. Try different search terms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.caseStudies.map((study, i) => (
        <CaseStudyCard key={`${study.title}-${i}`} study={study} />
      ))}
    </div>
  );
}
