"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Star, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualityStatus } from "@/lib/expert/quality-score";

interface Example {
  id?: string;
  title?: string | null;
  subject?: string | null;
  companyName?: string | null;
  companyIndustry?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  position?: number;
}

interface SpecialistProfileCardProps {
  profile: {
    id: string;
    title?: string | null;
    bodyDescription?: string | null;
    skills?: string[] | null;
    industries?: string[] | null;
    services?: string[] | null;
    qualityScore?: number | null;
    qualityStatus?: string | null;
    isPrimary?: boolean | null;
    isSearchable?: boolean | null;
    status?: string | null;
    examples?: Example[];
  };
  isOwner?: boolean;
  onEditClick?: (profileId: string) => void;
  compact?: boolean;
}

const QUALITY_CONFIG: Record<
  QualityStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  strong: {
    label: "Strong",
    color: "text-cos-signal",
    bg: "bg-cos-signal/8",
    border: "border-cos-signal/30",
    icon: <Star className="h-3 w-3" />,
  },
  partial: {
    label: "Partial",
    color: "text-cos-electric",
    bg: "bg-cos-electric/8",
    border: "border-cos-electric/30",
    icon: <Eye className="h-3 w-3" />,
  },
  weak: {
    label: "Weak",
    color: "text-cos-warm",
    bg: "bg-cos-warm/8",
    border: "border-cos-warm/30",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  incomplete: {
    label: "Incomplete",
    color: "text-cos-slate-dim",
    bg: "bg-cos-cloud-dim",
    border: "border-cos-border",
    icon: <EyeOff className="h-3 w-3" />,
  },
};

export function SpecialistProfileCard({
  profile,
  isOwner,
  onEditClick,
  compact = false,
}: SpecialistProfileCardProps) {
  const [expanded, setExpanded] = useState(false);

  const status = (profile.qualityStatus ?? "incomplete") as QualityStatus;
  const cfg = QUALITY_CONFIG[status];
  const score = Math.round(profile.qualityScore ?? 0);
  const examples = profile.examples ?? [];

  // Don't show weak/incomplete to non-owners
  if (!isOwner && (status === "weak" || status === "incomplete")) return null;

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-cos-md border p-2",
          cfg.bg,
          cfg.border
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[10px] font-medium", cfg.color)}>
            {cfg.icon}
            {cfg.label}
          </span>
          <p className="flex-1 truncate text-[11px] font-semibold text-cos-midnight">
            {profile.title || "Untitled profile"}
          </p>
          {isOwner && onEditClick && (
            <button
              onClick={() => onEditClick(profile.id)}
              className="shrink-0 text-[10px] text-cos-electric hover:underline"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-cos-xl border transition-shadow hover:shadow-sm",
        cfg.bg,
        cfg.border
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {profile.isPrimary && (
              <span className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cos-electric">
                Primary
              </span>
            )}
            <span
              className={cn(
                "flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
                cfg.bg,
                cfg.color
              )}
            >
              {cfg.icon}
              {cfg.label} · {score}/100
            </span>
            {!profile.isSearchable && isOwner && (
              <span className="rounded-cos-pill bg-cos-slate-light/20 px-2 py-0.5 text-[9px] text-cos-slate-dim">
                Not in search
              </span>
            )}
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-cos-midnight leading-snug">
            {profile.title || <span className="italic text-cos-slate-dim">No title yet</span>}
          </h4>
          {profile.bodyDescription && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cos-slate-dim">
              {profile.bodyDescription}
            </p>
          )}
        </div>
        <span className="shrink-0 mt-1 text-cos-slate-light">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-cos-border/30 px-4 pb-4 pt-3 space-y-3">
          {/* Skills */}
          {(profile.skills?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Skills
              </p>
              <div className="flex flex-wrap gap-1">
                {profile.skills!.map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {(profile.industries?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Industries
              </p>
              <div className="flex flex-wrap gap-1">
                {profile.industries!.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {examples.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Work Examples
              </p>
              <div className="space-y-1.5">
                {examples.map((ex) => (
                  <div
                    key={ex.id ?? String(ex.position ?? Math.random())}
                    className="rounded-cos-md border border-cos-border/40 bg-white/60 p-2"
                  >
                    <p className="text-[11px] font-semibold text-cos-midnight">
                      {ex.title || "Untitled example"}
                    </p>
                    {ex.subject && (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-cos-slate-dim line-clamp-2">
                        {ex.subject}
                      </p>
                    )}
                    {(ex.companyName || ex.startDate) && (
                      <p className="mt-0.5 text-[9px] text-cos-slate-light">
                        {[ex.companyName, ex.startDate].filter(Boolean).join(" · ")}
                        {ex.isCurrent ? " · Present" : ex.endDate ? ` – ${ex.endDate}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && (
            <div className="flex items-center gap-2 pt-1">
              {onEditClick && (
                <button
                  onClick={() => onEditClick(profile.id)}
                  className="rounded-cos-md border border-cos-electric/30 bg-cos-electric/8 px-3 py-1.5 text-[11px] font-medium text-cos-electric transition-colors hover:bg-cos-electric/15"
                >
                  Edit profile
                </button>
              )}
              {status !== "strong" && (
                <p className="text-[10px] text-cos-slate-dim">
                  {status === "partial" && "Reach 80+ points to appear in search"}
                  {status === "weak" && "Add description + examples to improve visibility"}
                  {status === "incomplete" && "Profile is hidden — complete to publish"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
