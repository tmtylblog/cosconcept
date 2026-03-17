"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  Ban,
  CheckCircle2,
  Clock,
  AlertCircle,
  Image,
} from "lucide-react";

interface CaseStudyRow {
  id: string;
  sourceUrl: string;
  sourceType: string;
  status: string;
  statusMessage: string | null;
  title: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  autoTags: string[] | null;
  userNotes: string | null;
  isHidden: boolean;
  createdAt: string;
  ingestedAt: string | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  active: { icon: <CheckCircle2 className="h-3 w-3" />, color: "text-cos-signal bg-cos-signal/10", label: "Active" },
  pending: { icon: <Clock className="h-3 w-3" />, color: "text-cos-electric bg-cos-electric/10", label: "Pending" },
  failed: { icon: <AlertCircle className="h-3 w-3" />, color: "text-cos-ember bg-cos-ember/10", label: "Failed" },
  not_case_study: { icon: <Ban className="h-3 w-3" />, color: "text-cos-slate bg-cos-slate-light/10", label: "Not CS" },
};

export function FirmExperienceTab({ orgId }: { orgId: string }) {
  const [caseStudies, setCaseStudies] = useState<CaseStudyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchCaseStudies = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/customers/${orgId}/case-studies`)
      .then((r) => r.json())
      .then((d) => setCaseStudies(d.caseStudies ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchCaseStudies(); }, [fetchCaseStudies]);

  const toggleHidden = async (cs: CaseStudyRow) => {
    setSaving(cs.id);
    try {
      await fetch(`/api/admin/customers/${orgId}/case-studies`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cs.id, isHidden: !cs.isHidden }),
      });
      fetchCaseStudies();
    } finally {
      setSaving(null);
    }
  };

  const toggleNotCaseStudy = async (cs: CaseStudyRow) => {
    const newStatus = cs.status === "not_case_study" ? "active" : "not_case_study";
    setSaving(cs.id);
    try {
      await fetch(`/api/admin/customers/${orgId}/case-studies`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cs.id, status: newStatus }),
      });
      fetchCaseStudies();
    } finally {
      setSaving(null);
    }
  };

  const addCaseStudy = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/admin/customers/${orgId}/case-studies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      setAddUrl("");
      setShowAdd(false);
      fetchCaseStudies();
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-cos-slate-light" />
      </div>
    );
  }

  const activeCount = caseStudies.filter((cs) => cs.status === "active").length;
  const pendingCount = caseStudies.filter((cs) => cs.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-cos-slate">
            {caseStudies.length} case stud{caseStudies.length !== 1 ? "ies" : "y"}
          </span>
          {activeCount > 0 && (
            <span className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
              {activeCount} active
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
              {pendingCount} pending
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded-cos-md bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
        >
          <Plus className="h-3 w-3" /> Add Case Study
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4 space-y-3">
          <input
            type="url"
            placeholder="https://example.com/case-study"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-1.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            onKeyDown={(e) => { if (e.key === "Enter") addCaseStudy(); }}
          />
          <div className="flex gap-2">
            <button
              onClick={addCaseStudy}
              disabled={adding || !addUrl.trim()}
              className="rounded-cos-md bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric/90 disabled:opacity-50"
            >
              {adding ? "Submitting..." : "Submit for Ingestion"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-cos-md px-3 py-1.5 text-xs text-cos-slate hover:text-cos-midnight"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Case study cards */}
      {caseStudies.length === 0 ? (
        <p className="py-8 text-center text-sm text-cos-slate-light italic">No case studies found</p>
      ) : (
        caseStudies.map((cs) => {
          const statusCfg = STATUS_CONFIG[cs.status] ?? STATUS_CONFIG.pending;
          return (
            <div
              key={cs.id}
              className={`rounded-cos-lg border p-4 ${cs.isHidden ? "border-cos-slate-light/30 bg-cos-cloud/30 opacity-60" : "border-cos-border bg-white"}`}
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                {cs.thumbnailUrl ? (
                  <img src={cs.thumbnailUrl} alt="" className="h-16 w-24 shrink-0 rounded-cos object-cover" />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-cos bg-cos-cloud">
                    <Image className="h-5 w-5 text-cos-slate-light" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* Title + status */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-cos-midnight truncate">
                      {cs.title || "Untitled"}
                    </p>
                    <span className={`flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                      {statusCfg.icon} {statusCfg.label}
                    </span>
                    {cs.isHidden && (
                      <span className="rounded-cos-pill bg-cos-slate-light/10 px-2 py-0.5 text-[10px] text-cos-slate">Hidden</span>
                    )}
                  </div>

                  {/* Summary */}
                  {cs.summary && (
                    <p className="mt-1 text-xs text-cos-slate line-clamp-2">{cs.summary}</p>
                  )}

                  {/* Status message (for failed) */}
                  {cs.statusMessage && cs.status === "failed" && (
                    <p className="mt-1 text-[10px] text-cos-ember">{cs.statusMessage}</p>
                  )}

                  {/* Auto-tags */}
                  {cs.autoTags && cs.autoTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {cs.autoTags.map((tag) => (
                        <span key={tag} className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] text-cos-warm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Source URL */}
                  <a
                    href={cs.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    {cs.sourceUrl.length > 60 ? cs.sourceUrl.slice(0, 60) + "..." : cs.sourceUrl}
                  </a>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  {saving === cs.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-slate-light" />
                  ) : (
                    <>
                      <button
                        onClick={() => toggleHidden(cs)}
                        className="p-1 rounded-cos-md text-cos-slate-light hover:text-cos-midnight"
                        title={cs.isHidden ? "Unhide" : "Hide"}
                      >
                        {cs.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleNotCaseStudy(cs)}
                        className="p-1 rounded-cos-md text-cos-slate-light hover:text-cos-ember"
                        title={cs.status === "not_case_study" ? "Mark as active" : "Mark not a case study"}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
