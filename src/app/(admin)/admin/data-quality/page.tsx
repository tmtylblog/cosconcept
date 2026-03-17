"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Globe,
  Users,
  Wrench,
  FileText,
  UserCheck,
  Loader2,
  Shield,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FirmQuality {
  firmId: string;
  orgId: string;
  firmName: string;
  orgName: string;
  website: string | null;
  createdAt: string;
  score: number;
  flags: string[];
  stats: {
    services: number;
    caseStudies: number;
    experts: number;
    hasEnrichment: boolean;
    hasGraph: boolean;
    hasAbstraction: boolean;
    memberCount: number;
  };
}

interface QualityData {
  totalFirms: number;
  flaggedCount: number;
  likelyTestCount: number;
  firms: FirmQuality[];
}

type FilterMode = "all" | "flagged" | "likely-test" | "no-website" | "healthy";

export default function DataQualityPage() {
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("flagged");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/data-quality")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleSelect(orgId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  function selectAllVisible() {
    const visible = getFilteredFirms();
    setSelected((prev) => {
      if (prev.size === visible.length && visible.every((f) => prev.has(f.orgId))) {
        return new Set();
      }
      return new Set(visible.map((f) => f.orgId));
    });
  }

  function getFilteredFirms(): FirmQuality[] {
    if (!data) return [];
    let firms = data.firms;

    switch (filter) {
      case "flagged":
        firms = firms.filter((f) => f.flags.length > 0);
        break;
      case "likely-test":
        firms = firms.filter((f) => f.score <= 10);
        break;
      case "no-website":
        firms = firms.filter((f) => !f.website);
        break;
      case "healthy":
        firms = firms.filter((f) => f.score >= 50 && f.flags.length === 0);
        break;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      firms = firms.filter(
        (f) =>
          f.firmName.toLowerCase().includes(q) ||
          f.orgName.toLowerCase().includes(q) ||
          (f.website && f.website.toLowerCase().includes(q))
      );
    }

    return firms;
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    const orgIds = Array.from(selected);
    const confirmMsg = `Permanently delete ${orgIds.length} organization(s) and ALL their data (firms, experts, case studies, graph nodes)?\n\nThis cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setDeleteResult(null);

    // Delete one at a time to avoid Vercel timeout
    let deleted = 0;
    let failedCount = 0;

    for (let i = 0; i < orgIds.length; i++) {
      setDeleteResult(`Deleting ${i + 1} of ${orgIds.length}...`);
      try {
        const res = await fetch("/api/admin/data-quality/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgIds: [orgIds[i]] }),
        });
        if (res.ok) {
          deleted++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    setDeleteResult(
      `Deleted ${deleted} of ${orgIds.length} organizations.${failedCount > 0 ? ` ${failedCount} failed.` : ""}`
    );
    setSelected(new Set());
    setDeleting(false);

    // Refresh data
    try {
      const refreshRes = await fetch("/api/admin/data-quality");
      if (refreshRes.ok) setData(await refreshRes.json());
    } catch { /* ignore */ }
  }

  const filtered = getFilteredFirms();
  const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.orgId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        <span className="ml-2 text-sm text-cos-slate">Scoring all firms...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 p-4 text-sm text-cos-ember">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">Data Quality</h1>
        <p className="mt-1 text-sm text-cos-slate">
          Review and clean up test accounts, abandoned signups, and junk data.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Firms"
          value={data.totalFirms}
          icon={<Shield className="h-4 w-4" />}
          color="text-cos-electric"
          bg="bg-cos-electric/10"
        />
        <SummaryCard
          label="Flagged"
          value={data.flaggedCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-cos-warm"
          bg="bg-cos-warm/10"
        />
        <SummaryCard
          label="Likely Test/Junk"
          value={data.likelyTestCount}
          icon={<XCircle className="h-4 w-4" />}
          color="text-cos-ember"
          bg="bg-cos-ember/10"
        />
        <SummaryCard
          label="Healthy"
          value={data.totalFirms - data.flaggedCount}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-cos-signal"
          bg="bg-cos-signal/10"
        />
      </div>

      {/* Filters + Search + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-cos-lg border border-cos-border overflow-hidden">
          {(
            [
              ["flagged", "Flagged"],
              ["likely-test", "Likely Test"],
              ["no-website", "No Website"],
              ["all", "All"],
              ["healthy", "Healthy"],
            ] as [FilterMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-cos-border last:border-r-0 ${
                filter === key
                  ? "bg-cos-electric text-white"
                  : "bg-white text-cos-slate hover:bg-cos-cloud"
              }`}
            >
              {label}
              {key === "flagged" && ` (${data.flaggedCount})`}
              {key === "likely-test" && ` (${data.likelyTestCount})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 text-cos-slate" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search firms..."
            className="flex-1 bg-transparent text-xs text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
          />
        </div>

        {selected.size > 0 && (
          <Button
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-cos-ember hover:bg-cos-ember/90 text-xs ml-auto"
          >
            {deleting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Delete {selected.size} Selected
          </Button>
        )}
      </div>

      {/* Delete result */}
      {deleteResult && (
        <div
          className={`flex items-center gap-2 rounded-cos-lg px-3 py-2 text-xs font-medium ${
            deleteResult.startsWith("Error")
              ? "border border-cos-ember/20 bg-cos-ember/5 text-cos-ember"
              : "border border-cos-signal/20 bg-cos-signal/5 text-cos-signal"
          }`}
        >
          {deleteResult.startsWith("Error") ? (
            <XCircle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          )}
          {deleteResult}
        </div>
      )}

      {/* Firms table */}
      <div className="overflow-hidden rounded-cos-xl border border-cos-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cos-border bg-cos-cloud/50">
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={selectAllVisible}
                  className="rounded border-cos-border"
                />
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Score
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Firm / Org
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                <Globe className="h-3 w-3 inline" />
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                <Wrench className="h-3 w-3 inline" />
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                <FileText className="h-3 w-3 inline" />
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                <UserCheck className="h-3 w-3 inline" />
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                <Users className="h-3 w-3 inline" />
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border/60">
            {filtered.map((firm) => (
              <tr
                key={firm.firmId}
                className={`hover:bg-cos-electric/[0.02] ${
                  selected.has(firm.orgId) ? "bg-cos-ember/5" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(firm.orgId)}
                    onChange={() => toggleSelect(firm.orgId)}
                    className="rounded border-cos-border"
                  />
                </td>
                <td className="px-3 py-2">
                  <ScoreBadge score={firm.score} />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-cos-midnight text-sm">{firm.firmName}</div>
                  <div className="text-[10px] text-cos-slate-light">
                    {firm.orgName}
                    {firm.website && (
                      <span className="ml-2 text-cos-slate">{firm.website}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  {firm.website ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-cos-signal inline" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-cos-ember inline" />
                  )}
                </td>
                <td className="px-3 py-2 text-center text-xs text-cos-midnight">
                  {firm.stats.services || <span className="text-cos-slate-light">&mdash;</span>}
                </td>
                <td className="px-3 py-2 text-center text-xs text-cos-midnight">
                  {firm.stats.caseStudies || <span className="text-cos-slate-light">&mdash;</span>}
                </td>
                <td className="px-3 py-2 text-center text-xs text-cos-midnight">
                  {firm.stats.experts || <span className="text-cos-slate-light">&mdash;</span>}
                </td>
                <td className="px-3 py-2 text-center text-xs text-cos-midnight">
                  {firm.stats.memberCount}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {firm.flags.map((flag) => (
                      <span
                        key={flag}
                        className={`inline-block rounded-cos-pill px-1.5 py-0.5 text-[10px] font-medium ${
                          flag === "Test/demo name pattern"
                            ? "bg-cos-ember/10 text-cos-ember"
                            : flag === "No website"
                            ? "bg-cos-warm/10 text-cos-warm"
                            : "bg-cos-slate/10 text-cos-slate"
                        }`}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-cos-slate">
            {filter === "healthy"
              ? "No healthy firms found."
              : filter === "flagged"
              ? "No flagged firms. Your data is clean!"
              : "No firms match this filter."}
          </div>
        )}
      </div>

      <p className="text-[10px] text-cos-slate-light">
        Showing {filtered.length} of {data.totalFirms} firms.
        Score: website (+25), enrichment (+15), services (+15), case studies (+10), experts (+10), graph (+10), abstraction (+5), multi-member (+10).
        Penalties: test name (-40), no website (-20), short name (-20).
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-cos-lg ${bg} ${color} mb-2`}>
        {icon}
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-bold text-cos-midnight">{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 60
      ? "bg-cos-signal/10 text-cos-signal"
      : score >= 30
      ? "bg-cos-warm/10 text-cos-warm"
      : "bg-cos-ember/10 text-cos-ember";

  return (
    <span className={`inline-flex items-center justify-center rounded-cos-pill px-2 py-0.5 text-[11px] font-bold ${color} min-w-[2rem]`}>
      {score}
    </span>
  );
}
