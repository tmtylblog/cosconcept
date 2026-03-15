"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Linkedin,
  Building2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  GraduationCap,
  Pencil,
  X,
  ExternalLink,
} from "lucide-react";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { SpecialistProfileCard } from "@/components/experts/specialist-profile-card";

// ── Types (same as the existing page) ──────────────────────────────

export interface PdlExperience {
  company: { name: string; website?: string | null; industry?: string | null };
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string;
}

export interface PdlEducation {
  school: { name: string };
  degrees?: string[];
  startDate?: string;
  endDate?: string;
}

export interface ExpertProfileData {
  id: string;
  firmId: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  title?: string | null;
  headline?: string | null;
  photoUrl?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  bio?: string | null;
  topSkills?: string[] | null;
  topIndustries?: string[] | null;
  pdlData?: {
    experience?: PdlExperience[];
    education?: PdlEducation[];
    summary?: string;
  } | null;
}

export interface SpecialistProfileData {
  id: string;
  title?: string | null;
  bodyDescription?: string | null;
  skills?: string[] | null;
  industries?: string[] | null;
  services?: string[] | null;
  qualityScore?: number | null;
  qualityStatus?: string | null;
  isPrimary?: boolean | null;
  isSearchable?: boolean | null;
  status?: string | null;
  examples?: {
    id: string;
    title?: string | null;
    subject?: string | null;
    companyName?: string | null;
    companyIndustry?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
    position: number;
  }[];
}

interface ExpertProfileCardProps {
  expert: ExpertProfileData;
  specialistProfiles: SpecialistProfileData[];
  isOwner?: boolean;
  isAdmin?: boolean;
  onEditClick?: (spId?: string) => void;
  onClose?: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function ExpertProfileCard({
  expert,
  specialistProfiles,
  isOwner = false,
  isAdmin = false,
  onEditClick,
  onClose,
}: ExpertProfileCardProps) {
  const [showHistory, setShowHistory] = useState(false);

  const name =
    expert.fullName ??
    (`${expert.firstName ?? ""} ${expert.lastName ?? ""}`.trim() || "Unknown");
  const strongProfiles = specialistProfiles.filter(
    (sp) => sp.qualityStatus === "strong"
  );
  const primaryProfile =
    specialistProfiles.find((sp) => sp.isPrimary) ?? strongProfiles[0];
  const hasStrongProfiles = strongProfiles.length > 0;

  const experiences = expert.pdlData?.experience ?? [];
  const education = expert.pdlData?.education ?? [];

  const visibleProfiles = specialistProfiles.filter(
    (sp) =>
      isOwner ||
      isAdmin ||
      sp.qualityStatus === "strong" ||
      sp.qualityStatus === "partial"
  );

  return (
    <div className="space-y-4">
      {/* ─── Header bar (drawer mode) ─────────────────── */}
      {onClose && (
        <div className="flex items-center justify-between">
          <Link
            href={`/experts/${expert.id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-cos-electric hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open Full Profile
          </Link>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:bg-cos-cloud transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Hero ─────────────────────────────────────── */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface-raised p-5">
        <div className="flex items-start gap-4">
          {expert.photoUrl ? (
            <img
              src={expert.photoUrl}
              alt={name}
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cos-midnight/10 text-lg font-semibold text-cos-midnight">
              {name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-heading text-xl font-semibold text-cos-midnight">
                  {name}
                </h2>
                {hasStrongProfiles && primaryProfile?.title ? (
                  <p className="mt-0.5 text-sm font-medium text-cos-electric">
                    {primaryProfile.title}
                  </p>
                ) : expert.title || expert.headline ? (
                  <p className="mt-0.5 text-sm text-cos-slate-dim">
                    {expert.title ?? expert.headline}
                  </p>
                ) : null}
              </div>

              {(isOwner || isAdmin) && onEditClick && (
                <button
                  onClick={() => onEditClick()}
                  className="shrink-0 flex items-center gap-1.5 rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-cos-slate-dim">
              {expert.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {expert.location}
                </span>
              )}
              {expert.linkedinUrl && (
                <a
                  href={normalizeLinkedInUrl(expert.linkedinUrl) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-cos-electric transition-colors"
                >
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </a>
              )}
              {expert.email && isAdmin && (
                <span className="flex items-center gap-1 text-cos-slate-light">
                  {expert.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio / primary specialist description */}
        {hasStrongProfiles && primaryProfile?.bodyDescription ? (
          <div className="mt-4 border-t border-cos-border/50 pt-4 space-y-3">
            <p className="text-sm leading-relaxed text-cos-slate-dim line-clamp-4">
              {primaryProfile.bodyDescription}
            </p>
            {(primaryProfile.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {primaryProfile.skills!.slice(0, 8).map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {strongProfiles.length > 1 && (
              <p className="text-[11px] text-cos-slate-dim">
                +{strongProfiles.length - 1} other specialist profile
                {strongProfiles.length > 2 ? "s" : ""}
              </p>
            )}
          </div>
        ) : expert.bio || expert.pdlData?.summary ? (
          <div className="mt-4 border-t border-cos-border/50 pt-4 space-y-3">
            <p className="text-sm leading-relaxed text-cos-slate-dim">
              {expert.bio ?? expert.pdlData?.summary}
            </p>
            {(expert.topSkills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {expert.topSkills!.slice(0, 8).map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ─── Specialist Profiles ────────────────────────── */}
      {visibleProfiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">
              Specialist Profiles
            </p>
            <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
              {strongProfiles.length} strong
            </span>
          </div>

          {visibleProfiles.map((sp) => (
            <SpecialistProfileCard
              key={sp.id}
              profile={sp}
              isOwner={isOwner || isAdmin}
              onEditClick={
                onEditClick ? () => onEditClick(sp.id) : undefined
              }
            />
          ))}
        </div>
      )}

      {/* ─── Work History ───────────────────────────────── */}
      {experiences.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex w-full items-center gap-2"
          >
            <Briefcase className="h-4 w-4 text-cos-slate-dim" />
            <p className="flex-1 text-left text-xs font-semibold uppercase tracking-wider text-cos-midnight">
              Work History
            </p>
            <span className="text-[10px] text-cos-slate-dim">
              {experiences.length} roles
            </span>
            {showHistory ? (
              <ChevronUp className="h-4 w-4 text-cos-slate-light" />
            ) : (
              <ChevronDown className="h-4 w-4 text-cos-slate-light" />
            )}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-3 border-t border-cos-border/30 pt-3">
              {experiences.map((ex, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/8 text-cos-midnight">
                    <Briefcase className="h-3 w-3" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-cos-midnight">
                      {ex.title}
                    </p>
                    <p className="text-[11px] text-cos-slate-dim">
                      {ex.company.name}
                      {ex.company.industry
                        ? ` \u00B7 ${ex.company.industry}`
                        : ""}
                    </p>
                    <p className="text-[10px] text-cos-slate-light">
                      {ex.startDate ?? "?"}
                      {ex.isCurrent
                        ? " \u00B7 Present"
                        : ex.endDate
                          ? ` \u2013 ${ex.endDate}`
                          : ""}
                    </p>
                    {ex.summary && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-cos-slate-dim">
                        {ex.summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Education ──────────────────────────────────── */}
      {education.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="h-4 w-4 text-cos-slate-dim" />
            <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">
              Education
            </p>
          </div>
          <div className="space-y-2">
            {education.map((ed, i) => (
              <div key={i} className="flex gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/8 text-cos-midnight">
                  <GraduationCap className="h-3 w-3" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-cos-midnight">
                    {ed.school.name}
                  </p>
                  {ed.degrees?.length ? (
                    <p className="text-[11px] text-cos-slate-dim">
                      {ed.degrees.join(", ")}
                    </p>
                  ) : null}
                  {(ed.startDate || ed.endDate) && (
                    <p className="text-[10px] text-cos-slate-light">
                      {[ed.startDate, ed.endDate].filter(Boolean).join(" \u2013 ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Firm link ──────────────────────────────────── */}
      {!onClose && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10 text-cos-electric">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-cos-midnight">
                Member of
              </p>
              <Link
                href="/firm"
                className="text-[11px] text-cos-electric hover:underline"
              >
                View firm profile &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
