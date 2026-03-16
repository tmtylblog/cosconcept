"use client";

import { useState } from "react";
import { X, Briefcase, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PdlExperience {
  company: { name: string; website?: string | null; industry?: string | null };
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string;
}

interface PdlExperiencePickerProps {
  experiences: PdlExperience[];
  usedIndices?: number[];
  specialistTitle?: string;
  onSelect: (ex: PdlExperience, index: number, condensedSubject?: string) => void;
  onClose: () => void;
}

export function PdlExperiencePicker({
  experiences,
  usedIndices = [],
  specialistTitle,
  onSelect,
  onClose,
}: PdlExperiencePickerProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [condensing, setCondensing] = useState(false);

  const handleUseRole = async () => {
    if (selected === null) return;
    const ex = experiences[selected];

    // Condense the summary via AI before passing it back
    if (ex.summary) {
      setCondensing(true);
      try {
        const res = await fetch("/api/ai/condense-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: ex.summary,
            roleTitle: ex.title,
            companyName: ex.company.name,
            specialistTitle,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          onSelect(ex, selected, data.condensed || ex.summary);
          onClose();
          return;
        }
      } catch {
        // Fall through to use raw summary
      } finally {
        setCondensing(false);
      }
    }

    // No summary or condense failed — use raw
    onSelect(ex, selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/30 backdrop-blur-sm"
        onClick={condensing ? undefined : onClose}
      />

      {/* Slide-over panel */}
      <div className="w-full max-w-sm bg-cos-cloud border-l border-cos-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-cos-midnight">
              Select from Work History
            </h3>
            <p className="text-[10px] text-cos-slate-dim mt-0.5">
              Pick a role or past project to add as a work example
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={condensing}
            className="rounded-cos-md p-1.5 text-cos-slate-light hover:bg-cos-border/30 hover:text-cos-midnight transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto cos-scrollbar p-3 space-y-2">
          {experiences.length === 0 ? (
            <p className="py-8 text-center text-xs text-cos-slate-dim">
              No work history available
            </p>
          ) : (
            experiences.map((ex, i) => {
              const isUsed = usedIndices.includes(i);
              return (
              <button
                key={i}
                onClick={() => !isUsed && !condensing && setSelected(i)}
                disabled={isUsed || condensing}
                className={cn(
                  "w-full rounded-cos-lg border p-3 text-left transition-colors",
                  isUsed
                    ? "border-cos-border/40 bg-cos-cloud/50 opacity-50 cursor-not-allowed"
                    : selected === i
                      ? "border-cos-electric bg-cos-electric/8"
                      : "border-cos-border bg-white hover:border-cos-electric/40 hover:bg-cos-electric/3"
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-md", isUsed ? "bg-cos-signal/10 text-cos-signal" : "bg-cos-midnight/8 text-cos-midnight")}>
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold text-cos-midnight truncate">
                        {ex.title}
                      </p>
                      {isUsed && (
                        <span className="shrink-0 rounded-cos-pill bg-cos-signal/10 px-1.5 py-0.5 text-[8px] font-medium text-cos-signal">
                          Already added
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-cos-slate-dim truncate">
                      {ex.company.name}
                      {ex.company.industry ? ` · ${ex.company.industry}` : ""}
                    </p>
                    <p className="mt-0.5 text-[9px] text-cos-slate-light">
                      {ex.startDate ?? "?"}
                      {ex.isCurrent ? " · Present" : ex.endDate ? ` – ${ex.endDate}` : ""}
                    </p>
                    {ex.summary && (
                      <p className="mt-1 text-[10px] leading-relaxed text-cos-slate-dim line-clamp-2 italic">
                        {ex.summary}
                      </p>
                    )}
                  </div>
                </div>
              </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-cos-border p-3">
          <button
            disabled={selected === null || condensing}
            onClick={handleUseRole}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-cos-lg py-2.5 text-sm font-medium transition-colors",
              selected !== null && !condensing
                ? "bg-cos-electric text-white hover:bg-cos-electric/90"
                : "bg-cos-border/30 text-cos-slate-light cursor-not-allowed"
            )}
          >
            {condensing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing summary...
              </>
            ) : (
              <>
                Use this role
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
