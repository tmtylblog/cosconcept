"use client";

import { useState, useRef, useEffect } from "react";
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
  Ban,
  Undo2,
} from "lucide-react";
import { authClient, useActiveOrganization, useSession } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useCaseStudies, type CaseStudy } from "@/hooks/use-case-studies";
import { useOssyContext } from "@/hooks/use-ossy-context";
import { emitOssyEvent } from "@/lib/ossy-events";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function FirmExperiencePage() {
  const { data: activeOrg } = useActiveOrganization();
  const { data: session } = useSession();
  const { status: enrichmentStatus, result: enrichmentResult, triggerEnrichment } = useEnrichment();

  // Self-healing: useActiveOrganization() often doesn't re-render after
  // setActive(), so resolve the orgId ourselves (same pattern as experts page)
  const [resolvedOrgId, setResolvedOrgId] = useState<string>("");
  const orgId = activeOrg?.id || resolvedOrgId;
  const orgActivationAttempted = useRef(false);

  useEffect(() => {
    if (orgId || orgActivationAttempted.current) return;
    orgActivationAttempted.current = true;
    (async () => {
      try {
        const { data: orgs } = await authClient.organization.list();
        const orgList = (orgs as { id: string }[]) ?? [];
        if (orgList.length > 0) {
          await authClient.organization.setActive({ organizationId: orgList[0].id });
          setResolvedOrgId(orgList[0].id);
        }
      } catch (err) {
        console.error("[Experience] Failed to auto-activate org:", err);
      }
    })();
  }, [orgId]);

  const {
    caseStudies,
    total,
    hiddenCount,
    isLoading,
    isDiscovering,
    isSubmitting,
    submitError,
    submitUrl,
    submitText,
    submitPdf,
    toggleHidden,
    markNotCaseStudy,
    undoNotCaseStudy,
    refresh,
  } = useCaseStudies(orgId);

  // ─── Ossy context: register page state ─────────────────────
  const { setPageContext } = useOssyContext();
  const prevCaseStudyCountRef = useRef(0);

  useEffect(() => {
    const activeCount = caseStudies.filter((cs) => cs.status === "active" && !cs.isHidden).length;
    const pendingCount = caseStudies.filter((cs) => cs.status === "pending" || cs.status === "processing").length;
    const failedCount = caseStudies.filter((cs) => cs.status === "failed").length;
    setPageContext({
      page: "experience",
      caseStudyCount: total,
      pendingCount,
      activeCount,
      failedCount,
    });
    return () => setPageContext(null);
  }, [caseStudies, total, setPageContext]);

  // Emit event when case studies are first discovered
  useEffect(() => {
    if (total > 0 && prevCaseStudyCountRef.current === 0) {
      emitOssyEvent({ type: "case_study_ingested", title: `${total} case studies`, status: "discovered" });
    }
    prevCaseStudyCountRef.current = total;
  }, [total]);

  // Once the initial case-study load completes and we have 0 entries,
  // trigger a deep crawl via Inngest to populate firm_case_studies.
  const enrichmentTriggeredRef = useRef(false);
  useEffect(() => {
    if (!orgId || isLoading || total > 0) return;
    if (enrichmentTriggeredRef.current) return;
    enrichmentTriggeredRef.current = true;

    // 1. Fire deep-crawl via Inngest (server-side — populates firm_services + firm_case_studies)
    fetch("/api/enrich/deep-crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    })
      .then((r) => r.json())
      .then((data) => console.log("[Experience] Deep crawl:", data?.status ?? data?.error))
      .catch(() => {});

    // 2. Also trigger client-side enrichment for the enrichment card
    if (enrichmentStatus !== "loading") {
      fetch(`/api/enrich/firm?organizationId=${orgId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const website = data?.enrichmentData?.url || data?.website;
          const emailDomain = session?.user?.email?.split("@")[1];
          const fallback = emailDomain ? `https://${emailDomain}` : null;
          const target = website || fallback;
          if (target) triggerEnrichment(target, true);
        })
        .catch(() => {});
    }
  }, [orgId, isLoading, total, enrichmentStatus, session?.user?.email, triggerEnrichment]);

  // After enrichment finishes, re-fetch case studies so newly-seeded rows appear.
  // Persist is fire-and-forget so we poll at 2s, 5s, 10s to catch it.
  const caseStudiesRefreshedRef = useRef(false);
  useEffect(() => {
    if (enrichmentStatus !== "done" || caseStudiesRefreshedRef.current) return;
    caseStudiesRefreshedRef.current = true;
    const t1 = setTimeout(() => refresh(), 2000);
    const t2 = setTimeout(() => refresh(), 5000);
    const t3 = setTimeout(() => refresh(), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [enrichmentStatus, refresh]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showHidden, setShowHidden] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [showNotCaseStudies, setShowNotCaseStudies] = useState(false);

  // Split visible / hidden / not-case-study
  const visibleCaseStudies = caseStudies.filter((cs) => !cs.isHidden && cs.status !== "not_case_study");
  const hiddenCaseStudies = caseStudies.filter((cs) => cs.isHidden && cs.status !== "not_case_study");
  const notCaseStudies = caseStudies.filter((cs) => cs.status === "not_case_study");

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

      {/* Enrichment scanning / discovering banner */}
      {(isDiscovering || enrichmentStatus === "loading") && total === 0 && !isLoading && (
        <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
            <p className="text-sm font-medium text-cos-electric">
              {isDiscovering ? "Discovering your case studies & portfolio..." : "Scanning your website for case studies..."}
            </p>
          </div>
          <p className="mt-1.5 ml-6 text-xs text-cos-electric/70">
            We&apos;re crawling your website to find evidence of your work — case studies, projects, and client results. This usually takes 1-2 minutes.
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
            onMarkNotCaseStudy={markNotCaseStudy}
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
                  onMarkNotCaseStudy={markNotCaseStudy}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Not case studies section */}
      {notCaseStudies.length > 0 && (
        <div className="space-y-3 border-t border-cos-border/30 pt-4">
          <button
            onClick={() => setShowNotCaseStudies(!showNotCaseStudies)}
            className="flex items-center gap-2 text-xs font-medium text-cos-slate-dim transition-colors hover:text-cos-midnight"
          >
            {showNotCaseStudies ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <Ban className="h-3.5 w-3.5" />
            {notCaseStudies.length} marked as not a case {notCaseStudies.length === 1 ? "study" : "studies"}
          </button>

          {showNotCaseStudies && (
            <div className="space-y-3 opacity-50">
              {notCaseStudies.map((cs) => (
                <div
                  key={cs.id}
                  className="rounded-cos-xl border border-cos-border/30 bg-cos-surface/50"
                >
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/5">
                      <Ban className="h-4 w-4 text-cos-slate-light" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-cos-slate-dim">
                        {cs.title || cs.sourceUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")}
                      </p>
                      {cs.autoTags && (cs.autoTags.skills?.length > 0 || cs.autoTags.industries?.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {cs.autoTags.skills?.slice(0, 2).map((skill) => (
                            <span key={skill} className="rounded-cos-pill bg-cos-midnight/5 px-1.5 py-0.5 text-[9px] text-cos-slate-dim">
                              {skill}
                            </span>
                          ))}
                          {cs.autoTags.industries?.slice(0, 1).map((ind) => (
                            <span key={ind} className="rounded-cos-pill bg-cos-midnight/5 px-1.5 py-0.5 text-[9px] text-cos-slate-dim">
                              {ind}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => undoNotCaseStudy(cs.id)}
                      className="flex items-center gap-1 rounded-cos-md px-2 py-1 text-[10px] font-medium text-cos-electric transition-colors hover:bg-cos-electric/10"
                      title="Undo - restore as case study"
                    >
                      <Undo2 className="h-3 w-3" />
                      Undo
                    </button>
                  </div>
                </div>
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

      {/* Empty state — only show if NOT discovering */}
      {total === 0 && !isLoading && !isDiscovering && enrichmentStatus !== "loading" && (
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
  onMarkNotCaseStudy,
}: {
  caseStudy: CaseStudy;
  onToggleHidden: (id: string) => Promise<void>;
  onMarkNotCaseStudy?: (id: string) => Promise<void>;
}) {
  const isPending = caseStudy.status === "pending" || caseStudy.status === "ingesting";
  const isFailed = caseStudy.status === "failed";

  // Extract display URL (strip protocol and www.)
  const displayUrl = caseStudy.sourceUrl
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
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
                  className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-midnight/60"
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
        <div className="flex shrink-0 items-start gap-0.5">
          {onMarkNotCaseStudy && (
            <button
              onClick={() => onMarkNotCaseStudy(caseStudy.id)}
              className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-light transition-colors hover:bg-cos-ember/10 hover:text-cos-ember"
              title="Not a case study"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          )}
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
  const [showNotes, setShowNotes] = useState(false);
  const [userNotes, setUserNotes] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const canSubmit = (() => {
    if (isSubmitting) return false;
    switch (mode) {
      case "url": return urlInput.trim().length > 0;
      case "text": return textInput.trim().length >= 100;
      case "pdf": return fileInput !== null;
    }
  })();

  const handleSubmit = async () => {
    const notes = userNotes.trim() || undefined;
    if (mode === "url" && urlInput.trim()) {
      await onSubmitUrl(urlInput.trim(), notes);
      setUrlInput("");
    } else if (mode === "text" && textInput.trim()) {
      await onSubmitText(textInput.trim(), notes);
      setTextInput("");
    } else if (mode === "pdf" && fileInput) {
      await onSubmitPdf(fileInput, notes);
      setFileInput(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setUserNotes("");
    setShowNotes(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mt-3 rounded-cos-xl border border-cos-border/60 bg-cos-surface-raised p-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-cos-lg bg-cos-cloud-dim p-0.5">
          {(["url", "text", "pdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setFileError(null); }}
              className={cn(
                "flex items-center gap-1 rounded-cos-md px-2.5 py-1 text-[10px] font-semibold transition-all",
                mode === m
                  ? "bg-white text-cos-midnight shadow-sm"
                  : "text-cos-slate-dim hover:text-cos-midnight"
              )}
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
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) handleSubmit(); }}
            />
            <p className="mt-1 text-[10px] text-cos-slate-light">
              Works with website URLs, Google Docs, Google Slides, and other cloud links.
            </p>
          </div>
        )}
        {mode === "text" && (
          <div className="space-y-1">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste case study text here (minimum 100 characters)..."
              className="w-full resize-none rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs leading-relaxed text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
              rows={5}
            />
            <p className={cn(
              "text-[10px]",
              textInput.length >= 100 ? "text-cos-signal" : "text-cos-slate-light"
            )}>
              {textInput.length}/100 min characters
            </p>
          </div>
        )}
        {mode === "pdf" && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFileError(null);
                if (file) {
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  const blocked = ["pptx", "ppt", "key", "keynote"];
                  if (blocked.includes(ext ?? "")) {
                    setFileError("PowerPoint and Keynote files aren't supported directly. Export to PDF first (File → Save As → PDF), then upload the PDF here.");
                    e.target.value = "";
                    setFileInput(null);
                    return;
                  }
                  if (file.size > MAX_FILE_SIZE) {
                    setFileError(`File is too large (${formatFileSize(file.size)}). Maximum size is 10 MB.`);
                    e.target.value = "";
                    setFileInput(null);
                    return;
                  }
                  setFileInput(file);
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-cos-lg border-2 border-dashed py-4 text-xs transition-colors",
                fileInput
                  ? "border-cos-signal bg-cos-signal/5 text-cos-signal"
                  : "border-cos-border text-cos-slate-dim hover:border-cos-electric hover:text-cos-electric"
              )}
            >
              <Upload className="h-4 w-4" />
              {fileInput
                ? `${fileInput.name} (${formatFileSize(fileInput.size)})`
                : "Choose PDF file (max 10 MB)"}
            </button>
            {fileInput && (
              <button
                onClick={() => {
                  setFileInput(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-[10px] text-cos-slate-dim hover:text-cos-ember"
              >
                Remove file
              </button>
            )}
            {fileError && (
              <div className="flex items-start gap-2 rounded-cos-md bg-cos-ember/5 px-3 py-2">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-cos-ember" />
                <p className="text-[11px] text-cos-ember">{fileError}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional notes */}
      {showNotes ? (
        <div className="mt-3 space-y-1">
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
          className="mt-2 text-[10px] text-cos-slate-dim hover:text-cos-electric"
        >
          + Add notes
        </button>
      )}

      {submitError && (
        <div className="mt-2 flex items-start gap-2 rounded-cos-md bg-cos-ember/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-cos-ember" />
          <p className="text-[11px] text-cos-ember">{submitError}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          "mt-3 flex w-full items-center justify-center gap-1.5 rounded-cos-md py-2 text-[10px] font-semibold transition-all",
          canSubmit
            ? "bg-cos-electric text-white hover:bg-cos-electric/90 active:scale-[0.98]"
            : "bg-cos-cloud-dim text-cos-slate-light cursor-not-allowed"
        )}
      >
        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        {isSubmitting ? "Submitting..." : "Add Case Study"}
      </button>
    </div>
  );
}

// ─── Helper ──────────────────────────────────────────────

/** Derive a readable title from a URL slug (e.g., /work/acme-rebrand → "Acme Rebrand") */
function deriveSlugTitle(url: string): string {
  // Handle special prefixes
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
