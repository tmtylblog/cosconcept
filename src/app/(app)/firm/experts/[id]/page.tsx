"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Linkedin,
  Mail,
  MapPin,
  Sparkles,
  Loader2,
  Briefcase,
  Calendar,
  CheckCircle2,
  UserPlus,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExpertDetail {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  location: string | null;
  headline: string | null;
  enrichmentStatus: string | null;
  rosterStatus: string;
  userId: string | null;
  topSkills: string[];
  updatedAt: string | null;
  firmId: string;
  pdlData: {
    experience?: Array<{
      company: { name: string; website?: string | null; industry?: string | null };
      title: string;
      startDate: string | null;
      endDate: string | null;
      isCurrent: boolean;
      summary?: string | null;
    }>;
    skills?: string[];
    source?: string;
  } | null;
  specialistProfiles: Array<{
    id: string;
    title: string | null;
    qualityStatus: string | null;
  }>;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active Team", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "prior", label: "Prior Team", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "incorrect", label: "Incorrect Data", color: "bg-red-100 text-red-700 border-red-300" },
];

const TIER_OPTIONS = [
  { value: "expert", label: "Expert", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "potential_expert", label: "Potential Expert", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "not_expert", label: "Team Member", color: "bg-cos-cloud text-cos-slate border-cos-border" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Present";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function FirmExpertDetailPage() {
  const params = useParams();
  const router = useRouter();
  const expertId = params.id as string;

  const [expert, setExpert] = useState<ExpertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    fetch(`/api/experts/${expertId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.expert) {
          setExpert({
            ...data.expert,
            specialistProfiles: (data.specialistProfiles ?? []).map((sp: { id: string; title?: string | null; qualityStatus?: string | null }) => ({
              id: sp.id,
              title: sp.title ?? null,
              qualityStatus: sp.qualityStatus ?? null,
            })),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expertId]);

  async function handleStatusChange(newStatus: string) {
    if (!expert || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/firm/experts/${expertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterStatus: newStatus }),
      });
      if (res.ok) {
        setExpert({ ...expert, rosterStatus: newStatus });
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleTierChange(newTier: string) {
    if (!expert || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/firm/experts/${expertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertTier: newTier }),
      });
      if (res.ok) {
        // Update local pdlData with new classifiedAs
        const updatedPdl = { ...(expert.pdlData ?? {}), classifiedAs: newTier };
        setExpert({ ...expert, pdlData: updatedPdl as ExpertDetail["pdlData"] });
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite() {
    if (!expert || inviting) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch(`/api/experts/${expertId}/invite`, { method: "POST" });
      if (res.ok) {
        setInviteResult("Invitation sent!");
      } else {
        const data = await res.json().catch(() => ({}));
        setInviteResult(data.error || "Failed to send invite");
      }
    } catch {
      setInviteResult("Network error");
    } finally {
      setInviting(false);
    }
  }

  async function handleEnrich() {
    if (enriching) return;
    setEnriching(true);
    try {
      await fetch(`/api/enrich/expert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertId,
          firmId: undefined,
          fullName: expert?.fullName,
          linkedinUrl: expert?.linkedinUrl,
        }),
      });
      // Reload after delay
      setTimeout(() => {
        fetch(`/api/experts/${expertId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => { if (data) setExpert(data); })
          .catch(() => {})
          .finally(() => setEnriching(false));
      }, 5000);
    } catch {
      setEnriching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  if (!expert) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-cos-slate">Expert not found</p>
        <Link href="/firm/experts" className="mt-2 text-sm text-cos-electric hover:underline">
          Back to roster
        </Link>
      </div>
    );
  }

  const name = expert.fullName || [expert.firstName, expert.lastName].filter(Boolean).join(" ") || "Unknown";
  const experience = expert.pdlData?.experience ?? [];
  const skills = expert.topSkills?.length ? expert.topSkills : (expert.pdlData?.skills ?? []);
  const hasWorkHistory = experience.length > 0;
  const currentTier = (expert.pdlData as Record<string, unknown> | null)?.classifiedAs as string ?? (hasWorkHistory ? "expert" : "not_expert");

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      {/* Back link */}
      <Link
        href="/firm/experts"
        className="inline-flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Team Roster
      </Link>

      {/* Hero */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
        <div className="flex items-start gap-5">
          {/* Photo */}
          {expert.photoUrl ? (
            <img src={expert.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-xl font-bold text-cos-signal">
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-cos-midnight">{name}</h1>
                {expert.title && <p className="text-sm text-cos-slate mt-0.5">{expert.title}</p>}
                {expert.headline && <p className="text-xs text-cos-slate-dim mt-0.5">{expert.headline}</p>}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {expert.email && !expert.userId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInvite}
                    disabled={inviting}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Invite to Platform
                  </Button>
                )}
                {expert.userId && (
                  <span className="inline-flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Claimed
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnrich}
                  disabled={enriching}
                  className="h-8 gap-1.5 text-xs"
                >
                  {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {hasWorkHistory ? "Update" : "Enrich"}
                </Button>
              </div>
            </div>

            {/* Contact info */}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-cos-slate">
              {expert.linkedinUrl && (
                <a
                  href={expert.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-cos-electric hover:underline"
                >
                  <Linkedin className="h-3 w-3" />
                  {expert.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}
                </a>
              )}
              {expert.email && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Mail className="h-3 w-3" />
                  {expert.email}
                </span>
              )}
              {expert.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {expert.location}
                </span>
              )}
              {expert.updatedAt && (
                <span className="inline-flex items-center gap-1 text-cos-slate/50">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(expert.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {inviteResult && (
              <p className={`mt-2 text-xs ${inviteResult.includes("sent") ? "text-emerald-600" : "text-cos-ember"}`}>
                {inviteResult}
              </p>
            )}
          </div>
        </div>

        {/* Status toggle */}
        <div className="mt-5 pt-4 border-t border-cos-border">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate mb-2 block">
            Roster Status
          </label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                disabled={saving}
                className={`rounded-cos-md border px-3 py-1.5 text-xs font-medium transition-all ${
                  expert.rosterStatus === opt.value
                    ? opt.color
                    : "border-cos-border bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {saving && <Loader2 className="h-4 w-4 animate-spin text-cos-electric self-center" />}
          </div>

          {/* Tier classification */}
          <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate mb-2 block mt-4">
            Classification
          </label>
          <div className="flex gap-2">
            {TIER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTierChange(opt.value)}
                disabled={saving}
                className={`rounded-cos-md border px-3 py-1.5 text-xs font-medium transition-all ${
                  currentTier === opt.value
                    ? opt.color
                    : "border-cos-border bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Work History */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface">
        <div className="border-b border-cos-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-cos-midnight">
            <Briefcase className="h-4 w-4 text-cos-electric" />
            Work History
            {experience.length > 0 && (
              <span className="text-xs font-normal text-cos-slate">({experience.length} positions)</span>
            )}
          </h2>
        </div>
        {experience.length > 0 ? (
          <div className="divide-y divide-cos-border/50">
            {experience.map((exp, i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-cos-midnight">{exp.title}</p>
                    <p className="text-xs text-cos-slate mt-0.5">{exp.company.name}</p>
                    {exp.company.industry && (
                      <p className="text-[10px] text-cos-slate/60">{exp.company.industry}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-cos-slate shrink-0">
                    <Calendar className="h-3 w-3" />
                    {formatDate(exp.startDate)} &ndash; {exp.isCurrent ? "Present" : formatDate(exp.endDate)}
                  </div>
                </div>
                {exp.summary && (
                  <p className="mt-2 text-xs text-cos-slate-dim leading-relaxed">{exp.summary}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-cos-slate/30" />
            <p className="mt-2 text-sm text-cos-slate">No work history available</p>
            <p className="text-xs text-cos-slate-dim mt-1">
              Click &quot;Enrich&quot; to pull work history from PDL
            </p>
          </div>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <h2 className="text-sm font-semibold text-cos-midnight mb-3">Skills</h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Specialist Profiles */}
      {expert.specialistProfiles && expert.specialistProfiles.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <h2 className="text-sm font-semibold text-cos-midnight mb-3">Specialist Profiles</h2>
          <div className="space-y-2">
            {expert.specialistProfiles.map((sp) => (
              <div key={sp.id} className="flex items-center justify-between rounded-cos-lg border border-cos-border px-4 py-2.5">
                <span className="text-sm text-cos-midnight">{sp.title || "Untitled"}</span>
                {sp.qualityStatus && (
                  <span className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                    sp.qualityStatus === "strong" ? "bg-emerald-50 text-emerald-600"
                    : sp.qualityStatus === "partial" ? "bg-amber-50 text-amber-600"
                    : "bg-cos-cloud text-cos-slate"
                  }`}>
                    {sp.qualityStatus}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
