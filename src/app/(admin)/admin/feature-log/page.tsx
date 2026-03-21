"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  Plus,
  Loader2,
  ExternalLink,
  Sparkles,
  Wrench,
  Bug,
  Server,
  FileText,
  X,
  ChevronDown,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureLogEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  loggedBy: string;
  prNumber: number | null;
  commitHash: string | null;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; dotColor: string; icon: React.ReactNode }
> = {
  feature: {
    label: "Feature",
    color: "bg-green-100 text-green-700",
    dotColor: "bg-green-500",
    icon: <Sparkles className="h-3 w-3" />,
  },
  enhancement: {
    label: "Enhancement",
    color: "bg-blue-100 text-blue-700",
    dotColor: "bg-blue-500",
    icon: <Wrench className="h-3 w-3" />,
  },
  fix: {
    label: "Fix",
    color: "bg-red-100 text-red-700",
    dotColor: "bg-red-500",
    icon: <Bug className="h-3 w-3" />,
  },
  infrastructure: {
    label: "Infra",
    color: "bg-slate-100 text-slate-600",
    dotColor: "bg-slate-400",
    icon: <Server className="h-3 w-3" />,
  },
  docs: {
    label: "Docs",
    color: "bg-purple-100 text-purple-700",
    dotColor: "bg-purple-500",
    icon: <FileText className="h-3 w-3" />,
  },
};

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.feature;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export default function FeatureLogPage() {
  const [entries, setEntries] = useState<FeatureLogEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("feature");
  const [formDate, setFormDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("category", filter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/feature-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
        setCounts(data.counts ?? {});
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch feature log:", err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleSubmit() {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/feature-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim(),
          category: formCategory,
          createdAt: formDate || undefined,
        }),
      });
      if (res.ok) {
        setFormTitle("");
        setFormDesc("");
        setFormCategory("feature");
        setFormDate("");
        setShowForm(false);
        await fetchEntries();
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error}`);
      }
    } catch {
      alert("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <History className="h-5 w-5 text-[var(--cos-primary)]" />
            <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">
              Feature Log
            </h1>
          </div>
          <p className="text-sm text-[var(--cos-text-muted)]">
            Every change to the platform &mdash; auto-logged from PR merges and manual entries.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Entry
            </>
          )}
        </Button>
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-xl border border-[var(--cos-border)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--cos-text-primary)]">
            Log a Change
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="What changed?"
                className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                >
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1">
                  Date (optional)
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1">
              Description
            </label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              placeholder="Optional details..."
              className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
            />
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !formTitle.trim()}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Plus className="h-4 w-4 mr-1.5" />
            )}
            {submitting ? "Saving..." : "Add to Log"}
          </Button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Category filters */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-[var(--cos-primary)] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({total})
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-[var(--cos-primary)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cfg.label} ({counts[key] ?? 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 rounded-lg border border-[var(--cos-border)] text-xs w-48 focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
          />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--cos-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <History className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-sm text-[var(--cos-text-muted)]">No entries yet</p>
          <p className="text-xs text-[var(--cos-text-muted)] mt-1">
            Changes will appear here as PRs merge or you add them manually.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline stripe */}
          <div className="absolute left-[11px] top-0 bottom-0 w-px bg-[var(--cos-border)]" />

          {entries.map((entry, idx) => {
            // Group header: show date when it changes
            const prevDate =
              idx > 0
                ? formatDate(entries[idx - 1].createdAt)
                : null;
            const thisDate = formatDate(entry.createdAt);
            const showDateHeader = thisDate !== prevDate;
            const dotColor = CATEGORY_CONFIG[entry.category]?.dotColor ?? "bg-slate-300";

            return (
              <div key={entry.id} className="relative">
                {showDateHeader && (
                  <div className="flex items-center gap-3 py-3 mt-2 first:mt-0 relative z-10">
                    <div className="h-px flex-1 bg-[var(--cos-border)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cos-text-muted)] bg-[var(--cos-surface)] px-2">
                      {thisDate}
                    </span>
                    <div className="h-px flex-1 bg-[var(--cos-border)]" />
                  </div>
                )}
                <div className="flex items-start gap-3 py-3 pl-0 hover:bg-slate-50/50 rounded-lg transition-colors group relative">
                  {/* Timeline dot — colored by category */}
                  <div className={`mt-1.5 h-[10px] w-[10px] shrink-0 rounded-full border-2 border-white relative z-10 shadow-sm ${dotColor}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CategoryBadge category={entry.category} />
                      <h3 className="text-sm font-medium text-[var(--cos-text-primary)]">
                        {entry.title}
                      </h3>
                    </div>
                    {entry.description && (
                      <p className="text-xs text-[var(--cos-text-muted)] mt-1 line-clamp-2">
                        {entry.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--cos-text-muted)]">
                      <span>{timeAgo(entry.createdAt)}</span>
                      {entry.loggedBy && (
                        <>
                          <span>&bull;</span>
                          <span>{entry.loggedBy}</span>
                        </>
                      )}
                      {entry.prNumber && (
                        <>
                          <span>&bull;</span>
                          <a
                            href={`https://github.com/tmtylblog/cosconcept/pull/${entry.prNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[var(--cos-primary)] hover:underline"
                          >
                            PR #{entry.prNumber}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </>
                      )}
                      {entry.commitHash && !entry.prNumber && (
                        <>
                          <span>&bull;</span>
                          <span className="font-mono">
                            {entry.commitHash.slice(0, 7)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
