"use client";

import Link from "next/link";
import {
  DollarSign,
  Plus,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { TagEditor } from "./tag-editor";
import type { Deal, Stage } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal | null;
  stages: Stage[];
  onStageChange: (stageId: string) => void;
  onTagsChange: (tags: string[]) => void;
  onCreateDeal: () => void;
}

// ── Status + Priority Helpers ────────────────────────────────────────────────

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    open: "bg-green-100 text-green-700",
    won: "bg-cos-electric/15 text-cos-electric",
    lost: "bg-red-100 text-red-600",
    stalled: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${styles[status] ?? "bg-cos-cloud text-cos-slate"}`}
    >
      {status}
    </span>
  );
}

function priorityBadge(priority: string) {
  const styles: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-cos-cloud text-cos-slate",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${styles[priority] ?? "bg-cos-cloud text-cos-slate"}`}
    >
      {priority}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function DealCard({
  deal,
  stages,
  onStageChange,
  onTagsChange,
  onCreateDeal,
}: DealCardProps) {
  // ── Null state: no deal yet ────────────────────────────────────────────
  if (!deal) {
    return (
      <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-cloud/50 p-4">
        <div className="text-center">
          <DollarSign className="h-5 w-5 mx-auto mb-1.5 text-cos-slate opacity-40" />
          <p className="text-xs text-cos-slate mb-2.5">No deal created yet</p>
          <button
            onClick={onCreateDeal}
            className="inline-flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors"
          >
            <Plus className="h-3 w-3" />
            Create Deal
          </button>
        </div>
      </div>
    );
  }

  // ── Deal card ──────────────────────────────────────────────────────────

  const currentStage = stages.find((s) => s.id === deal.stageId);
  const tags = deal.customFields?.tags ?? [];

  return (
    <div className="rounded-cos-xl border border-cos-border bg-white p-4 space-y-3">
      {/* Header: name + badges */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/admin/growth-ops/pipeline/${deal.id}?from=inbox`}
            className="font-heading text-sm font-semibold text-cos-midnight truncate flex-1 hover:text-cos-electric transition-colors flex items-center gap-1.5"
          >
            {deal.name}
            <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
          </Link>
          {statusBadge(deal.status)}
        </div>
        <div className="flex items-center gap-2">
          {deal.dealValue && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-cos-midnight">
              <DollarSign className="h-3 w-3 text-cos-slate" />
              {deal.dealValue}
            </span>
          )}
          {priorityBadge(deal.priority)}
        </div>
      </div>

      {/* Stage pills */}
      <div>
        <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider mb-1.5">
          Stage
        </p>
        <div className="flex flex-wrap gap-1">
          {stages.map((s) => {
            const isActive = s.id === deal.stageId;
            return (
              <button
                key={s.id}
                onClick={() => onStageChange(s.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none transition-colors ${
                  isActive
                    ? "text-white"
                    : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
                }`}
                style={isActive ? { backgroundColor: s.color } : undefined}
              >
                {!isActive && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                )}
                {s.label}
              </button>
            );
          })}
        </div>
        {currentStage && (
          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-cos-slate">
            <ArrowRight className="h-2.5 w-2.5" />
            Currently: <span className="font-medium text-cos-midnight">{currentStage.label}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider mb-1.5">
          Tags
        </p>
        <TagEditor tags={tags} onTagsChange={onTagsChange} />
      </div>
    </div>
  );
}
