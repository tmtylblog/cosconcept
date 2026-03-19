"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Phone,
  FileText,
  Zap,
  Star,
  Upload,
  Settings,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

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

interface RecallStatus {
  configured: boolean;
  apiKeySet: boolean;
  webhookSecretSet: boolean;
  apiReachable: boolean;
}

interface FirmOption {
  id: string;
  name: string;
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

function RecallStatusBadge({ status }: { status: RecallStatus | null }) {
  if (!status) return null;

  if (status.configured && status.apiReachable) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Recall.ai Connected
      </span>
    );
  }
  if (status.apiKeySet) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Recall.ai Partially Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-600">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Recall.ai Not Configured
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
            {t.id.slice(0, 20)}&hellip;
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
            <span className="text-xs text-[var(--cos-text-muted)]">&mdash;</span>
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
            <span className="text-xs text-[var(--cos-text-muted)]">&mdash;</span>
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
                  <span className="text-[var(--cos-text-muted)]">
                    {" "}
                    &hellip; ({t.wordCount.toLocaleString()} words total)
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

// ─── Upload Modal ──────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [firmId, setFirmId] = useState("");
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ status: string; wordCount: number } | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch firm list from admin calls data (reuse existing endpoint)
    fetch("/api/admin/calls?limit=300")
      .then((r) => r.json())
      .then((d) => {
        if (d.transcripts) {
          const seen = new Map<string, string>();
          for (const t of d.transcripts as { firmId: string | null; firmName: string }[]) {
            if (t.firmId && t.firmName && !seen.has(t.firmId)) {
              seen.set(t.firmId, t.firmName);
            }
          }
          setFirms(Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(() => {});
  }, []);

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");

    if (file.name.endsWith(".txt")) {
      const content = await file.text();
      setText(content);
    } else if (file.name.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setText(result.value);
      } catch {
        setError("Failed to parse .docx file");
      }
    } else {
      setError("Unsupported file type. Use .txt or .docx");
    }
  };

  const handleSubmit = async () => {
    if (text.length < 100) {
      setError("Transcript too short (min 100 characters)");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/calls/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          firmId: firmId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Upload failed");
        return;
      }
      const data = await res.json();
      setResult({ status: data.status, wordCount: data.wordCount });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--cos-border)]">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[var(--cos-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--cos-text-primary)]">Upload Transcript</h2>
          </div>
          <button onClick={onClose} className="text-[var(--cos-text-muted)] hover:text-[var(--cos-text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-medium text-[var(--cos-text-primary)]">Transcript Uploaded</p>
              <p className="text-sm text-[var(--cos-text-muted)] mt-1">
                {result.wordCount.toLocaleString()} words &mdash; opportunity extraction is processing in the background.
              </p>
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("paste")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === "paste"
                      ? "bg-[var(--cos-primary)] text-white"
                      : "bg-slate-100 text-[var(--cos-text-secondary)] hover:bg-slate-200"
                  }`}
                >
                  Paste Text
                </button>
                <button
                  onClick={() => setMode("file")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === "file"
                      ? "bg-[var(--cos-primary)] text-white"
                      : "bg-slate-100 text-[var(--cos-text-secondary)] hover:bg-slate-200"
                  }`}
                >
                  Upload File
                </button>
              </div>

              {/* Input area */}
              {mode === "paste" ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your call transcript here..."
                  rows={12}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-4 py-3 text-sm font-mono text-[var(--cos-text-primary)] placeholder:text-[var(--cos-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30 focus:border-[var(--cos-primary)] resize-y"
                />
              ) : (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--cos-border)] rounded-lg p-8 text-center cursor-pointer hover:border-[var(--cos-primary)]/50 hover:bg-slate-50 transition-colors"
                  >
                    <Upload className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--cos-text-secondary)]">
                      Click to select a <strong>.txt</strong> or <strong>.docx</strong> file
                    </p>
                    {fileName && (
                      <p className="text-xs text-[var(--cos-primary)] mt-2 font-medium">{fileName}</p>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.docx"
                    onChange={handleFile}
                    className="hidden"
                  />
                  {text && (
                    <div className="bg-slate-50 rounded-lg p-3 border border-[var(--cos-border)]">
                      <p className="text-xs text-[var(--cos-text-muted)] mb-1">Preview (first 300 chars):</p>
                      <p className="text-sm text-[var(--cos-text-secondary)] font-mono whitespace-pre-wrap">
                        {text.slice(0, 300)}{text.length > 300 ? "..." : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Word count */}
              {text && (
                <p className="text-xs text-[var(--cos-text-muted)]">
                  {wordCount.toLocaleString()} words &bull; {text.length.toLocaleString()} characters
                </p>
              )}

              {/* Firm selector */}
              <div>
                <label className="block text-xs font-medium text-[var(--cos-text-muted)] mb-1">
                  Associate with firm (optional)
                </label>
                <select
                  value={firmId}
                  onChange={(e) => setFirmId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm text-[var(--cos-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                >
                  <option value="">No firm selected</option>
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={uploading || text.length < 100}
                >
                  {uploading ? "Uploading..." : "Upload & Analyze"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function AdminCallsPage() {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"all" | "manual" | "recall">("all");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [recallStatus, setRecallStatus] = useState<RecallStatus | null>(null);

  const fetchData = useCallback(async (src: typeof source) => {
    setLoading(true);
    try {
      const params = src !== "all" ? `?source=${src}` : "";
      const res = await fetch(`/api/admin/calls${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(source);
  }, [source, fetchData]);

  useEffect(() => {
    fetch("/api/admin/calls/recall-status")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setRecallStatus(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Phone className="h-5 w-5 text-[var(--cos-primary)]" />
          <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">
            Call Transcripts
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <RecallStatusBadge status={recallStatus} />
            <Link
              href="/admin/calls/settings"
              className="text-[var(--cos-text-muted)] hover:text-[var(--cos-primary)] transition-colors"
              title="Call settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <p className="text-sm text-[var(--cos-text-muted)]">
          All processed transcriptions platform-wide &mdash; manual pastes and Recall.ai recordings.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Transcripts"
          value={data?.stats.total ?? "\u2014"}
          sub="all time"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Processed"
          value={data ? `${data.stats.processed} / ${data.stats.total}` : "\u2014"}
          sub="analysis complete"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Opps Extracted"
          value={data?.stats.totalOpps ?? "\u2014"}
          sub="from call analysis"
          icon={<Phone className="h-4 w-4" />}
        />
        <StatCard
          label="Avg Coaching Score"
          value={data?.stats.avgCoaching ? `${data.stats.avgCoaching}/100` : "\u2014"}
          sub="across scored calls"
          icon={<Star className="h-4 w-4" />}
        />
      </div>

      {/* Filter tabs + Upload button */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "manual", "recall"] as const).map((s) => (
          <Button
            key={s}
            variant={source === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setSource(s); setPage(1); }}
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
        <Button
          size="sm"
          onClick={() => setShowUpload(true)}
          className={data ? "" : "ml-auto"}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload Transcript
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--cos-border)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--cos-text-muted)]">
            Loading&hellip;
          </div>
        ) : !data || data.transcripts.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-3 opacity-40" />
            <p className="text-sm text-[var(--cos-text-muted)]">No transcripts found</p>
            <p className="text-xs text-[var(--cos-text-muted)] mt-1">
              Upload a transcript or connect Recall.ai to start collecting transcripts
            </p>
          </div>
        ) : (
          <>
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
              {data.transcripts
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((t) => (
                  <TranscriptRow key={t.id} t={t} />
                ))}
            </tbody>
          </table>
          {data.transcripts.length > PAGE_SIZE && (() => {
            const totalPages = Math.ceil(data.transcripts.length / PAGE_SIZE);
            return (
              <div className="flex items-center justify-between border-t border-[var(--cos-border)] px-5 py-3">
                <span className="text-xs text-[var(--cos-text-muted)]">
                  Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, data.transcripts.length)} of {data.transcripts.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-[var(--cos-border)] px-3 py-1.5 text-xs font-medium text-[var(--cos-text-muted)] transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-[var(--cos-text-muted)]">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-[var(--cos-border)] px-3 py-1.5 text-xs font-medium text-[var(--cos-text-muted)] transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
          </>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => fetchData(source)}
        />
      )}
    </div>
  );
}
