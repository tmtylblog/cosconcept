"use client";

import { Loader2, Check } from "lucide-react";
import type { StageStatus } from "@/hooks/use-enrichment";
import { cn } from "@/lib/utils";

// ─── RevealCard ─────────────────────────────────────────────

/** A single data card that slides in from the bottom when it has content */
export function RevealCard({
  icon: Icon,
  label,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="animate-slide-up w-full rounded-cos-xl border border-cos-border/40 bg-white px-5 py-4 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cos-slate">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm leading-relaxed text-cos-midnight">
        {children}
      </div>
    </div>
  );
}

// ─── PillList ───────────────────────────────────────────────

/** Render an array of strings as pills inside a RevealCard */
export function PillList({
  items,
  pillClass,
  max,
}: {
  items: string[];
  pillClass: string;
  max?: number;
}) {
  const display = max ? items.slice(0, max) : items;
  const overflow = max && items.length > max ? items.length - max : 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {display.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-cos-pill px-2.5 py-1 text-xs font-medium",
            pillClass
          )}
        >
          {item}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

// ─── StageChip ──────────────────────────────────────────────

/** Small status chip for each enrichment stage */
export function StageChip({ label, stage }: { label: string; stage: StageStatus }) {
  if (stage === "idle") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
        stage === "loading" && "bg-cos-electric/10 text-cos-electric",
        stage === "done" && "bg-cos-signal/10 text-cos-signal",
        stage === "failed" && "bg-cos-slate/10 text-cos-slate"
      )}
    >
      {stage === "loading" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {stage === "done" && <Check className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

// ─── PreferenceProgress ─────────────────────────────────────

/** Progress indicator for the 9 partner preference questions */
export function PreferenceProgress({
  desiredServices,
  partnerIndustries,
  clientSize,
  partnerLocations,
  partnerTypes,
  partnerSize,
  projectSize,
  hourlyRates,
  partnershipRole,
}: {
  desiredServices: string[];
  partnerIndustries: string[];
  clientSize: string[];
  partnerLocations: string[];
  partnerTypes: string[];
  partnerSize: string[];
  projectSize: string[];
  hourlyRates: string | undefined;
  partnershipRole: string | undefined;
}) {
  const fields = [
    { label: "Services wanted", done: desiredServices.length > 0 },
    { label: "Partner industries", done: partnerIndustries.length > 0 },
    { label: "Client size", done: clientSize.length > 0 },
    { label: "Locations", done: partnerLocations.length > 0 },
    { label: "Partner types", done: partnerTypes.length > 0 },
    { label: "Partner size", done: partnerSize.length > 0 },
    { label: "Project size", done: projectSize.length > 0 },
    { label: "Hourly rates", done: !!hourlyRates },
    { label: "Partnership role", done: !!partnershipRole },
  ];

  const completedCount = fields.filter((f) => f.done).length;

  // Don't show when nothing or everything is done
  if (completedCount === 0 || completedCount === 9) return null;

  return (
    <div className="w-full rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-cos-slate">
          Partner Preferences
        </span>
        <span className="text-xs font-bold text-cos-electric">
          {completedCount}/9
        </span>
      </div>
      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cos-electric to-cos-signal transition-all duration-500"
          style={{ width: `${(completedCount / 9) * 100}%` }}
        />
      </div>
      {/* Individual field status */}
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span
            key={f.label}
            className={cn(
              "flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
              f.done
                ? "bg-cos-signal/10 text-cos-signal"
                : "bg-cos-cloud text-cos-slate-dim"
            )}
          >
            {f.done && <Check className="h-2.5 w-2.5" />}
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}
