"use client";

import { ExternalLink, TrendingUp } from "lucide-react";

interface FirmResult {
  firmName: string;
  firmId: string;
  matchScore: number;
  explanation: string;
  categories: string[];
  skills: string[];
  industries: string[];
  website?: string;
  employeeCount?: number;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-cos-signal/15 text-cos-signal"
      : score >= 60
        ? "bg-cos-electric/15 text-cos-electric"
        : "bg-cos-warm/15 text-cos-warm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${color}`}
    >
      <TrendingUp className="h-3 w-3" />
      {score}%
    </span>
  );
}

function Pill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "accent" }) {
  const base = "inline-block rounded-cos-pill px-2 py-0.5 text-[10px] font-medium";
  const styles =
    variant === "accent"
      ? `${base} bg-cos-electric/10 text-cos-electric`
      : `${base} bg-cos-surface-raised text-cos-slate`;

  return <span className={styles}>{children}</span>;
}

export function FirmResultCard({ firm }: { firm: FirmResult }) {
  return (
    <div className="rounded-cos-lg border border-cos-border/50 bg-white p-3 transition-colors hover:border-cos-electric/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-cos-midnight">
              {firm.firmName}
            </h4>
            <ScoreBadge score={firm.matchScore} />
          </div>

          {firm.categories.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {firm.categories.slice(0, 2).map((cat) => (
                <Pill key={cat} variant="accent">{cat}</Pill>
              ))}
            </div>
          )}
        </div>

        {firm.website && (
          <a
            href={`https://${firm.website.replace(/^https?:\/\//, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-cos-slate hover:text-cos-electric"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {firm.explanation && (
        <p className="mt-1.5 text-xs leading-relaxed text-cos-slate">
          {firm.explanation}
        </p>
      )}

      {firm.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {firm.skills.slice(0, 4).map((skill) => (
            <Pill key={skill}>{skill}</Pill>
          ))}
          {firm.skills.length > 4 && (
            <Pill>+{firm.skills.length - 4}</Pill>
          )}
        </div>
      )}
    </div>
  );
}

export function FirmResultList({
  results,
}: {
  results: FirmResult[];
}) {
  if (!results || results.length === 0) {
    return (
      <div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
        <p className="text-xs text-cos-slate">No matching firms found. Try broadening your search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((firm) => (
        <FirmResultCard key={firm.firmId} firm={firm} />
      ))}
    </div>
  );
}

export function FirmDetailCard({
  firm,
}: {
  firm: {
    found: boolean;
    name?: string;
    website?: string;
    description?: string;
    categories?: string[];
    industries?: string[];
    skills?: string[];
    markets?: string[];
    expertCount?: number;
    caseStudyCount?: number;
    clientCount?: number;
    message?: string;
  };
}) {
  if (!firm.found) {
    return (
      <div className="rounded-cos-lg border border-cos-border/30 bg-cos-surface-raised/50 px-3 py-2">
        <p className="text-xs text-cos-slate">{firm.message ?? "Firm not found."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-cos-lg border border-cos-electric/20 bg-gradient-to-br from-cos-electric/5 to-transparent p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-cos-midnight">{firm.name}</h4>
        {firm.website && (
          <a
            href={`https://${firm.website.replace(/^https?:\/\//, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-cos-slate hover:text-cos-electric"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {firm.description && (
        <p className="mt-1 text-xs leading-relaxed text-cos-slate">
          {firm.description.slice(0, 200)}
          {firm.description.length > 200 ? "..." : ""}
        </p>
      )}

      {(firm.categories?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {firm.categories!.map((cat) => (
            <Pill key={cat} variant="accent">{cat}</Pill>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-3 text-[10px] text-cos-slate">
        {(firm.expertCount ?? 0) > 0 && (
          <span>{firm.expertCount} experts</span>
        )}
        {(firm.caseStudyCount ?? 0) > 0 && (
          <span>{firm.caseStudyCount} case studies</span>
        )}
        {(firm.clientCount ?? 0) > 0 && (
          <span>{firm.clientCount} clients</span>
        )}
      </div>

      {(firm.skills?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {firm.skills!.slice(0, 6).map((skill) => (
            <Pill key={skill}>{skill}</Pill>
          ))}
        </div>
      )}
    </div>
  );
}
