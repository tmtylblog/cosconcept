"use client";

import { useState } from "react";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Globe,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  Link as LinkIcon,
  Upload,
  Type,
  X,
  ImageIcon,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useCaseStudies, type CaseStudy } from "@/hooks/use-case-studies";

const PAGE_SIZE = 25;

export default function FirmExperiencePage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status: enrichmentStatus, result: enrichmentResult } = useEnrichment();
  const {
    caseStudies,
    total,
    hiddenCount,
    isLoading,
    isSubmitting,
    submitError,
    submitUrl,
    submitText,
    submitPdf,
    toggleHidden,
  } = useCaseStudies(activeOrg?.id);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showHidden, setShowHidden] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Split visible / hidden
  const visibleCaseStudies = caseStudies.filter((cs) => !cs.isHidden);
  const hiddenCaseStudies = caseStudies.filter((cs) => cs.isHidden);

  // Count by status
  const pendingCount = caseStudies.filter(
    (cs) => cs.status === "pending" || cs.status === "ingesting"
  ).length;
  const activeCount = caseStudies.filter((cs) => cs.status === "active").length;
  const failedCount = caseStudies.filter((cs) => cs.status === "failed").length;

  // Paginate visible
  const displayedCaseStudies = visibleCaseStudies.slice(0, visibleCount);
  const hasMore = visibleCaseStudies.length > visibleCount;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Experience & Case Studies
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          {total > 0
            ? `${total} case ${total === 1 ? "study" : "studies"} from ${enrichmentResult?.domain ?? "your website"}. These demonstrate your ground truth capabilities.`
            : "Your portfolio of client work and case studies. Auto-discovered from your website."}
        </p>
      </div>

      {/* Processing progress bar */}
      {pendingCount > 0 && (
        <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
              <p className="text-sm font-medium text-cos-electric">
                Processing: {pendingCount} pending
              </p>
            </div>
            <p className="text-xs text-cos-electric/70">
              {activeCount}/{total} done
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cos-electric/10">
            <div
              className="h-full rounded-full bg-cos-electric transition-all duration-500"
              style={{ width: `${total > 0 ? (activeCount / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Success banner (when all done) */}
      {total > 0 && pendingCount === 0 && !isLoading && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            {activeCount} case {activeCount === 1 ? "study" : "studies"} indexed
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
          </p>
        </div>
      )}

      {/* Source indicator */}
      {enrichmentResult?.domain && total > 0 && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border/50 bg-white/60 px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-cos-slate-dim" />
          <p className="text-[11px] text-cos-slate-dim">
            Auto-discovered from{" "}
            <span className="font-medium text-cos-midnight">{enrichmentResult.domain}</span>
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      )}

      {/* Case study cards */}
      <div className="space-y-3">
        {displayedCaseStudies.map((cs) => (
          <CaseStudyCard
            key={cs.id}
            caseStudy={cs}
            onToggleHidden={toggleHidden}
          />
        ))}
      </div>

      {/* Show more button */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
          className="w-full rounded-cos-lg border border-cos-border/50 bg-white/60 px-4 py-2.5 text-xs font-medium text-cos-slate transition-colors hover:border-cos-electric/30 hover:bg-cos-electric/3 hover:text-cos-electric"
        >
          Show {Math.min(PAGE_SIZE, visibleCaseStudies.length - visibleCount)} more...
        </button>
      )}

      {/* Hidden case studies section */}
      {hiddenCaseStudies.length > 0 && (
        <div className="space-y-3 border-t border-cos-border/30 pt-4">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="flex items-center gap-2 text-xs font-medium text-cos-slate-dim transition-colors hover:text-cos-midnight"
          >
            {showHidden ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {hiddenCaseStudies.length} hidden case {hiddenCaseStudies.length === 1 ? "study" : "studies"}
          </button>

          {showHidden && (
            <div className="space-y-3 opacity-60">
              {hiddenCaseStudies.map((cs) => (
                <CaseStudyCard
                  key={cs.id}
                  caseStudy={cs}
                  onToggleHidden={toggleHidden}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add case study manually — collapsible section */}
      <div className="border-t border-cos-border/30 pt-4">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 text-xs font-medium text-cos-slate-dim transition-colors hover:text-cos-midnight"
        >
          <Plus className="h-3.5 w-3.5" />
          Add case study manually
        </button>

        {showAddForm && (
          <AddCaseStudyForm
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmitUrl={submitUrl}
            onSubmitText={submitText}
            onSubmitPdf={submitPdf}
            onClose={() => setShowAddForm(false)}
          />
        )}
      </div>

      {/* Empty state */}
      {total === 0 && !isLoading && enrichmentStatus !== "loading" && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No case studies yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Case studies will be auto-discovered from your website after onboarding.
            They are the gold standard for partner matching.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Case Study Card Component ───────────────────────────

function CaseStudyCard({
  caseStudy,
  onToggleHidden,
}: {
  caseStudy: CaseStudy;
  onToggleHidden: (id: string) => Promise<void>;
}) {
  const isPending = caseStudy.status === "pending" || caseStudy.status === "ingesting";
  const isFailed = caseStudy.status === "failed";

  // Extract display URL
  const displayUrl = caseStudy.sourceUrl
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  // Try to derive a title from URL slug if no title yet
  const displayTitle = caseStudy.title || deriveSlugTitle(caseStudy.sourceUrl);

  return (
    <div className={`rounded-cos-xl border transition-all ${
      isPending
        ? "border-cos-electric/20 bg-cos-electric/3"
        : isFailed
          ? "border-cos-ember/20 bg-cos-ember/3"
          : caseStudy.isHidden
            ? "border-cos-border/30 bg-cos-surface-raised"
            : "border-cos-border/60 bg-cos-surface-raised hover:border-cos-electric/20"
    }`}>
      <div className="flex gap-3 p-3">
        {/* Thumbnail or placeholder */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-cos-md bg-cos-midnight/5">
          {caseStudy.thumbnailUrl ? (
            <img
              src={caseStudy.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          ) : isFailed ? (
            <AlertCircle className="h-5 w-5 text-cos-ember" />
          ) : (
            <ImageIcon className="h-5 w-5 text-cos-slate-light" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <h3 className={`text-sm font-semibold leading-tight ${
            isPending ? "text-cos-slate" : "text-cos-midnight"
          }`}>
            {displayTitle}
            {isPending && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-cos-electric">
                <Loader2 className="h-3 w-3 animate-spin" /> Processing...
              </span>
            )}
          </h3>

          {/* Failed message */}
          {isFailed && caseStudy.statusMessage && (
            <p className="mt-0.5 text-[10px] leading-snug text-cos-ember">
              {caseStudy.statusMessage}
            </p>
          )}

          {/* Auto-tags: skills, industries, markets, clients, languages */}
          {caseStudy.autoTags && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {/* Client name */}
              {caseStudy.autoTags.clientName && (
                <span className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
                  {caseStudy.autoTags.clientName}
                </span>
              )}
              {/* Skills */}
              {caseStudy.autoTags.skills?.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] text-cos-electric"
                >
                  {skill}
                </span>
              ))}
              {/* Industries */}
              {caseStudy.autoTags.industries?.slice(0, 2).map((ind) => (
                <span
                  key={ind}
                  className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] text-cos-signal"
                >
                  {ind}
                </span>
              ))}
              {/* Markets */}
              {caseStudy.autoTags.markets?.slice(0, 2).map((m) => (
                <span
                  key={m}
                  className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                >
                  {m}
                </span>
              ))}
              {/* Languages */}
              {caseStudy.autoTags.languages?.slice(0, 2).map((l) => (
                <span
                  key={l}
                  className="rounded-cos-pill bg-purple-50 px-2 py-0.5 text-[10px] text-purple-600"
                >
                  {l}
                </span>
              ))}
            </div>
          )}

          {/* Source link */}
          {!caseStudy.sourceUrl.startsWith("manual:") && !caseStudy.sourceUrl.startsWith("uploaded:") && (
            <a
              href={caseStudy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1 text-[10px] text-cos-electric transition-colors hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="max-w-[250px] truncate">{displayUrl}</span>
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-start">
          <button
            onClick={() => onToggleHidden(caseStudy.id)}
            className={`flex h-7 w-7 items-center justify-center rounded-cos-md transition-colors ${
              caseStudy.isHidden
                ? "text-cos-warm hover:bg-cos-warm/10"
                : "text-cos-slate-light hover:bg-cos-cloud-dim hover:text-cos-midnight"
            }`}
            title={caseStudy.isHidden ? "Show case study" : "Hide case study"}
          >
            {caseStudy.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Case Study Form ─────────────────────────────────

function AddCaseStudyForm({
  isSubmitting,
  submitError,
  onSubmitUrl,
  onSubmitText,
  onSubmitPdf,
  onClose,
}: {
  isSubmitting: boolean;
  submitError: string | null;
  onSubmitUrl: (url: string, userNotes?: string) => Promise<void>;
  onSubmitText: (text: string, userNotes?: string) => Promise<void>;
  onSubmitPdf: (file: File, userNotes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"url" | "text" | "pdf">("url");
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);

  const handleSubmit = async () => {
    if (mode === "url" && urlInput.trim()) {
      await onSubmitUrl(urlInput.trim());
      setUrlInput("");
    } else if (mode === "text" && textInput.trim()) {
      await onSubmitText(textInput.trim());
      setTextInput("");
    } else if (mode === "pdf" && fileInput) {
      await onSubmitPdf(fileInput);
      setFileInput(null);
    }
  };

  return (
    <div className="mt-3 rounded-cos-xl border border-cos-border/60 bg-cos-surface-raised p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["url", "text", "pdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 rounded-cos-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                mode === m
                  ? "bg-cos-electric/10 text-cos-electric"
                  : "text-cos-slate-dim hover:bg-cos-cloud-dim hover:text-cos-midnight"
              }`}
            >
              {m === "url" && <LinkIcon className="h-3 w-3" />}
              {m === "text" && <Type className="h-3 w-3" />}
              {m === "pdf" && <Upload className="h-3 w-3" />}
              {m === "url" ? "URL" : m === "text" ? "Text" : "PDF"}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-cos-md text-cos-slate-light transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3">
        {mode === "url" && (
          <div>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://yoursite.com/case-study/acme"
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
            />
            <p className="mt-1 text-[10px] text-cos-slate-light">
              Works with website URLs, Google Docs, Google Slides, and other cloud links.
            </p>
          </div>
        )}
        {mode === "text" && (
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste case study text here (minimum 100 characters)..."
            className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
            rows={4}
          />
        )}
        {mode === "pdf" && (
          <div>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  const blocked = ["pptx", "ppt", "key", "keynote"];
                  if (blocked.includes(ext ?? "")) {
                    alert("PowerPoint and Keynote files are not supported. Please export as PDF first.");
                    e.target.value = "";
                    setFileInput(null);
                    return;
                  }
                  setFileInput(file);
                }
              }}
              className="flex-1 text-xs text-cos-slate file:mr-2 file:rounded-cos-md file:border-0 file:bg-cos-electric/10 file:px-2.5 file:py-1 file:text-[10px] file:font-semibold file:text-cos-electric"
            />
            <p className="mt-1 text-[10px] text-cos-slate-light">
              PDF files only. Export from PowerPoint or Keynote to PDF first.
            </p>
          </div>
        )}
      </div>

      {submitError && (
        <p className="mt-2 text-[10px] text-cos-ember">{submitError}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="mt-3 flex items-center gap-1.5 rounded-cos-md bg-cos-electric px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-cos-electric/90 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add Case Study
      </button>
    </div>
  );
}

// ─── Helper ──────────────────────────────────────────────

/** Derive a readable title from a URL slug (e.g., /work/acme-rebrand → "Acme Rebrand") */
function deriveSlugTitle(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.split("/").filter(Boolean).pop() ?? "";
    if (!slug) return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return url;
  }
}
