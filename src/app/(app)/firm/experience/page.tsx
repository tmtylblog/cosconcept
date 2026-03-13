"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Globe,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  Youtube,
  Video,
  Layout,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useCaseStudies, type CaseStudy } from "@/hooks/use-case-studies";
import { CaseStudySubmissionDialog } from "@/components/firm/case-study-submission-dialog";
import {
  classifySourceUrl,
  getSourceTypeLabel,
  type CaseStudySourceType,
} from "@/lib/enrichment/source-classifier";
import { cn } from "@/lib/utils";

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
    submitPdf,
    toggleHidden,
  } = useCaseStudies(activeOrg?.id);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showHidden, setShowHidden] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
    <div className="cos-scrollbar mx-auto max-w-3xl overflow-y-auto p-6">
      {/* Page header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Experience & Case Studies
          </h2>
          <p className="mt-1 text-xs text-cos-slate-dim">
            {total > 0
              ? `${total} case ${total === 1 ? "study" : "studies"} · ${enrichmentResult?.domain ?? "your website"}`
              : "Your portfolio of client work and case studies. Auto-discovered from your website."}
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cos-electric-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Case Study
        </button>
      </div>

      {/* Processing progress bar */}
      {pendingCount > 0 && (
        <div className="mb-4 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
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
        <div className="mb-4 flex items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            {activeCount} case {activeCount === 1 ? "study" : "studies"} indexed
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      )}

      {/* Rich 2-column grid */}
      {!isLoading && displayedCaseStudies.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {displayedCaseStudies.map((cs) => (
            <CaseStudyCard
              key={cs.id}
              caseStudy={cs}
              onToggleHidden={toggleHidden}
            />
          ))}
        </div>
      )}

      {/* Show more button */}
      {hasMore && (
        <div className="mt-4">
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="w-full rounded-cos-lg border border-cos-border/50 bg-white/60 px-4 py-2.5 text-xs font-medium text-cos-slate transition-colors hover:border-cos-electric/30 hover:bg-cos-electric/3 hover:text-cos-electric"
          >
            Show {Math.min(PAGE_SIZE, visibleCaseStudies.length - visibleCount)} more...
          </button>
        </div>
      )}

      {/* Hidden case studies section */}
      {hiddenCaseStudies.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-cos-border/30 pt-4">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="flex items-center gap-2 text-xs font-medium text-cos-slate-dim transition-colors hover:text-cos-midnight"
          >
            {showHidden ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {hiddenCaseStudies.length} hidden case{" "}
            {hiddenCaseStudies.length === 1 ? "study" : "studies"}
          </button>

          {showHidden && (
            <div className="grid grid-cols-1 gap-4 opacity-60 sm:grid-cols-2">
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
          <button
            onClick={() => setShowAddDialog(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cos-electric-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your first case study
          </button>
        </div>
      )}

      {/* Submission dialog */}
      {showAddDialog && (
        <CaseStudySubmissionDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSubmitUrl={submitUrl}
          onSubmitPdf={submitPdf}
          organizationId={activeOrg?.id}
        />
      )}
    </div>
  );
}

// ─── Rich Case Study Card ─────────────────────────────────

interface CaseStudyCardProps {
  caseStudy: CaseStudy;
  onToggleHidden: (id: string) => Promise<void>;
}

function CaseStudyCard({ caseStudy: cs, onToggleHidden }: CaseStudyCardProps) {
  const isPending = cs.status === "pending" || cs.status === "ingesting";
  const isFailed = cs.status === "failed";
  const isActive = cs.status === "active";

  // Determine source type
  const sourceType: CaseStudySourceType = (() => {
    if (cs.sourceType === "pdf_upload" || cs.sourceType === "pdf" || cs.sourceType === "pdf_url") {
      return "pdf_upload";
    }
    if (cs.sourceUrl.startsWith("uploaded:")) return "pdf_upload";
    if (cs.sourceType === "youtube") return "youtube";
    if (cs.sourceType === "vimeo") return "vimeo";
    if (cs.sourceType === "google_slides") return "google_slides";
    if (cs.sourceType === "powerpoint_online") return "powerpoint_online";
    try {
      return classifySourceUrl(cs.sourceUrl);
    } catch {
      return "url";
    }
  })();

  const sourceLabel = getSourceTypeLabel(sourceType);

  // Derive display title
  const displayTitle = cs.title ?? deriveSlugTitle(cs.sourceUrl);

  // Build all tags: skills first, then industries, max 3 total
  const allTags: Array<{ label: string; type: "skill" | "industry" }> = [];
  if (cs.autoTags) {
    cs.autoTags.skills?.forEach((s) => allTags.push({ label: s, type: "skill" }));
    cs.autoTags.industries?.forEach((i) => allTags.push({ label: i, type: "industry" }));
  }
  const displayedTags = allTags.slice(0, 3);
  const overflowCount = allTags.length - displayedTags.length;

  // Evidence strength from cosAnalysis
  const confidence = cs.cosAnalysis?.confidence;
  const evidenceLabel =
    confidence === undefined
      ? null
      : confidence >= 0.8
        ? { label: "Strong", color: "text-cos-signal" }
        : confidence >= 0.5
          ? { label: "Moderate", color: "text-cos-warm" }
          : { label: "Weak", color: "text-cos-slate" };

  // Preview image — prefer previewImageUrl (device mockup), fall back to thumbnailUrl
  const previewUrl = cs.previewImageUrl ?? cs.thumbnailUrl;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-cos-xl border bg-white transition-all duration-200",
        isFailed
          ? "border-cos-ember/20 bg-cos-ember/5"
          : "border-cos-border/60 hover:border-cos-electric/20 hover:shadow-md"
      )}
    >
      {/* Clickable link wrapper — covers the whole card except the hide button */}
      <Link href={`/firm/experience/${cs.id}`} className="block">
        {/* Preview area — 16:9 */}
        <div className="relative aspect-video overflow-hidden">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={displayTitle}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : isPending ? (
            <div className="flex h-full w-full animate-pulse items-center justify-center bg-gradient-to-r from-cos-cloud-dim via-cos-cloud to-cos-cloud-dim">
              <Loader2 className="h-6 w-6 animate-spin text-cos-electric/60" />
            </div>
          ) : (
            <SourcePlaceholderPreview sourceType={sourceType} />
          )}

          {/* Source badge — top-left overlay */}
          <div className="absolute left-2 top-2">
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-cos-midnight backdrop-blur-sm">
              {sourceLabel}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className="px-3 pb-3 pt-2">
          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-cos-midnight">
            {displayTitle}
          </h3>

          {/* Client name */}
          {cs.autoTags?.clientName && (
            <p className="mt-0.5 text-xs text-cos-warm">{cs.autoTags.clientName}</p>
          )}

          {/* Failed error */}
          {isFailed && cs.statusMessage && (
            <div className="mt-1 flex items-start gap-1">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-cos-ember" />
              <p className="text-[10px] leading-snug text-cos-ember">{cs.statusMessage}</p>
            </div>
          )}

          {/* Tags */}
          {!isFailed && displayedTags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {displayedTags.map((tag) => (
                <span
                  key={tag.label}
                  className={cn(
                    "rounded-cos-pill px-2 py-0.5 text-[10px]",
                    tag.type === "skill"
                      ? "bg-cos-electric/10 text-cos-electric"
                      : "bg-cos-signal/10 text-cos-signal"
                  )}
                >
                  {tag.label}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-[10px] text-cos-slate-dim">
                  +{overflowCount} more
                </span>
              )}
            </div>
          )}

          {/* Evidence strength */}
          {isActive && evidenceLabel && (
            <p className={cn("mt-1.5 text-[10px] font-medium", evidenceLabel.color)}>
              ● {evidenceLabel.label}
            </p>
          )}
        </div>
      </Link>

      {/* Hide button — absolute top-right, outside the Link */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleHidden(cs.id);
        }}
        className={cn(
          "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full transition-all",
          "opacity-0 group-hover:opacity-100",
          cs.isHidden
            ? "bg-cos-warm/20 text-cos-warm"
            : "bg-white/90 text-cos-slate-light backdrop-blur-sm hover:text-cos-midnight"
        )}
        title={cs.isHidden ? "Show case study" : "Hide case study"}
      >
        {cs.isHidden ? (
          <EyeOff className="h-3 w-3" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// ─── Source Placeholder Preview ───────────────────────────

function SourcePlaceholderPreview({ sourceType }: { sourceType: CaseStudySourceType }) {
  switch (sourceType) {
    case "youtube":
      return (
        <div className="flex h-full w-full items-center justify-center bg-red-50">
          <Youtube className="h-10 w-10 text-red-500" />
        </div>
      );
    case "vimeo":
      return (
        <div className="flex h-full w-full items-center justify-center bg-blue-50">
          <Video className="h-10 w-10 text-blue-500" />
        </div>
      );
    case "google_slides":
      return (
        <div className="flex h-full w-full items-center justify-center bg-green-50">
          <Layout className="h-10 w-10 text-green-500" />
        </div>
      );
    case "powerpoint_online":
      return (
        <div className="flex h-full w-full items-center justify-center bg-orange-50">
          <FileText className="h-10 w-10 text-orange-500" />
        </div>
      );
    case "pdf_upload":
      return (
        <div className="flex h-full w-full items-center justify-center bg-cos-ember/10">
          <FileText className="h-10 w-10 text-cos-ember" />
        </div>
      );
    default:
      return (
        <div className="flex h-full w-full items-center justify-center bg-cos-midnight/5">
          <Globe className="h-10 w-10 text-cos-slate-light" />
        </div>
      );
  }
}

// ─── Helper ───────────────────────────────────────────────

function deriveSlugTitle(url: string): string {
  if (url.startsWith("manual:")) return "Manual Entry";
  if (url.startsWith("uploaded:")) {
    const filename = url.replace("uploaded:", "").split("/").pop() ?? "Uploaded File";
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
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
