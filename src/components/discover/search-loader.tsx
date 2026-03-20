"use client";

import { useState, useEffect } from "react";
import { Search, Database, Sparkles, CheckCircle2, Loader2 } from "lucide-react";

const PHASES = [
  { icon: Search, label: "Understanding your request", duration: 2500 },
  { icon: Database, label: "Searching the knowledge graph", duration: 4000 },
  { icon: Sparkles, label: "Ranking matches by relevance", duration: 5000 },
  { icon: CheckCircle2, label: "Preparing results", duration: 3000 },
];

export function SearchLoader() {
  const [elapsed, setElapsed] = useState(0);
  const [activePhase, setActivePhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 200), 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let total = 0;
    for (let i = 0; i < PHASES.length; i++) {
      total += PHASES[i].duration;
      if (elapsed < total) {
        setActivePhase(i);
        return;
      }
    }
    setActivePhase(PHASES.length - 1);
  }, [elapsed]);

  const totalDuration = PHASES.reduce((s, p) => s + p.duration, 0);
  const progress = Math.min(95, Math.round((elapsed / totalDuration) * 100));

  return (
    <div className="animate-slide-up">
      <div className="mx-auto max-w-md rounded-cos-2xl border border-cos-border bg-white p-8 shadow-sm">
        {/* Animated icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cos-electric/15 to-cos-electric/5">
              <Search className="h-7 w-7 text-cos-electric" />
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-2xl border-2 border-cos-electric/20 animate-ping" style={{ animationDuration: "2s" }} />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-center text-sm font-semibold text-cos-midnight mb-1">
          Searching the Network
        </h3>
        <p className="text-center text-xs text-cos-slate mb-6">
          Analyzing 1,000+ firms, 1,500+ experts, and 3,200+ case studies
        </p>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-cos-cloud-dim mb-5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cos-electric to-cos-electric/70 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Phase checklist */}
        <div className="space-y-2.5">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon;
            const isDone = i < activePhase;
            const isActive = i === activePhase;

            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ${
                  isDone
                    ? "bg-cos-signal/10"
                    : isActive
                      ? "bg-cos-electric/10"
                      : "bg-cos-cloud"
                }`}>
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-cos-signal" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 text-cos-electric animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-cos-slate-light" />
                  )}
                </div>
                <span className={`text-xs transition-colors duration-300 ${
                  isDone
                    ? "text-cos-signal font-medium"
                    : isActive
                      ? "text-cos-electric font-medium"
                      : "text-cos-slate-light"
                }`}>
                  {phase.label}
                  {isDone && " ✓"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timer */}
        <p className="text-center text-[10px] text-cos-slate-light mt-4">
          {Math.floor(elapsed / 1000)}s elapsed
        </p>
      </div>
    </div>
  );
}
