"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Upload,
  Loader2,
  AlertCircle,
  FileText,
  Link as LinkIcon,
} from "lucide-react";
import {
  classifySourceUrl,
  getSourceTypeLabel,
  type CaseStudySourceType,
} from "@/lib/enrichment/source-classifier";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitUrl: (url: string) => Promise<void>;
  onSubmitPdf: (file: File) => Promise<void>;
  organizationId?: string;
}

// ─── Component ────────────────────────────────────────────

export function CaseStudySubmissionDialog({
  open,
  onClose,
  onSubmitUrl,
  onSubmitPdf,
}: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [detectedType, setDetectedType] = useState<CaseStudySourceType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

  // ── Focus & keyboard ──────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => firstFocusRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUrlInput("");
      setDetectedType(null);
      setFile(null);
      setIsDragging(false);
      setFileError(null);
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  // ── URL detection (debounced 300ms) ───────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!urlInput.trim()) {
      setDetectedType(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      try {
        new URL(urlInput.trim());
        const type = classifySourceUrl(urlInput.trim());
        setDetectedType(type);
      } catch {
        setDetectedType(null);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [urlInput]);

  // ── File validation ───────────────────────────────────
  const validateAndSetFile = useCallback((incoming: File) => {
    setFileError(null);
    const ext = incoming.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      setFileError(
        "Only PDF files are supported. Export to PDF first (File → Save As → PDF) then try again."
      );
      return false;
    }
    if (incoming.size > MAX_FILE_SIZE) {
      const sizeMb = (incoming.size / (1024 * 1024)).toFixed(1);
      setFileError(`This file is too large (${sizeMb} MB). Maximum is 50 MB.`);
      return false;
    }
    setFile(incoming);
    // URL and PDF are mutually exclusive
    setUrlInput("");
    setDetectedType(null);
    return true;
  }, []);

  // ── Drag & drop ───────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  };

  // ── File input change ─────────────────────────────────
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) validateAndSetFile(picked);
    e.target.value = "";
  };

  // ── URL input change ──────────────────────────────────
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
    if (e.target.value.trim()) {
      // Clear file when URL is typed
      setFile(null);
      setFileError(null);
    }
  };

  // ── Submit ────────────────────────────────────────────
  const canSubmit = !isSubmitting && (urlInput.trim().length > 0 || file !== null);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (urlInput.trim()) {
        await onSubmitUrl(urlInput.trim());
      } else if (file) {
        await onSubmitPdf(file);
      }
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open) return null;

  return (
    // Fixed overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog card */}
      <div className="w-full max-w-lg rounded-cos-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border/50 px-6 py-4">
          <h2 className="font-heading text-base font-semibold text-cos-midnight">
            Add a Case Study
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-light transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Subtitle */}
          <p className="text-xs text-cos-slate-dim">
            Paste a link or upload a PDF — we'll handle the rest.
          </p>

          {/* URL input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-cos-slate-dim">
              Link
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cos-slate-light" />
              <input
                ref={firstFocusRef}
                type="url"
                value={urlInput}
                onChange={handleUrlChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleSubmit();
                }}
                placeholder="https://yoursite.com/case-study/acme"
                className="w-full rounded-cos-lg border border-cos-border bg-white py-2.5 pl-9 pr-3 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
              />
            </div>

            {/* Detection badge */}
            {detectedType && urlInput.trim() && (
              <div className="mt-2">
                <DetectionBadge type={detectedType} />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-cos-border/50" />
            <span className="text-[11px] text-cos-slate-dim">or</span>
            <div className="h-px flex-1 bg-cos-border/50" />
          </div>

          {/* PDF drop zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {file ? (
              // File selected state
              <div className="flex items-center justify-between rounded-cos-lg border border-cos-signal/30 bg-cos-signal/5 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-cos-signal" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-cos-midnight">{file.name}</p>
                    <p className="text-[10px] text-cos-slate-dim">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setFileError(null);
                  }}
                  className="ml-3 shrink-0 text-[10px] font-medium text-cos-slate-dim transition-colors hover:text-cos-ember"
                >
                  Remove
                </button>
              </div>
            ) : (
              // Drop zone
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1.5 rounded-cos-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                  isDragging
                    ? "border-cos-electric bg-cos-electric/5"
                    : "border-cos-border/60 hover:border-cos-electric/40 hover:bg-cos-cloud/50"
                )}
              >
                <Upload
                  className={cn(
                    "h-5 w-5",
                    isDragging ? "text-cos-electric" : "text-cos-slate-light"
                  )}
                />
                <p
                  className={cn(
                    "text-xs font-medium",
                    isDragging ? "text-cos-electric" : "text-cos-slate"
                  )}
                >
                  Drag & drop a PDF here
                </p>
                <p className="text-[10px] text-cos-slate-dim">or click to browse</p>
                <p className="text-[10px] text-cos-slate-light">PDF only · max 50 MB</p>
              </button>
            )}

            {/* File error */}
            {fileError && (
              <div className="mt-2 flex items-start gap-2 rounded-cos-md bg-cos-ember/5 px-3 py-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-ember" />
                <p className="text-[11px] leading-relaxed text-cos-ember">{fileError}</p>
              </div>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-cos-md bg-cos-ember/5 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-ember" />
              <p className="text-[11px] text-cos-ember">{submitError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-cos-border/50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-cos-lg border border-cos-border/60 bg-white px-4 py-2 text-xs font-medium text-cos-slate-dim transition-colors hover:border-cos-border hover:text-cos-midnight"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex items-center gap-1.5 rounded-cos-lg px-4 py-2 text-xs font-semibold transition-all",
              canSubmit
                ? "bg-cos-electric text-white hover:bg-cos-electric-hover active:scale-[0.98]"
                : "cursor-not-allowed bg-cos-cloud-dim text-cos-slate-light"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Analyze & Add →"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detection badge ──────────────────────────────────────

function DetectionBadge({ type }: { type: CaseStudySourceType }) {
  const styles: Record<CaseStudySourceType, string> = {
    youtube: "bg-red-100 text-red-700",
    vimeo: "bg-blue-100 text-blue-700",
    google_slides: "bg-green-100 text-green-700",
    powerpoint_online: "bg-orange-100 text-orange-700",
    url: "bg-cos-electric/10 text-cos-electric",
    pdf_upload: "bg-cos-electric/10 text-cos-electric",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-cos-pill px-2.5 py-0.5 text-[11px] font-medium",
        styles[type]
      )}
    >
      ✓ {getSourceTypeLabel(type)} detected
    </span>
  );
}
