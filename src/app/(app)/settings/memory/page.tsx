"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface MemoryTheme {
  theme: string;
  label: string;
  entryCount: number;
  lastUpdated: string | null;
}

interface MemoryEntry {
  id: string;
  content: string;
  confidence: number | null;
  createdAt: string;
}

export default function MemorySettingsPage() {
  const [themes, setThemes] = useState<MemoryTheme[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showNuclear, setShowNuclear] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setThemes(data.themes ?? []);
        setTotalEntries(data.totalEntries ?? 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function loadThemeEntries(theme: string) {
    if (expandedTheme === theme) {
      setExpandedTheme(null);
      return;
    }
    setExpandedTheme(theme);
    const res = await fetch(`/api/memory?theme=${theme}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
    }
  }

  async function deleteEntry(entryId: string) {
    setDeleting(entryId);
    const res = await fetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setTotalEntries((prev) => prev - 1);
      setThemes((prev) =>
        prev.map((t) =>
          t.theme === expandedTheme
            ? { ...t, entryCount: t.entryCount - 1 }
            : t
        )
      );
    }
    setDeleting(null);
  }

  async function deleteTheme(theme: string) {
    setDeleting(theme);
    const res = await fetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
    if (res.ok) {
      const data = await res.json();
      setTotalEntries((prev) => prev - (data.deleted ?? 0));
      setThemes((prev) => prev.filter((t) => t.theme !== theme));
      if (expandedTheme === theme) {
        setExpandedTheme(null);
        setEntries([]);
      }
    }
    setDeleting(null);
  }

  async function deleteAll() {
    setDeleting("all");
    const res = await fetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setThemes([]);
      setEntries([]);
      setTotalEntries(0);
      setExpandedTheme(null);
      setShowNuclear(false);
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Ossy&apos;s Memory
          </h2>
          <p className="mt-1 text-sm text-cos-slate">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Ossy&apos;s Memory
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            Ossy remembers key details from your conversations to provide
            better, more personalized assistance over time.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-cos-slate">
          <Brain className="h-4 w-4" />
          <span>{totalEntries} memories</span>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-8 text-center">
          <Brain className="mx-auto h-10 w-10 text-cos-slate-light" />
          <p className="mt-3 text-sm text-cos-slate">
            Ossy hasn&apos;t formed any memories yet. As you chat, Ossy will
            remember important details about your firm and preferences.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {themes.map((t) => (
            <div
              key={t.theme}
              className="rounded-cos-xl border border-cos-border bg-cos-surface-raised"
            >
              <button
                onClick={() => loadThemeEntries(t.theme)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  {expandedTheme === t.theme ? (
                    <ChevronDown className="h-4 w-4 text-cos-slate" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-cos-slate" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-cos-midnight">
                      {t.label}
                    </p>
                    <p className="text-xs text-cos-slate-light">
                      {t.entryCount} {t.entryCount === 1 ? "memory" : "memories"}
                      {t.lastUpdated &&
                        ` · Last updated ${new Date(t.lastUpdated).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTheme(t.theme);
                  }}
                  disabled={deleting === t.theme}
                  className="text-cos-slate hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </button>

              {expandedTheme === t.theme && (
                <div className="border-t border-cos-border px-5 py-3 space-y-2">
                  {entries.length === 0 ? (
                    <p className="text-xs text-cos-slate-light py-2">
                      No entries in this theme.
                    </p>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-cos-lg bg-cos-cloud px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-cos-midnight">
                            {entry.content}
                          </p>
                          <p className="mt-0.5 text-xs text-cos-slate-light">
                            {new Date(entry.createdAt).toLocaleDateString()}
                            {entry.confidence != null &&
                              ` · ${Math.round(entry.confidence * 100)}% confidence`}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          disabled={deleting === entry.id}
                          className="mt-0.5 text-cos-slate-light hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Nuclear option */}
      {totalEntries > 0 && (
        <div className="rounded-cos-xl border border-red-200 bg-red-50/50 p-5">
          {!showNuclear ? (
            <button
              onClick={() => setShowNuclear(true)}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
            >
              <AlertTriangle className="h-4 w-4" />
              Delete all memories
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-700">
                This will permanently delete all {totalEntries} memories.
                Ossy will forget everything it learned about you and your firm.
                This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteAll}
                  disabled={deleting === "all"}
                >
                  {deleting === "all" ? "Deleting..." : "Yes, forget everything"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNuclear(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
