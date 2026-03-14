"use client";

import { useState, useEffect, useRef } from "react";
import { Search, CheckCircle2, Loader2, Circle, Zap, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResults {
  total: number;
  pdlTotal: number | null;
  experts: number;
  potentialExperts: number;
  notExperts: number;
}

interface EnrichProgress {
  total: number;
  completed: number;
  running: number;
  failed: number;
}

type Phase = "checking" | "queued" | "searching" | "enriching" | "error";

interface TeamDiscoveryProgressProps {
  phase: Phase;
  domain: string | null;
  searchResults: SearchResults | null;
  enrichProgress: EnrichProgress | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}

/** Animated number that counts up smoothly */
function AnimatedCount({ value, duration = 600 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (value === prev.current) return;
    const from = prev.current;
    const to = value;
    prev.current = value;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    }

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return <>{display}</>;
}

function StepIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-cos-signal" />;
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />;
  return <Circle className="h-4 w-4 text-cos-border" />;
}

function stepStatus(phase: Phase, step: "search" | "classify" | "enrich"): "done" | "active" | "pending" {
  const order = { search: 0, classify: 1, enrich: 2 };
  const phaseStep: Record<Phase, number> = {
    checking: -1,
    queued: 0,
    searching: 0,
    enriching: 2,
    error: -1,
  };
  const current = phaseStep[phase];
  const target = order[step];
  if (current > target) return "done";
  if (current === target) return "active";
  return "pending";
}

export function TeamDiscoveryProgress({
  phase,
  domain,
  searchResults,
  enrichProgress,
  errorMessage,
  onRetry,
}: TeamDiscoveryProgressProps) {
  const found = searchResults?.total ?? 0;
  const pdlTotal = searchResults?.pdlTotal ?? null;

  // Error state
  if (phase === "error") {
    return (
      <div className="rounded-cos-xl border border-dashed border-cos-ember/30 bg-cos-surface/50 px-6 py-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-cos-ember" />
        <p className="mt-3 text-sm font-medium text-cos-midnight">
          Team discovery encountered an issue
        </p>
        <p className="mt-1 text-xs text-cos-slate-dim">
          {errorMessage || "Something went wrong. Please try again."}
        </p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-4 h-8 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-surface px-6 py-10">
      {/* Animated search icon */}
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cos-electric/10 animate-pulse">
          <Search className="h-8 w-8 text-cos-electric" />
        </div>
      </div>

      {/* Heading */}
      <h3 className="mt-5 text-center font-heading text-lg font-semibold text-cos-midnight">
        {domain
          ? <>Discovering your team at {domain}&hellip;</>
          : <>Discovering your team&hellip;</>
        }
      </h3>
      <p className="mt-1 text-center text-xs text-cos-slate-dim">
        This usually takes 1&ndash;3 minutes. You can leave and come back.
      </p>

      {/* Phase steps */}
      <div className="mx-auto mt-8 max-w-sm space-y-3">
        <div className="flex items-center gap-3">
          <StepIndicator status={stepStatus(phase, "search")} />
          <div className="flex-1">
            <p className="text-sm font-medium text-cos-midnight">Searching team roster</p>
            <p className="text-[10px] text-cos-slate-dim">Finding people at {domain || "your company"}</p>
          </div>
          <span className="text-xs font-medium text-cos-signal tabular-nums">
            {found > 0 || pdlTotal ? (
              pdlTotal && found < pdlTotal ? (
                <><AnimatedCount value={found} /> of {pdlTotal} found</>
              ) : (
                <><AnimatedCount value={found} /> found</>
              )
            ) : (
              phase === "queued" || phase === "checking" ? (
                <span className="text-cos-slate-dim">waiting&hellip;</span>
              ) : (
                <span className="text-cos-slate-dim">searching&hellip;</span>
              )
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <StepIndicator status={stepStatus(phase, "classify")} />
          <div className="flex-1">
            <p className="text-sm font-medium text-cos-midnight">Classifying experts</p>
            <p className="text-[10px] text-cos-slate-dim">Identifying client-facing specialists</p>
          </div>
          {searchResults && searchResults.experts > 0 && (
            <span className="text-xs font-medium text-cos-signal tabular-nums">
              <AnimatedCount value={searchResults.experts} /> experts
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StepIndicator status={stepStatus(phase, "enrich")} />
          <div className="flex-1">
            <p className="text-sm font-medium text-cos-midnight">Enriching top experts</p>
            <p className="text-[10px] text-cos-slate-dim">Pulling work history &amp; specialist profiles</p>
          </div>
          {enrichProgress && enrichProgress.total > 0 && (
            <span className="text-xs font-medium text-cos-electric tabular-nums">
              <AnimatedCount value={enrichProgress.completed} /> / {enrichProgress.total}
            </span>
          )}
        </div>
      </div>

      {/* Search progress bar (during searching phase) */}
      {pdlTotal && found > 0 && found < pdlTotal && (phase === "searching" || phase === "queued") && (
        <div className="mx-auto mt-4 max-w-sm">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
            <div
              className="h-full rounded-full bg-cos-signal transition-all duration-700 ease-out"
              style={{ width: `${Math.round((found / pdlTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Search results stat cards */}
      {searchResults && searchResults.total > 0 && (searchResults.experts > 0 || searchResults.potentialExperts > 0) && (
        <div className="mx-auto mt-6 flex max-w-sm gap-3">
          <div className="flex-1 rounded-cos-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-lg font-bold text-emerald-700 tabular-nums"><AnimatedCount value={searchResults.experts} /></p>
            <p className="text-[10px] font-medium text-emerald-600">Experts</p>
          </div>
          <div className="flex-1 rounded-cos-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-lg font-bold text-amber-700 tabular-nums"><AnimatedCount value={searchResults.potentialExperts} /></p>
            <p className="text-[10px] font-medium text-amber-600">Potential</p>
          </div>
          <div className="flex-1 rounded-cos-lg border border-cos-border bg-cos-cloud p-3 text-center">
            <p className="text-lg font-bold text-cos-slate tabular-nums"><AnimatedCount value={searchResults.notExperts} /></p>
            <p className="text-[10px] font-medium text-cos-slate-dim">Internal</p>
          </div>
        </div>
      )}

      {/* Enrichment progress bar */}
      {enrichProgress && enrichProgress.total > 0 && phase === "enriching" && (
        <div className="mx-auto mt-4 max-w-sm">
          <div className="flex items-center justify-between text-[10px] text-cos-slate-dim">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-cos-electric" />
              Enriching {enrichProgress.completed + enrichProgress.running} of {enrichProgress.total} experts&hellip;
            </span>
            <span>{Math.round((enrichProgress.completed / enrichProgress.total) * 100)}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-cos-cloud">
            <div
              className="h-full rounded-full bg-cos-electric transition-all duration-700 ease-out"
              style={{ width: `${Math.round((enrichProgress.completed / enrichProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Skeleton placeholder rows */}
      <div className="mx-auto mt-8 max-w-sm space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-cos-lg bg-cos-cloud/50 px-4 py-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-cos-border/30" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-cos-border/30" style={{ animationDelay: `${i * 100}ms` }} />
              <div className="h-2 w-40 animate-pulse rounded bg-cos-border/20" style={{ animationDelay: `${i * 100 + 50}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
