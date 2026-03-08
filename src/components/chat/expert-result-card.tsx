"use client";

import { Linkedin, UserCircle } from "lucide-react";

interface ExpertResult {
  name: string;
  title: string;
  firmName: string;
  skills: string[];
  linkedinUrl?: string | null;
  city?: string | null;
  country?: string | null;
  expertClassification?: string | null;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-cos-pill bg-cos-surface-raised px-2 py-0.5 text-[10px] font-medium text-cos-slate">
      {children}
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: string }) {
  const colors: Record<string, string> = {
    specialist: "bg-purple-100 text-purple-700",
    expert: "bg-cos-signal/15 text-cos-signal",
    practitioner: "bg-cos-electric/15 text-cos-electric",
    generalist: "bg-cos-warm/15 text-cos-warm",
  };

  const color = colors[classification.toLowerCase()] ?? "bg-gray-100 text-gray-600";

  return (
    <span className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {classification}
    </span>
  );
}

export function ExpertResultCard({ expert }: { expert: ExpertResult }) {
  const location = [expert.city, expert.country].filter(Boolean).join(", ");

  return (
    <div className="flex items-start gap-2.5 rounded-cos-lg border border-cos-border/50 bg-white p-3 transition-colors hover:border-cos-electric/30">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-full bg-cos-surface-raised">
        <UserCircle className="h-5 w-5 text-cos-slate" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-cos-midnight">
            {expert.name}
          </h4>
          {expert.expertClassification && (
            <ClassificationBadge classification={expert.expertClassification} />
          )}
          {expert.linkedinUrl && (
            <a
              href={expert.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-cos-slate hover:text-[#0077B5]"
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {(expert.title || expert.firmName) && (
          <p className="mt-0.5 text-xs text-cos-slate">
            {expert.title}
            {expert.title && expert.firmName ? " at " : ""}
            {expert.firmName && (
              <span className="font-medium text-cos-midnight">{expert.firmName}</span>
            )}
          </p>
        )}

        {location && (
          <p className="text-[10px] text-cos-slate-light">{location}</p>
        )}

        {expert.skills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {expert.skills.slice(0, 4).map((skill) => (
              <Pill key={skill}>{skill}</Pill>
            ))}
            {expert.skills.length > 4 && (
              <Pill>+{expert.skills.length - 4}</Pill>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpertResultList({
  results,
}: {
  results: {
    experts: ExpertResult[];
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

  if (!results.experts || results.experts.length === 0) {
    return (
      <div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
        <p className="text-xs text-cos-slate">No matching experts found. Try different keywords.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.experts.map((expert, i) => (
        <ExpertResultCard key={`${expert.name}-${i}`} expert={expert} />
      ))}
    </div>
  );
}
