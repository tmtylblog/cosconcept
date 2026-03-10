"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Phone, FileText, Zap, Star } from "lucide-react";

interface Transcript {
  id: string;
  firmId: string | null;
  firmName: string;
  source: "manual" | "recall";
  callType: string;
  processingStatus: string;
  wordCount: number;
  preview: string | null;
  coachingScore: number | null;
  opportunityCount: number;
  createdAt: string;
}

interface Stats {
  total: number;
  processed: number;
  totalOpps: number;
  avgCoaching: number;
}

interface TranscriptData {
  stats: Stats;
  transcripts: Transcript[];
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[var(--cos-border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-[var(--cos-text-muted)]">{label}</span>
        <span className="text-[var(--cos-primary)]">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-[var(--cos-text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--cos-text-muted)] mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
        source === "recall"
          ? "bg-purple-100 text-purple-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {source === "recall" ? <Zap className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
      {source === "recall" ? "Recall.ai" : "Manual"}
    </span>
  );
}

function TranscriptRow({ t }: { t: Transcript }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="py-3 pl-4 pr-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[var(--cos-text-muted)] hover:text-[var(--cos-primary)] transition-colors"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="py-3 px-3">
          <p className="text-sm font-medium text-[var(--cos-text-primary)]">{t.firmName}</p>
          <p className="text-xs text-[var(--cos-text-muted)] font-mono mt-0.5">
            {t.id.slice(0, 20)}…
          </p>
        </td>
        <td className="py-3 px-3">
          <SourceBadge source={t.source} />
        </td>
        <td className="py-3 px-3">
          <span className="text-sm text-[var(--cos-text-secondary)]">
            {t.wordCount.toLocaleString()} words
          </span>
        </td>
        <td className="py-3 px-3">
          <StatusBadge status={t.processingStatus} />
        </td>
        <td className="py-3 px-3">
          {t.opportunityCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--cos-primary)]/10 text-[var(--cos-primary)] rounded text-xs font-medium">
              {t.opportunityCount} opp{t.opportunityCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs text-[var(--cos-text-muted)]">—</span>
          )}
        </td>
        <td className="py-3 px-3">
          {t.coachingScore != null ? (
            <div className="flex items-center gap-1.5">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              <span className="text-sm font-medium text-[var(--cos-text-primary)]">
                {t.coachingScore}
              </span>
            </div>
          ) : (
            <span className="text-xs text-[var(--cos-text-muted)]">—</span>
          )}
        </td>
        <td className="py-3 px-3 text-right">
          <span className="text-xs text-[var(--cos-text-muted)]">
            {new Date(t.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </td>
      </tr>
      {open && t.preview && (
        <tr>
          <td colSpan={8} className="pb-4 px-4">
            <div className="bg-slate-50 rounded-lg border border-[var(--cos-border)] p-4">
              <p className="text-xs font-medium text-[var(--cos-text-muted)] mb-2 uppercase tracking-wide">
                Transcript preview
              </p>
              <p className="text-sm text-[var(--cos-text-secondary)] leading-relaxed whitespace-pre-wrap font-mono">
                {t.preview}
                {t.wordCount > 80 && (
                  <span className="text-[var(--cos-text-muted)] not-italic not-font-mono">
                    {" "}
                    … ({t.wordCount.toLocaleString()} words total)
                  </span>
                )}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminCallsPage() {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"all" | "manual" | "recall">("all");

  const fetchData = async (src: typeof source) => {
    setLoading(true);
    try {
      const params = src !== "all" ? `?source=${src}` : "";
      const res = await fetch(`/api/admin/calls${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(source);
  }, [source]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Phone className="h-5 w-5 text-[var(--cos-primary)]" />
          <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">
            Call Transcripts
          </h1>
        </div>
        <p className="text-sm text-[var(--cos-text-muted)]">
          All processed transcriptions platform-wide — manual pastes and Recall.ai recordings.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Transcripts"
          value={data?.stats.total ?? "—"}
          sub="all time"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Processed"
          value={data ? `${data.stats.processed} / ${data.stats.total}` : "—"}
          sub="analysis complete"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Opps Extracted"
          value={data?.stats.totalOpps ?? "—"}
          sub="from call analysis"
          icon={<Phone className="h-4 w-4" />}
        />
        <StatCard
          label="Avg Coaching Score"
          value={data?.stats.avgCoaching ? `${data.stats.avgCoaching}/100` : "—"}
          sub="across scored calls"
          icon={<Star className="h-4 w-4" />}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "manual", "recall"] as const).map((s) => (
          <Button
            key={s}
            variant={source === s ? "default" : "outline"}
            size="sm"
            onClick={() => setSource(s)}
            className="capitalize"
          >
            {s === "recall" ? "Recall.ai" : s}
          </Button>
        ))}
        {data && (
          <span className="ml-auto text-sm text-[var(--cos-text-muted)]">
            {data.transcripts.length} transcript{data.transcripts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--cos-border)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--cos-text-muted)]">
            Loading…
          </div>
        ) : !data || data.transcripts.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-3 opacity-40" />
            <p className="text-sm text-[var(--cos-text-muted)]">No transcripts found</p>
            <p className="text-xs text-[var(--cos-text-muted)] mt-1">
              Run the seed script or connect Recall.ai to start collecting transcripts
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cos-border)] bg-slate-50/50">
                <th className="w-8 py-3 pl-4" />
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Firm
                </th>
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Source
                </th>
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Length
                </th>
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Status
                </th>
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Opps
                </th>
                <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Score
                </th>
                <th className="py-3 px-3 text-right text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cos-border)]">
              {data.transcripts.map((t) => (
                <TranscriptRow key={t.id} t={t} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
