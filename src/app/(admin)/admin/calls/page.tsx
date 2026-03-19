"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Phone,
  FileText,
  Zap,
  Star,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface Firm {
  id: string;
  name: string;
}

// ─── Stat card ───────────────────────────────────────────────────────────────

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

// ─── Status badges ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${source === "recall" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
      {source === "recall" ? <Zap className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
      {source === "recall" ? "Recall.ai" : "Manual"}
    </span>
  );
}

// ─── Transcript row ───────────────────────────────────────────────────────────

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
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="py-3 px-3">
          <p className="text-sm font-medium text-[var(--cos-text-primary)]">{t.firmName}</p>
          <p className="text-xs text-[var(--cos-text-muted)] font-mono mt-0.5">{t.id.slice(0, 20)}…</p>
        </td>
        <td className="py-3 px-3"><SourceBadge source={t.source} /></td>
        <td className="py-3 px-3">
          <span className="text-sm text-[var(--cos-text-secondary)]">{t.wordCount.toLocaleString()} words</span>
        </td>
        <td className="py-3 px-3"><StatusBadge status={t.processingStatus} /></td>
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
              <span className="text-sm font-medium text-[var(--cos-text-primary)]">{t.coachingScore}</span>
            </div>
          ) : (
            <span className="text-xs text-[var(--cos-text-muted)]">—</span>
          )}
        </td>
        <td className="py-3 px-3 text-right">
          <span className="text-xs text-[var(--cos-text-muted)]">
            {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </td>
      </tr>
      {open && t.preview && (
        <tr>
          <td colSpan={8} className="pb-4 px-4">
            <div className="bg-slate-50 rounded-lg border border-[var(--cos-border)] p-4">
              <p className="text-xs font-medium text-[var(--cos-text-muted)] mb-2 uppercase tracking-wide">Transcript preview</p>
              <p className="text-sm text-[var(--cos-text-secondary)] leading-relaxed whitespace-pre-wrap font-mono">
                {t.preview}
                {t.wordCount > 80 && (
                  <span className="text-[var(--cos-text-muted)] not-italic not-font-mono"> … ({t.wordCount.toLocaleString()} words total)</span>
                )}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

type UploadTab = "paste" | "file";
type UploadState = "idle" | "uploading" | "success" | "error";

interface UploadResult {
  transcriptId: string;
  opportunityCount: number;
  summary: string;
  opportunities: { title: string; priority: string; description: string }[];
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tab, setTab] = useState<UploadTab>("paste");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmSearch, setFirmSearch] = useState("");
  const [selectedFirm, setSelectedFirm] = useState<Firm | null>(null);
  const [showFirmDropdown, setShowFirmDropdown] = useState(false);
  const [clientDomain, setClientDomain] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch firms for picker
  useEffect(() => {
    fetch("/api/admin/calls/firms")
      .then((r) => r.json())
      .then((d) => setFirms(d.firms ?? []))
      .catch(() => {});
  }, []);

  const filteredFirms = firms.filter((f) =>
    f.name.toLowerCase().includes(firmSearch.toLowerCase())
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setFileText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  async function handleSubmit() {
    if (!selectedFirm) { setError("Please select a firm"); return; }
    const text = tab === "paste" ? pasteText : fileText;
    if (!text || text.trim().length < 50) { setError("Transcript must be at least 50 characters"); return; }

    setState("uploading");
    setError("");

    try {
      const res = await fetch("/api/admin/calls/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: selectedFirm.id,
          clientDomain: clientDomain.trim() || undefined,
          text: text.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      setState("success");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[var(--cos-border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cos-border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--cos-text-primary)]">Upload Transcript</h2>
            <p className="text-xs text-[var(--cos-text-muted)] mt-0.5">AI will extract partnership opportunities automatically</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--cos-text-muted)] hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success state */}
        {state === "success" && result && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[var(--cos-text-primary)]">
                  Transcript processed — {result.opportunityCount} opportunit{result.opportunityCount !== 1 ? "ies" : "y"} found
                </p>
                <p className="text-sm text-[var(--cos-text-muted)] mt-1">{result.summary}</p>
              </div>
            </div>
            {result.opportunities.length > 0 && (
              <div className="space-y-2">
                {result.opportunities.map((o, i) => (
                  <div key={i} className="rounded-lg border border-[var(--cos-border)] bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-[var(--cos-text-primary)] line-clamp-1">{o.title}</p>
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${o.priority === "high" ? "bg-red-100 text-red-700" : o.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {o.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--cos-text-muted)] line-clamp-2">{o.description}</p>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        )}

        {/* Form state */}
        {state !== "success" && (
          <div className="p-6 space-y-5">
            {/* Firm selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Firm *</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={selectedFirm ? selectedFirm.name : "Search firm…"}
                  value={selectedFirm ? selectedFirm.name : firmSearch}
                  onChange={(e) => {
                    setSelectedFirm(null);
                    setFirmSearch(e.target.value);
                    setShowFirmDropdown(true);
                  }}
                  onFocus={() => setShowFirmDropdown(true)}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                />
                {showFirmDropdown && filteredFirms.length > 0 && !selectedFirm && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-[var(--cos-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredFirms.slice(0, 20).map((f) => (
                      <button
                        key={f.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                        onClick={() => {
                          setSelectedFirm(f);
                          setFirmSearch("");
                          setShowFirmDropdown(false);
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Client domain */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Client Domain (optional)</label>
              <input
                type="text"
                placeholder="e.g. acme.com"
                value={clientDomain}
                onChange={(e) => setClientDomain(e.target.value)}
                className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
              />
            </div>

            {/* Transcript input tabs */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Transcript *</label>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setTab("paste")}
                  className={`flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "paste" ? "bg-white text-[var(--cos-text-primary)] shadow-sm" : "text-[var(--cos-text-muted)] hover:text-[var(--cos-text-primary)]"}`}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Paste Text
                </button>
                <button
                  onClick={() => setTab("file")}
                  className={`flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "file" ? "bg-white text-[var(--cos-text-primary)] shadow-sm" : "text-[var(--cos-text-muted)] hover:text-[var(--cos-text-primary)]"}`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload File
                </button>
              </div>

              {tab === "paste" ? (
                <textarea
                  rows={8}
                  placeholder="Paste the full transcript here…"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="w-full rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                />
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--cos-border)] py-8 cursor-pointer hover:border-[var(--cos-primary)]/50 transition-colors"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {fileName ? (
                    <div className="text-center">
                      <FileText className="h-8 w-8 text-[var(--cos-primary)] mx-auto mb-2" />
                      <p className="text-sm font-medium text-[var(--cos-text-primary)]">{fileName}</p>
                      <p className="text-xs text-[var(--cos-text-muted)] mt-1">{fileText.split(/\s+/).length.toLocaleString()} words</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-[var(--cos-text-muted)]">Click to upload a .txt file</p>
                      <p className="text-xs text-[var(--cos-text-muted)] mt-1 opacity-60">Plain text only</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {(error || state === "error") && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error || "Something went wrong. Try again."}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleSubmit}
                disabled={state === "uploading"}
                className="flex-1"
              >
                {state === "uploading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Analyze Transcript
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={state === "uploading"}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function AdminCallsPage() {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"all" | "manual" | "recall">("all");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);

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
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Phone className="h-5 w-5 text-[var(--cos-primary)]" />
            <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">Call Transcripts</h1>
          </div>
          <p className="text-sm text-[var(--cos-text-muted)]">
            All processed transcriptions platform-wide — manual pastes and Recall.ai recordings.
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} size="sm">
          <Upload className="mr-1.5 h-4 w-4" />
          Upload Transcript
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Transcripts" value={data?.stats.total ?? "—"} sub="all time" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Processed" value={data ? `${data.stats.processed} / ${data.stats.total}` : "—"} sub="analysis complete" icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Opps Extracted" value={data?.stats.totalOpps ?? "—"} sub="from call analysis" icon={<Phone className="h-4 w-4" />} />
        <StatCard label="Avg Coaching Score" value={data?.stats.avgCoaching ? `${data.stats.avgCoaching}/100` : "—"} sub="across scored calls" icon={<Star className="h-4 w-4" />} />
      </div>

      {/* Filter tabs */}
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[var(--cos-border)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--cos-text-muted)]">Loading…</div>
        ) : !data || data.transcripts.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-8 w-8 text-[var(--cos-text-muted)] mx-auto mb-3 opacity-40" />
            <p className="text-sm text-[var(--cos-text-muted)]">No transcripts found</p>
            <p className="text-xs text-[var(--cos-text-muted)] mt-1">Upload a transcript or connect Recall.ai to start collecting.</p>
            <button onClick={() => setShowUpload(true)} className="mt-4 text-xs font-medium text-[var(--cos-primary)] hover:underline">
              Upload your first transcript →
            </button>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cos-border)] bg-slate-50/50">
                  <th className="w-8 py-3 pl-4" />
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Firm</th>
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Source</th>
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Length</th>
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Status</th>
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Opps</th>
                  <th className="py-3 px-3 text-left text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Score</th>
                  <th className="py-3 px-3 text-right text-xs font-medium text-[var(--cos-text-muted)] uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cos-border)]">
                {data.transcripts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t) => (
                  <TranscriptRow key={t.id} t={t} />
                ))}
              </tbody>
            </table>
            {data.transcripts.length > PAGE_SIZE && (() => {
              const totalPages = Math.ceil(data.transcripts.length / PAGE_SIZE);
              return (
                <div className="flex items-center justify-between border-t border-[var(--cos-border)] px-5 py-3">
                  <span className="text-xs text-[var(--cos-text-muted)]">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.transcripts.length)} of {data.transcripts.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-[var(--cos-border)] px-3 py-1.5 text-xs font-medium text-[var(--cos-text-muted)] transition-colors hover:bg-slate-50 disabled:opacity-40">Previous</button>
                    <span className="text-xs text-[var(--cos-text-muted)]">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-[var(--cos-border)] px-3 py-1.5 text-xs font-medium text-[var(--cos-text-muted)] transition-colors hover:bg-slate-50 disabled:opacity-40">Next</button>
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
          onSuccess={() => {
            setShowUpload(false);
            fetchData(source);
          }}
        />
      )}
    </div>
  );
}
