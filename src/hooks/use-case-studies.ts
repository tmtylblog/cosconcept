"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────

export type CaseStudyStatus =
  | "pending"
  | "ingesting"
  | "active"
  | "blocked"
  | "failed";

export interface CaseStudy {
  id: string;
  sourceUrl: string;
  sourceType: string;
  status: CaseStudyStatus;
  statusMessage: string | null;
  title: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  previewImageUrl: string | null;
  userNotes: string | null;
  isHidden: boolean;
  autoTags: {
    skills: string[];
    industries: string[];
    services: string[];
    markets: string[];
    languages: string[];
    clientName: string | null;
  } | null;
  cosAnalysis: {
    confidence?: number;
    title?: string;
    clientName?: string;
    clientIndustry?: string;
    projectDuration?: string;
    teamSize?: string;
    challenge?: string;
    solution?: string;
    approach?: string;
    outcomes?: string[];
    metrics?: Array<{ value: string; label: string; improvement?: string }>;
    evidenceStrength?: string;
    evidenceReasoning?: string;
  } | null;
  createdAt: string;
  ingestedAt: string | null;
}

interface UseCaseStudiesReturn {
  caseStudies: CaseStudy[];
  total: number;
  hiddenCount: number;
  isLoading: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  submitUrl: (url: string, userNotes?: string) => Promise<void>;
  submitText: (text: string, userNotes?: string) => Promise<void>;
  submitPdf: (file: File, userNotes?: string) => Promise<void>;
  toggleHidden: (id: string) => Promise<void>;
  deleteCaseStudy: (id: string) => Promise<void>;
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────

export function useCaseStudies(
  organizationId: string | undefined,
  options?: { includeHidden?: boolean }
): UseCaseStudiesReturn {
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const includeHidden = options?.includeHidden ?? true;

  // ── Build URL with params ─────────────────────────────
  const buildUrl = useCallback(() => {
    if (!organizationId) return null;
    const params = new URLSearchParams({ organizationId });
    if (includeHidden) params.set("includeHidden", "true");
    return `/api/firm/case-studies?${params}`;
  }, [organizationId, includeHidden]);

  // ── Fetch all case studies ──────────────────────────────
  const fetchCaseStudies = useCallback(async () => {
    const url = buildUrl();
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setCaseStudies(data.caseStudies ?? []);
      setTotal(data.total ?? 0);
      setHiddenCount(data.hiddenCount ?? 0);
    } catch {
      // silent
    }
  }, [buildUrl]);

  // ── Initial load ────────────────────────────────────────
  useEffect(() => {
    const url = buildUrl();
    if (!url) {
      setCaseStudies([]);
      setTotal(0);
      setHiddenCount(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setCaseStudies(data?.caseStudies ?? []);
        setTotal(data?.total ?? 0);
        setHiddenCount(data?.hiddenCount ?? 0);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildUrl]);

  // ── Poll when items are in-progress ─────────────────────
  useEffect(() => {
    const hasInProgress = caseStudies.some(
      (cs) => cs.status === "pending" || cs.status === "ingesting"
    );

    if (hasInProgress) {
      pollRef.current = setInterval(fetchCaseStudies, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
    };
  }, [caseStudies, fetchCaseStudies]);

  // ── Toggle hidden ─────────────────────────────────────
  const toggleHidden = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      const cs = caseStudies.find((c) => c.id === id);
      if (!cs) return;

      const newHidden = !cs.isHidden;

      // Optimistic update
      setCaseStudies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isHidden: newHidden } : c))
      );

      try {
        const res = await fetch("/api/firm/case-studies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, organizationId, isHidden: newHidden }),
        });
        if (!res.ok) {
          // Revert on failure
          setCaseStudies((prev) =>
            prev.map((c) => (c.id === id ? { ...c, isHidden: !newHidden } : c))
          );
        }
      } catch {
        // Revert on error
        setCaseStudies((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isHidden: !newHidden } : c))
        );
      }
    },
    [organizationId, caseStudies]
  );

  // ── Submit URL ──────────────────────────────────────────
  const submitUrl = useCallback(
    async (url: string, userNotes?: string) => {
      if (!organizationId) return;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/firm/case-studies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            sourceType: "url",
            url,
            userNotes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to submit");
        }
        await fetchCaseStudies();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [organizationId, fetchCaseStudies]
  );

  // ── Submit Text ─────────────────────────────────────────
  const submitText = useCallback(
    async (rawText: string, userNotes?: string) => {
      if (!organizationId) return;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/firm/case-studies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            sourceType: "text",
            rawText,
            userNotes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to submit");
        }
        await fetchCaseStudies();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [organizationId, fetchCaseStudies]
  );

  // ── Submit PDF ──────────────────────────────────────────
  const submitPdf = useCallback(
    async (file: File, userNotes?: string) => {
      if (!organizationId) return;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("organizationId", organizationId);
        if (userNotes) formData.append("userNotes", userNotes);

        const res = await fetch("/api/firm/case-studies", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to upload");
        }
        await fetchCaseStudies();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [organizationId, fetchCaseStudies]
  );

  // ── Delete ──────────────────────────────────────────────
  const deleteCaseStudy = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/firm/case-studies/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCaseStudies((prev) => prev.filter((cs) => cs.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // silent
    }
  }, []);

  return {
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
    deleteCaseStudy,
    refresh: fetchCaseStudies,
  };
}
