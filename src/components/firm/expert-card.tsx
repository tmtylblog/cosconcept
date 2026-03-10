"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Briefcase,
  Pencil,
  Mail,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Expert } from "@/types/cos-data";

export function ExpertCard({ expert }: { expert: Expert }) {
  const [expanded, setExpanded] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const handleInvite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!expert.id || inviting || inviteSent) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/experts/${expert.id}/invite`, { method: "POST" });
      if (res.ok) {
        setInviteSent(true);
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to send invite");
      }
    } catch {
      alert("Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  // Determine best specialist profile title and quality summary
  const sps = expert.specialistProfiles ?? [];
  const strongProfiles = sps.filter((sp) => sp.qualityStatus === "strong");
  const partialProfiles = sps.filter((sp) => sp.qualityStatus === "partial");
  const primarySp = sps.find((sp) => sp.isPrimary) ?? strongProfiles[0];
  const bestTitle = primarySp?.qualityStatus === "strong" ? primarySp.title : null;

  const qualitySummary =
    sps.length === 0
      ? null
      : strongProfiles.length > 0 || partialProfiles.length > 0
        ? [
            strongProfiles.length > 0 ? `${strongProfiles.length} Strong` : null,
            partialProfiles.length > 0 ? `${partialProfiles.length} Partial` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2.5 text-left"
      >
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cos-midnight/10 text-xs font-semibold text-cos-midnight">
          {expert.name.split(" ").map((n) => n[0]).join("")}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-cos-midnight truncate">{expert.name}</h4>
            <span
              className="shrink-0 rounded-cos-pill px-1.5 py-0.5 text-[9px] font-medium text-white"
              style={{ backgroundColor: expert.divisionColor }}
            >
              {expert.division}
            </span>
          </div>
          {/* Show best specialist title as primary label, fallback to role */}
          <p className="text-[10px] text-cos-slate-dim truncate">
            {bestTitle ?? expert.role}
          </p>
          {/* Quality badge */}
          {qualitySummary && (
            <p className="mt-0.5 flex items-center gap-1 text-[9px] text-cos-signal">
              <Star className="h-2.5 w-2.5" />
              {qualitySummary}
            </p>
          )}
          {sps.length === 0 && (
            <p className="mt-0.5 text-[9px] italic text-cos-slate-light">
              No specialist profiles yet
            </p>
          )}
        </div>

        {/* Availability dot */}
        <div className="flex items-center gap-1 shrink-0">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            expert.availability === "Available" ? "bg-cos-signal" :
            expert.availability === "Part-time" ? "bg-yellow-400" : "bg-cos-slate-light"
          )} />
          <span className="text-[9px] text-cos-slate-dim">{expert.availability}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-cos-border/30 pt-2">
          {expert.bio && (
            <p className="text-[11px] leading-relaxed text-cos-slate-dim">{expert.bio}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-cos-slate-dim">
            {expert.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {expert.location}
              </span>
            )}
            {expert.hourlyRate && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-2.5 w-2.5" /> ${expert.hourlyRate}/hr
              </span>
            )}
          </div>

          {expert.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Skills</p>
              <div className="flex flex-wrap gap-1">
                {expert.skills.map((s) => (
                  <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {expert.industries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Industries</p>
              <div className="flex flex-wrap gap-1">
                {expert.industries.map((ind) => (
                  <span key={ind} className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Specialist Profiles (compact view) */}
          {sps.length > 0 && (
            <div className="border-t border-cos-border/30 pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cos-electric">
                Specialist Profiles ({sps.length})
              </p>
              <div className="space-y-1">
                {sps.slice(0, 3).map((sp) => (
                  <div key={sp.id} className="flex items-center gap-1.5 rounded-cos-md border border-cos-electric/20 bg-cos-electric/3 px-2 py-1">
                    {sp.qualityStatus === "strong" && (
                      <Star className="h-2.5 w-2.5 shrink-0 text-cos-signal" />
                    )}
                    <p className="flex-1 truncate text-[10px] font-medium text-cos-electric">
                      {sp.title || "Untitled"}
                    </p>
                    <span className="shrink-0 text-[9px] text-cos-slate-dim">
                      {Math.round(sp.qualityScore ?? 0)}/100
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {expert.profileUrl && (
              <Link
                href={expert.profileUrl}
                className="flex items-center gap-1 rounded-cos-md border border-cos-border px-2.5 py-1 text-[10px] font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
              >
                <Pencil className="h-2.5 w-2.5" />
                Edit Profile
              </Link>
            )}
            {expert.email && (
              <button
                onClick={handleInvite}
                disabled={inviting || inviteSent}
                className="flex items-center gap-1 rounded-cos-md border border-cos-border px-2.5 py-1 text-[10px] font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors disabled:opacity-50"
              >
                <Mail className="h-2.5 w-2.5" />
                {inviteSent ? "Invite sent \u2713" : inviting ? "Sending..." : "Invite to edit"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
