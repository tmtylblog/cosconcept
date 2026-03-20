"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Loader2,
  Plus,
  X,
  ExternalLink,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Target,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChecklistItem {
  text: string;
  checked: boolean;
  lineIndex: number;
}

interface WorkTrack {
  filePath: string;
  title: string;
  items: ChecklistItem[];
  checkedCount: number;
  totalCount: number;
}

interface ChecklistData {
  workTracks: WorkTrack[];
  totalItems: number;
  totalChecked: number;
  completionPercent: number;
}

function ProgressBar({ percent, size = "md" }: { percent: number; size?: "sm" | "md" }) {
  const height = size === "sm" ? "h-1.5" : "h-3";
  return (
    <div className={`w-full ${height} rounded-full bg-slate-200 overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500 ${
          percent === 100
            ? "bg-green-500"
            : percent > 50
              ? "bg-amber-500"
              : "bg-[var(--cos-primary)]"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function ReleaseChecklistPage() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/release-checklist");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch checklist:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle a checkbox
  const handleToggle = async (track: WorkTrack, item: ChecklistItem) => {
    const key = `${track.filePath}:${item.lineIndex}`;
    setToggling(key);

    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workTracks: prev.workTracks.map((t) =>
          t.filePath === track.filePath
            ? {
                ...t,
                items: t.items.map((i) =>
                  i.lineIndex === item.lineIndex ? { ...i, checked: !item.checked } : i
                ),
                checkedCount: t.checkedCount + (item.checked ? -1 : 1),
              }
            : t
        ),
        totalChecked: prev.totalChecked + (item.checked ? -1 : 1),
        completionPercent: Math.round(
          ((prev.totalChecked + (item.checked ? -1 : 1)) / prev.totalItems) * 100
        ),
      };
    });

    try {
      const res = await fetch("/api/admin/release-checklist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: track.filePath,
          lineIndex: item.lineIndex,
          checked: !item.checked,
        }),
      });
      if (!res.ok) {
        // Revert on failure
        await fetchData();
      }
    } catch {
      await fetchData();
    } finally {
      setToggling(null);
    }
  };

  // Create new work track
  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/release-checklist/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        setShowCreate(false);
        setCreateName("");
        // Redirect to docs editor with the new file
        window.location.href = `/admin/docs?file=${encodeURIComponent(result.filePath)}`;
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error}`);
      }
    } catch {
      alert("Failed to create work track");
    } finally {
      setCreating(false);
    }
  };

  const toggleExpand = (filePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--cos-primary)]/10">
              <ClipboardCheck className="h-5 w-5 text-[var(--cos-primary)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--cos-text-primary)]">
                Product Release Checklist
              </h1>
              <p className="text-xs text-[var(--cos-text-muted)]">
                Everything that needs to be done before the next release
              </p>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Work Track
        </Button>
      </div>

      {/* Overall progress */}
      {data && data.totalItems > 0 && (
        <div className="mb-8 rounded-2xl border border-[var(--cos-border)] bg-gradient-to-r from-white to-[var(--cos-primary)]/[0.03] p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-[var(--cos-primary)]" />
              <span className="text-sm font-semibold text-[var(--cos-text-primary)]">
                Release Progress
              </span>
            </div>
            <span className="text-2xl font-bold text-[var(--cos-text-primary)]">
              {data.completionPercent}%
            </span>
          </div>
          <ProgressBar percent={data.completionPercent} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-[var(--cos-text-muted)]">
              {data.totalChecked} of {data.totalItems} items complete
            </span>
            <span className="text-xs text-[var(--cos-text-muted)]">
              {data.workTracks.length} work tracks
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-[var(--cos-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Scanning docs...
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.workTracks.length === 0 && (
        <div className="text-center py-16 rounded-2xl border-2 border-dashed border-[var(--cos-border)]">
          <ClipboardCheck className="h-10 w-10 text-[var(--cos-text-muted)] mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-[var(--cos-text-primary)] mb-1">No release items found</p>
          <p className="text-xs text-[var(--cos-text-muted)] mb-4 max-w-sm mx-auto">
            Add a <code className="bg-slate-100 px-1 rounded text-pink-600">## Release Scope</code> section
            with checkbox items to any doc, or create a new work track.
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Work Track
          </Button>
        </div>
      )}

      {/* Work track cards */}
      {data && data.workTracks.length > 0 && (
        <div className="space-y-3">
          {data.workTracks.map((track) => {
            const isExpanded = expanded.has(track.filePath);
            const percent = track.totalCount > 0
              ? Math.round((track.checkedCount / track.totalCount) * 100)
              : 0;
            const isComplete = percent === 100;

            return (
              <div
                key={track.filePath}
                className={`rounded-xl border ${
                  isComplete ? "border-green-200 bg-green-50/30" : "border-[var(--cos-border)] bg-white"
                } overflow-hidden transition-all`}
              >
                {/* Track header */}
                <button
                  onClick={() => toggleExpand(track.filePath)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--cos-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--cos-text-muted)] shrink-0" />
                  )}
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cos-primary)]/10 shrink-0">
                    <Target className={`h-4 w-4 ${isComplete ? "text-green-500" : "text-[var(--cos-primary)]"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--cos-text-primary)] truncate">
                        {track.title}
                      </span>
                      {isComplete && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="w-32">
                        <ProgressBar percent={percent} size="sm" />
                      </div>
                      <span className="text-[11px] text-[var(--cos-text-muted)]">
                        {track.checkedCount}/{track.totalCount}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/admin/docs?file=${encodeURIComponent(track.filePath)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[11px] text-[var(--cos-primary)] hover:underline shrink-0"
                  >
                    Edit
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </button>

                {/* Expanded checklist */}
                {isExpanded && track.items.length > 0 && (
                  <div className="border-t border-[var(--cos-border)] px-5 py-3 bg-slate-50/30">
                    <div className="space-y-1.5">
                      {track.items.map((item) => {
                        const key = `${track.filePath}:${item.lineIndex}`;
                        const isToggling = toggling === key;
                        return (
                          <button
                            key={key}
                            onClick={() => handleToggle(track, item)}
                            disabled={isToggling}
                            className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                              item.checked
                                ? "bg-green-50 hover:bg-green-100/70"
                                : "hover:bg-white"
                            } ${isToggling ? "opacity-50" : ""}`}
                          >
                            {item.checked ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                            )}
                            <span
                              className={`text-sm ${
                                item.checked
                                  ? "text-green-700 line-through opacity-70"
                                  : "text-[var(--cos-text-secondary)]"
                              }`}
                            >
                              {item.text}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[var(--cos-border)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--cos-text-primary)]">
                Create Work Track
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-md hover:bg-slate-100">
                <X className="h-4 w-4 text-[var(--cos-text-muted)]" />
              </button>
            </div>
            <p className="text-xs text-[var(--cos-text-muted)] mb-4">
              Creates a new doc in <code className="bg-slate-100 px-1 rounded text-pink-600">docs/context/</code> with
              Vision, Release Scope, and Future Ideas sections pre-filled.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1.5">
                Work Track Name
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && createName.trim()) handleCreate(); }}
                placeholder="e.g. Voice Integration, Call Intelligence..."
                className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
                className="flex-1"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-4 w-4 mr-1.5" />
                )}
                {creating ? "Creating..." : "Create & Edit"}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
