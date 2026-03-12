"use client";

import { NODE_COLORS, NODE_LABELS, FILTERABLE_NODE_TYPES } from "@/lib/graph/colors";
import type { NodeType } from "@/lib/graph/types";

interface GraphFiltersProps {
  visibleTypes: Set<string>;
  onToggleType: (type: NodeType) => void;
  stats: { nodeCount: number; edgeCount: number };
}

export default function GraphFilters({
  visibleTypes,
  onToggleType,
  stats,
}: GraphFiltersProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Node type filters */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Node Types
        </h3>
        <div className="space-y-1">
          {FILTERABLE_NODE_TYPES.map((type) => {
            const checked = visibleTypes.has(type);
            const color = NODE_COLORS[type];
            const label = NODE_LABELS[type];
            return (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 rounded-cos px-2 py-1.5 text-sm transition-colors hover:bg-cos-cloud/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleType(type)}
                  className="sr-only"
                />
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors"
                  style={{
                    borderColor: color,
                    backgroundColor: checked ? color : "transparent",
                  }}
                >
                  {checked && (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className={checked ? "text-cos-midnight" : "text-cos-slate-light"}>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-cos-border pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Graph Stats
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-cos bg-cos-cloud/50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-cos-electric">
              {stats.nodeCount.toLocaleString()}
            </div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">
              Nodes
            </div>
          </div>
          <div className="rounded-cos bg-cos-cloud/50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-cos-signal">
              {stats.edgeCount.toLocaleString()}
            </div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">
              Edges
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-cos-border pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Interaction
        </h3>
        <div className="space-y-1 text-xs text-cos-slate">
          <p>
            <kbd className="rounded bg-cos-cloud px-1.5 py-0.5 font-mono text-[10px]">Click</kbd>{" "}
            Select node
          </p>
          <p>
            <kbd className="rounded bg-cos-cloud px-1.5 py-0.5 font-mono text-[10px]">Double-click</kbd>{" "}
            Expand neighbors
          </p>
          <p>
            <kbd className="rounded bg-cos-cloud px-1.5 py-0.5 font-mono text-[10px]">Scroll</kbd>{" "}
            Zoom in/out
          </p>
          <p>
            <kbd className="rounded bg-cos-cloud px-1.5 py-0.5 font-mono text-[10px]">Drag</kbd>{" "}
            Pan canvas / Move nodes
          </p>
        </div>
      </div>
    </div>
  );
}
