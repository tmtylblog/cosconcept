"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Globe,
  Search,
  Building2,
  Users,
  ExternalLink,
  ChevronDown,
  Loader2,
  Link2,
  Upload,
  Type,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useLegacyData } from "@/hooks/use-legacy-data";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useCaseStudies, type CaseStudy, type CaseStudyStatus } from "@/hooks/use-case-studies";
import { cn } from "@/lib/utils";
import type { LegacyCaseStudy } from "@/types/cos-data";

const PAGE_SIZE = 25;

type SubmitTab = "url" | "pdf" | "text";

export default function CaseStudiesPage() {
  const { data: activeOrg } = useActiveOrganization();
  const organizationId = activeOrg?.id;

  // Legacy data (existing)
  const {
    caseStudies: legacyCaseStudies,
    totalCaseStudies,
    isLoading: legacyLoading,
  } = useLegacyData(activeOrg?.name);
  const { result } = useEnrichment();
  const discoveredUrls = result?.extracted?.caseStudyUrls ?? [];

  // New case study management
  const {
    caseStudies: activeCaseStudies,
    total: activeTotal,
    isLoading: activeLoading,
    isSubmitting,
    submitError,
    submitUrl,
    submitText,
    submitPdf,
    deleteCaseStudy,
  } = useCaseStudies(organizationId);

  // Legacy search
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return legacyCaseStudies;
    const q = searchQuery.toLowerCase();
    return legacyCaseStudies.filter(
      (cs) =>
        cs.title.toLowerCase().includes(q) ||
        cs.clients.some((c) => c.toLowerCase().includes(q)) ||
        cs.skills.some((s) => s.toLowerCase().includes(q)) ||
        cs.industries.some((i) => i.toLowerCase().includes(q)) ||
        cs.aboutText.toLowerCase().includes(q)
    );
  }, [legacyCaseStudies, searchQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-5 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/firm"
          className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-dim transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">
            Case Studies
          </h2>
          <p className="text-[10px] text-cos-slate-dim">
            {activeLoading || legacyLoading
              ? "Loading..."
              : `${activeTotal} active · ${totalCaseStudies} legacy · ${discoveredUrls.length} discovered`}
          </p>
        </div>
      </div>

      {/* ─── Submission Form ─────────────────────────────────── */}
      <SubmissionForm
        isSubmitting={isSubmitting}
        submitError={submitError}
        onSubmitUrl={submitUrl}
        onSubmitText={submitText}
        onSubmitPdf={submitPdf}
      />

      {/* ─── Active Case Studies ─────────────────────────────── */}
      {activeLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      )}

      {!activeLoading && activeCaseStudies.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
            Your Case Studies ({activeTotal})
          </p>
          {activeCaseStudies.map((cs) => (
            <ActiveCaseStudyCard
              key={cs.id}
              caseStudy={cs}
              onDelete={deleteCaseStudy}
            />
          ))}
        </div>
      )}

      {!activeLoading && activeCaseStudies.length === 0 && !legacyLoading && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface p-5 text-center">
          <Plus className="mx-auto h-6 w-6 text-cos-slate-light" />
          <p className="mt-2 text-xs font-medium text-cos-midnight">
            No case studies yet
          </p>
          <p className="mt-1 text-[10px] text-cos-slate-dim">
            Add a URL, upload a PDF, or paste text above to get started
          </p>
        </div>
      )}

      {/* ─── Discovered from Website ─────────────────────────── */}
      {discoveredUrls.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
            Discovered from Website ({discoveredUrls.length})
          </p>
          <div className="space-y-1">
            {discoveredUrls.map((url: string, i: number) => {
              const shortUrl = url
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "");
              const title =
                shortUrl
                  .split("/")
                  .filter(Boolean)
                  .pop()
                  ?.replace(/[-_]/g, " ") ?? shortUrl;
              return (
                <a
                  key={`disc-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-cos-md bg-cos-cloud-dim/50 px-2.5 py-1.5 transition-colors hover:bg-cos-cloud-dim"
                >
                  <Globe className="h-3 w-3 shrink-0 text-cos-slate-dim" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium capitalize text-cos-midnight">
                      {title}
                    </p>
                    <p className="truncate text-[10px] text-cos-slate-dim">
                      {shortUrl}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-cos-electric" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Legacy Case Studies ──────────────────────────────── */}
      {legacyLoading && activeCaseStudies.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      )}

      {!legacyLoading && legacyCaseStudies.length > 0 && (
        <div className="space-y-2">
          {/* Search (only for legacy) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cos-slate-light" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search legacy case studies..."
              className="w-full rounded-cos-xl border border-cos-border bg-white py-2 pl-9 pr-3 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Legacy Case Studies
            </p>
            {searchQuery && (
              <p className="text-[10px] text-cos-slate-dim">
                {filtered.length} of {legacyCaseStudies.length} shown
              </p>
            )}
          </div>

          {filtered.length > 0 ? (
            <>
              {visible.map((cs) => (
                <LegacyCaseStudyCard key={cs.id} caseStudy={cs} />
              ))}

              {hasMore && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-cos-md border border-cos-border/50 py-2 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/5"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              )}
            </>
          ) : (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 text-center">
              <Search className="mx-auto h-6 w-6 text-cos-slate-light" />
              <p className="mt-2 text-xs text-cos-slate-dim">
                No case studies match &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Submission Form ──────────────────────────────────────

function SubmissionForm({
  isSubmitting,
  submitError,
  onSubmitUrl,
  onSubmitText,
  onSubmitPdf,
}: {
  isSubmitting: boolean;
  submitError: string | null;
  onSubmitUrl: (url: string, notes?: string) => Promise<void>;
  onSubmitText: (text: string, notes?: string) => Promise<void>;
  onSubmitPdf: (file: File, notes?: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<SubmitTab>("url");
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [userNotes, setUserNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = (() => {
    if (isSubmitting) return false;
    switch (activeTab) {
      case "url":
        return urlInput.trim().length > 0;
      case "text":
        return textInput.trim().length >= 100;
      case "pdf":
        return selectedFile !== null;
    }
  })();

  const handleSubmit = useCallback(async () => {
    const notes = userNotes.trim() || undefined;
    switch (activeTab) {
      case "url":
        await onSubmitUrl(urlInput.trim(), notes);
        setUrlInput("");
        break;
      case "text":
        await onSubmitText(textInput.trim(), notes);
        setTextInput("");
        break;
      case "pdf":
        if (selectedFile) {
          await onSubmitPdf(selectedFile, notes);
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
        break;
    }
    setUserNotes("");
    setShowNotes(false);
  }, [activeTab, urlInput, textInput, selectedFile, userNotes, onSubmitUrl, onSubmitText, onSubmitPdf]);

  const tabs: { id: SubmitTab; label: string; icon: typeof Link2 }[] = [
    { id: "url", label: "URL", icon: Link2 },
    { id: "pdf", label: "Upload PDF", icon: Upload },
    { id: "text", label: "Paste Text", icon: Type },
  ];

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-cos-electric" />
        <p className="text-xs font-semibold text-cos-midnight">
          Add Case Study
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-cos-lg bg-cos-cloud-dim p-0.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-cos-md py-1.5 text-[11px] font-medium transition-all",
              activeTab === id
                ? "bg-white text-cos-midnight shadow-sm"
                : "text-cos-slate-dim hover:text-cos-midnight"
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div>
        {activeTab === "url" && (
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://yourfirm.com/case-study/..."
            className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) handleSubmit();
            }}
          />
        )}

        {activeTab === "pdf" && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 10 * 1024 * 1024) {
                    alert("File must be under 10MB");
                    e.target.value = "";
                    return;
                  }
                  setSelectedFile(file);
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-cos-lg border-2 border-dashed py-4 text-xs transition-colors",
                selectedFile
                  ? "border-cos-signal bg-cos-signal/5 text-cos-signal"
                  : "border-cos-border text-cos-slate-dim hover:border-cos-electric hover:text-cos-electric"
              )}
            >
              <Upload className="h-4 w-4" />
              {selectedFile ? selectedFile.name : "Choose PDF file (max 10MB)"}
            </button>
            {selectedFile && (
              <button
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-[10px] text-cos-slate-dim hover:text-cos-ember"
              >
                Remove file
              </button>
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div className="space-y-1">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your case study content here (min 100 characters)..."
              rows={5}
              className="w-full resize-none rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs leading-relaxed text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <p className={cn(
              "text-[10px]",
              textInput.length >= 100 ? "text-cos-signal" : "text-cos-slate-light"
            )}>
              {textInput.length}/100 min characters
            </p>
          </div>
        )}
      </div>

      {/* Optional notes */}
      {showNotes ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-cos-slate-dim">
              Notes (optional)
            </label>
            <button
              onClick={() => { setShowNotes(false); setUserNotes(""); }}
              className="text-[10px] text-cos-slate-light hover:text-cos-slate-dim"
            >
              Hide
            </button>
          </div>
          <input
            type="text"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="e.g., Focus on the AI/ML aspects..."
            className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          className="text-[10px] text-cos-slate-dim hover:text-cos-electric"
        >
          + Add notes
        </button>
      )}

      {/* Error message */}
      {submitError && (
        <div className="flex items-start gap-2 rounded-cos-md bg-cos-ember/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-cos-ember" />
          <p className="text-[11px] text-cos-ember">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-cos-lg py-2.5 text-xs font-semibold transition-all",
          canSubmit
            ? "bg-cos-electric text-white hover:bg-cos-electric-hover active:scale-[0.98]"
            : "bg-cos-cloud-dim text-cos-slate-light cursor-not-allowed"
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Plus className="h-3.5 w-3.5" />
            Submit Case Study
          </>
        )}
      </button>
    </div>
  );
}

// ─── Active Case Study Card ───────────────────────────────

function ActiveCaseStudyCard({
  caseStudy,
  onDelete,
}: {
  caseStudy: CaseStudy;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusConfig: Record<
    CaseStudyStatus,
    { color: string; bg: string; icon: typeof Clock; label: string; pulse?: boolean }
  > = {
    pending: {
      color: "text-cos-warm",
      bg: "bg-cos-warm/10",
      icon: Clock,
      label: "Pending",
    },
    ingesting: {
      color: "text-cos-electric",
      bg: "bg-cos-electric/10",
      icon: Zap,
      label: "Analyzing",
      pulse: true,
    },
    active: {
      color: "text-cos-signal",
      bg: "bg-cos-signal/10",
      icon: CheckCircle2,
      label: "Active",
    },
    blocked: {
      color: "text-cos-warm",
      bg: "bg-cos-warm/10",
      icon: AlertCircle,
      label: "Blocked",
    },
    failed: {
      color: "text-cos-ember",
      bg: "bg-cos-ember/10",
      icon: AlertCircle,
      label: "Failed",
    },
  };

  const status = statusConfig[caseStudy.status];
  const StatusIcon = status.icon;
  const isProcessing = caseStudy.status === "pending" || caseStudy.status === "ingesting";

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    await onDelete(caseStudy.id);
  };

  const sourceIcon = caseStudy.sourceType === "url" ? Globe : caseStudy.sourceType === "text" ? Type : FileText;
  const SourceIcon = sourceIcon;

  return (
    <div className={cn(
      "rounded-cos-lg border bg-cos-surface-raised transition-colors",
      isProcessing ? "border-cos-electric/30" : "border-cos-border/60"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start gap-2">
          <SourceIcon className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            isProcessing ? "text-cos-electric" : "text-cos-slate-dim"
          )} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h4 className="flex-1 text-xs font-semibold leading-snug text-cos-midnight line-clamp-2">
                {caseStudy.title ?? (isProcessing ? "Processing..." : "Untitled")}
              </h4>

              {/* Status badge */}
              <span className={cn(
                "flex shrink-0 items-center gap-1 rounded-cos-pill px-1.5 py-0.5 text-[9px] font-semibold",
                status.bg,
                status.color,
                status.pulse && "animate-pulse"
              )}>
                <StatusIcon className="h-2.5 w-2.5" />
                {status.label}
              </span>
            </div>

            {/* Processing message */}
            {isProcessing && (
              <p className="mt-1 text-[10px] text-cos-electric">
                {caseStudy.status === "pending"
                  ? "Queued for analysis..."
                  : "Extracting content and generating insights..."}
              </p>
            )}

            {/* Error message */}
            {(caseStudy.status === "failed" || caseStudy.status === "blocked") && caseStudy.statusMessage && (
              <p className="mt-1 text-[10px] text-cos-ember">
                {caseStudy.statusMessage}
              </p>
            )}

            {/* Active summary */}
            {caseStudy.status === "active" && caseStudy.summary && (
              <p className="mt-1 text-[10px] leading-relaxed text-cos-slate-dim line-clamp-2">
                {caseStudy.summary}
              </p>
            )}

            {/* Auto-tags preview (collapsed) */}
            {caseStudy.status === "active" && caseStudy.autoTags && !expanded && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {caseStudy.autoTags.clientName && (
                  <span className="flex items-center gap-0.5 rounded-cos-pill bg-cos-midnight/5 px-1.5 py-0.5 text-[9px] text-cos-slate">
                    <Building2 className="h-2 w-2" />
                    {caseStudy.autoTags.clientName}
                  </span>
                )}
                {caseStudy.autoTags.skills.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-electric/8 px-1.5 py-0.5 text-[9px] text-cos-electric"
                  >
                    {s}
                  </span>
                ))}
                {caseStudy.autoTags.skills.length > 3 && (
                  <span className="rounded-cos-pill bg-cos-cloud-dim px-1.5 py-0.5 text-[9px] text-cos-slate-light">
                    +{caseStudy.autoTags.skills.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Expand chevron */}
          {caseStudy.status === "active" && (
            <ChevronDown className={cn(
              "mt-0.5 h-3 w-3 shrink-0 text-cos-slate-light transition-transform",
              expanded && "rotate-180"
            )} />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && caseStudy.status === "active" && (
        <div className="border-t border-cos-border/30 px-3 pb-3 pt-2 space-y-2">
          {/* Full summary */}
          {caseStudy.summary && (
            <p className="text-[11px] leading-relaxed text-cos-slate-dim">
              {caseStudy.summary}
            </p>
          )}

          {/* Client */}
          {caseStudy.autoTags?.clientName && (
            <div className="flex items-center gap-1 text-[10px] text-cos-slate-dim">
              <Building2 className="h-2.5 w-2.5" />
              <span>{caseStudy.autoTags.clientName}</span>
            </div>
          )}

          {/* Skills */}
          {caseStudy.autoTags?.skills && caseStudy.autoTags.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Skills
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.autoTags.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-electric/8 px-2 py-0.5 text-[10px] text-cos-electric"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {caseStudy.autoTags?.industries && caseStudy.autoTags.industries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Industries
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.autoTags.industries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          {caseStudy.autoTags?.services && caseStudy.autoTags.services.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Services
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.autoTags.services.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-cos-pill bg-cos-warm/8 px-2 py-0.5 text-[10px] text-cos-warm"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source URL */}
          {caseStudy.sourceUrl && caseStudy.sourceType === "url" && (
            <a
              href={caseStudy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              View source
            </a>
          )}

          {/* User notes */}
          {caseStudy.userNotes && (
            <div className="rounded-cos-md bg-cos-cloud-dim/50 px-2.5 py-1.5">
              <p className="text-[10px] italic text-cos-slate-dim">
                &ldquo;{caseStudy.userNotes}&rdquo;
              </p>
            </div>
          )}

          {/* Delete action */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 rounded-cos-md px-2 py-1 text-[10px] text-cos-slate-dim transition-colors hover:bg-cos-ember/5 hover:text-cos-ember"
            >
              {deleting ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Trash2 className="h-2.5 w-2.5" />
              )}
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Delete button for non-active items (failed/blocked) */}
      {(caseStudy.status === "failed" || caseStudy.status === "blocked") && (
        <div className="flex justify-end border-t border-cos-border/30 px-3 py-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1 rounded-cos-md px-2 py-1 text-[10px] text-cos-slate-dim transition-colors hover:bg-cos-ember/5 hover:text-cos-ember"
          >
            {deleting ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Trash2 className="h-2.5 w-2.5" />
            )}
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Legacy Case Study Card (preserved) ───────────────────

function LegacyCaseStudyCard({ caseStudy }: { caseStudy: LegacyCaseStudy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-slate-dim" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h4 className="flex-1 text-xs font-semibold leading-snug text-cos-midnight line-clamp-2">
                {caseStudy.title}
              </h4>
              <span className="shrink-0 rounded-cos-pill bg-cos-warm/10 px-1.5 py-0.5 text-[9px] font-semibold text-cos-warm">
                For Review
              </span>
            </div>

            {/* Client names */}
            {caseStudy.clients.length > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-cos-slate-dim">
                <Building2 className="h-2.5 w-2.5" />
                <span className="truncate">
                  {caseStudy.clients.join(", ")}
                </span>
              </div>
            )}

            {/* Contributors */}
            {caseStudy.contributorNames.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-slate-dim">
                <Users className="h-2.5 w-2.5" />
                <span className="truncate">
                  {caseStudy.contributorNames.slice(0, 3).join(", ")}
                  {caseStudy.contributorNames.length > 3 &&
                    ` +${caseStudy.contributorNames.length - 3}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-cos-border/30 pt-2">
          {/* About text */}
          {caseStudy.aboutText && (
            <p className="text-[11px] leading-relaxed text-cos-slate-dim">
              {caseStudy.aboutText}
            </p>
          )}

          {/* Skills */}
          {caseStudy.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Skills
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {caseStudy.industries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Industries
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.industries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Markets */}
          {caseStudy.markets.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-cos-slate-dim">
              <Globe className="h-2.5 w-2.5" />
              Markets: {caseStudy.markets.join(", ")}
            </div>
          )}

          {/* External links */}
          {caseStudy.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {caseStudy.links.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  View source
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
