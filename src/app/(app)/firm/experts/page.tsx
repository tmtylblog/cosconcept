"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Users,
  Loader2,
  UserPlus,
  Linkedin,
  Mail,
  Copy,
  Check,
  Lock,
  ArrowUpRight,
  Sparkles,
  Star,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useDbExperts } from "@/hooks/use-db-experts";
import { usePlan } from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plan-limits";
import type { Expert } from "@/types/cos-data";

export default function FirmExpertsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();
  const extracted = result?.extracted;
  const { plan, isLoading: planLoading } = usePlan();

  const {
    experts: dbExperts,
    total: dbTotalExperts,
    isLoading: dbLoading,
  } = useDbExperts(activeOrg?.id);

  // Group experts by tier
  const { tierExperts, tierPotential, tierOther } = useMemo(() => {
    const te: Expert[] = [];
    const tp: Expert[] = [];
    const to: Expert[] = [];
    for (const e of dbExperts) {
      if (e.expertTier === "expert") te.push(e);
      else if (e.expertTier === "potential_expert") tp.push(e);
      else to.push(e);
    }
    return { tierExperts: te, tierPotential: tp, tierOther: to };
  }, [dbExperts]);

  const totalExperts = dbTotalExperts;
  const expertsLoading = dbLoading;

  // Plan limits
  const expertLimit = PLAN_LIMITS[plan as PlanId]?.expertRosterLimit ?? 5;
  const isUnlimited = expertLimit === -1;
  const slotsUsed = totalExperts;
  const slotsTotal = isUnlimited ? slotsUsed : expertLimit;
  const slotsRemaining = isUnlimited ? Infinity : Math.max(0, expertLimit - slotsUsed);
  const atLimit = !isUnlimited && slotsUsed >= expertLimit;
  const usagePercent = isUnlimited ? 0 : Math.min(100, Math.round((slotsUsed / slotsTotal) * 100));

  // UI state
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", title: "", linkedinUrl: "" });
  const [addingExpert, setAddingExpert] = useState(false);
  const [invitingExpert, setInvitingExpert] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [expandedExpert, setExpandedExpert] = useState<string | null>(null);

  // Expert is beyond the free limit? (only matters on free plan)
  const isExpertLocked = useCallback(
    (index: number) => !isUnlimited && index >= expertLimit,
    [isUnlimited, expertLimit]
  );

  // Add expert handler
  async function handleAddExpert() {
    if (!addForm.firstName && !addForm.lastName) return;
    if (atLimit) return;
    setAddingExpert(true);
    try {
      const res = await fetch("/api/experts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, organizationId: activeOrg?.id }),
      });
      if (res.ok) {
        setShowAddExpert(false);
        setAddForm({ firstName: "", lastName: "", email: "", title: "", linkedinUrl: "" });
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to add expert:", err);
    } finally {
      setAddingExpert(false);
    }
  }

  // Send invite email
  async function handleSendInvite(expertId: string) {
    setInvitingExpert(expertId);
    try {
      await fetch(`/api/experts/${expertId}/invite`, { method: "POST" });
    } catch (err) {
      console.error("Failed to send invite:", err);
    } finally {
      setInvitingExpert(null);
    }
  }

  // Copy claim link
  async function handleCopyLink(expertId: string) {
    try {
      const res = await fetch(`/api/experts/${expertId}/invite-link`, { method: "POST" });
      if (res.ok) {
        const { claimUrl } = await res.json();
        await navigator.clipboard.writeText(claimUrl);
        setCopiedLink(expertId);
        setTimeout(() => setCopiedLink(null), 2000);
      }
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  }

  // Render a single expert row inside a tier section
  function renderExpertRow(expert: Expert, globalIndex: number) {
    const locked = isExpertLocked(globalIndex);
    if (locked) {
      return (
        <div
          key={expert.id}
          className="flex items-center justify-between px-4 py-3 opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cos-cloud text-cos-slate-light">
              <Lock className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-medium text-cos-slate">{expert.name}</p>
              <p className="text-xs text-cos-slate-dim">{expert.role}</p>
            </div>
          </div>
          <a
            href="/settings/billing"
            className="flex items-center gap-1.5 rounded-cos-pill bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/20"
          >
            <Lock className="h-3 w-3" />
            Upgrade
          </a>
        </div>
      );
    }

    const sps = expert.specialistProfiles ?? [];
    const strongCount = sps.filter((s) => s.qualityStatus === "strong").length;
    const partialCount = sps.filter((s) => s.qualityStatus === "partial").length;
    const primarySp = sps.find((sp) => sp.isPrimary) ?? sps.find((sp) => sp.qualityStatus === "strong");
    const isExpanded = expandedExpert === expert.id;

    return (
      <div key={expert.id}>
        <button
          onClick={() => setExpandedExpert(isExpanded ? null : expert.id)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cos-electric/[0.02]"
        >
          {/* Avatar */}
          {expert.photoUrl ? (
            <img src={expert.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-xs font-semibold text-cos-signal">
              {expert.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
          )}

          {/* Name + Title + Specialist summary */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-cos-midnight">
                {expert.name}
              </span>
              {expert.isFullyEnriched && (
                <Sparkles className="h-3 w-3 shrink-0 text-cos-electric" title="Fully enriched with work history" />
              )}
            </div>
            <p className="truncate text-xs text-cos-slate">
              {primarySp?.qualityStatus === "strong" ? primarySp.title : expert.role}
            </p>
            {sps.length > 0 && (strongCount > 0 || partialCount > 0) && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-signal">
                <Star className="h-2.5 w-2.5" />
                {[
                  strongCount > 0 ? `${strongCount} Strong` : null,
                  partialCount > 0 ? `${partialCount} Partial` : null,
                ].filter(Boolean).join(" · ")}
                {" profile"}{sps.length === 1 ? "" : "s"}
              </p>
            )}
            {sps.length === 0 && (
              <p className="mt-0.5 text-[10px] italic text-cos-slate-light">
                No specialist profiles yet
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {expert.linkedinUrl && (
              <a
                href={expert.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
                title="View LinkedIn"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            {expert.email && (
              <button
                onClick={() => handleSendInvite(expert.id)}
                disabled={invitingExpert === expert.id}
                className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-medium text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
                title="Send invite email"
              >
                {invitingExpert === expert.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
                Invite
              </button>
            )}
            {expert.email && (
              <button
                onClick={() => handleCopyLink(expert.id)}
                className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-medium text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
                title="Copy claim link"
              >
                {copiedLink === expert.id ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedLink === expert.id ? "Copied!" : "Link"}
              </button>
            )}
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-cos-border/20 bg-cos-cloud/20 px-4 py-3 space-y-2">
            {expert.bio && (
              <p className="text-xs leading-relaxed text-cos-slate-dim">{expert.bio}</p>
            )}
            {expert.location && (
              <p className="text-[11px] text-cos-slate-dim">📍 {expert.location}</p>
            )}
            {expert.skills.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Skills</p>
                <div className="flex flex-wrap gap-1">
                  {expert.skills.slice(0, 8).map((s) => (
                    <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate">{s}</span>
                  ))}
                  {expert.skills.length > 8 && (
                    <span className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate-dim">
                      +{expert.skills.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {expert.industries.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Industries</p>
                <div className="flex flex-wrap gap-1">
                  {expert.industries.slice(0, 6).map((ind) => (
                    <span key={ind} className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal">{ind}</span>
                  ))}
                  {expert.industries.length > 6 && (
                    <span className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-slate-dim">
                      +{expert.industries.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {sps.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-electric">
                  Specialist Profiles ({sps.length})
                </p>
                <div className="space-y-1">
                  {sps.slice(0, 4).map((sp) => (
                    <div key={sp.id} className="flex items-center gap-1.5 rounded-cos-md border border-cos-electric/20 bg-white px-2.5 py-1.5">
                      {sp.qualityStatus === "strong" && (
                        <Star className="h-2.5 w-2.5 shrink-0 text-cos-signal" />
                      )}
                      <p className="flex-1 truncate text-[11px] font-medium text-cos-electric">
                        {sp.title || "Untitled"}
                      </p>
                      <span className="shrink-0 text-[9px] text-cos-slate-dim">
                        {Math.round(sp.qualityScore ?? 0)}/100
                      </span>
                    </div>
                  ))}
                  {sps.length > 4 && (
                    <p className="text-[10px] text-cos-slate-dim pl-1">
                      +{sps.length - 4} more profiles
                    </p>
                  )}
                </div>
              </div>
            )}
            {expert.profileUrl && (
              <a
                href={expert.profileUrl}
                className="inline-flex items-center gap-1 rounded-cos-md border border-cos-border px-3 py-1.5 text-[11px] font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
              >
                Edit Profile →
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  // Track global index for plan-limit locking across all tier groups
  let globalIndex = 0;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-5 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Team &amp; Experts
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Manage your team roster. Invite members to claim and edit their profiles.
        </p>
      </div>

      {/* Usage bar */}
      {!planLoading && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-cos-midnight">
                <Users className="h-4 w-4 text-cos-electric" />
                Expert Slots:
                <span className="font-bold text-cos-electric">
                  {slotsUsed}
                </span>
                {!isUnlimited && (
                  <span className="text-cos-slate">/ {slotsTotal} used</span>
                )}
                {isUnlimited && (
                  <span className="text-cos-slate">experts</span>
                )}
              </div>
              {!isUnlimited && (
                <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-medium uppercase text-cos-slate">
                  {plan} plan
                </span>
              )}
            </div>
            {!isUnlimited && (
              <a
                href="/settings/billing"
                className="flex items-center gap-1 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
              >
                Upgrade to Pro for unlimited
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
          {!isUnlimited && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-cos-cloud">
                <div
                  className={`h-full rounded-full transition-all ${
                    atLimit ? "bg-cos-ember" : usagePercent > 60 ? "bg-cos-warm" : "bg-cos-electric"
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-cos-slate-dim">
                {slotsRemaining > 0
                  ? `${slotsRemaining} slot${slotsRemaining === 1 ? "" : "s"} remaining`
                  : "No slots remaining — upgrade to add more experts"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddExpert(true)}
          disabled={atLimit}
          className="h-8 gap-1.5 text-xs"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Expert
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Coming soon"
          className="h-8 gap-1.5 text-xs opacity-60"
        >
          <Linkedin className="h-3.5 w-3.5" />
          Import from LinkedIn
        </Button>
      </div>

      {/* Add Expert Dialog */}
      {showAddExpert && (
        <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-surface p-4">
          <h4 className="mb-3 text-sm font-semibold text-cos-midnight">Add Expert</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="First name *"
              value={addForm.firstName}
              onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
              className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
            />
            <input
              placeholder="Last name"
              value={addForm.lastName}
              onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
              className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
            />
            <input
              placeholder="Email"
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
            />
            <input
              placeholder="Title / Role"
              value={addForm.title}
              onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
              className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
            />
            <input
              placeholder="LinkedIn URL"
              value={addForm.linkedinUrl}
              onChange={(e) => setAddForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
              className="col-span-2 rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAddExpert(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddExpert}
              disabled={addingExpert || (!addForm.firstName && !addForm.lastName)}
              className="h-8 gap-1.5 text-xs bg-cos-electric text-white hover:bg-cos-electric/90"
            >
              {addingExpert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Add Expert
            </Button>
          </div>
        </div>
      )}

      {/* Expert Roster — Grouped by Tier */}
      {expertsLoading || status === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : dbExperts.length > 0 ? (
        <div className="space-y-4">
          {/* Experts section */}
          {tierExperts.length > 0 && (
            <div className="overflow-hidden rounded-cos-lg border border-emerald-200">
              <div className="flex items-center justify-between bg-emerald-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700">Experts</span>
                  <span className="rounded-cos-pill bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {tierExperts.length}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600/70">Client-facing specialists</span>
              </div>
              <div className="divide-y divide-emerald-100">
                {tierExperts.map((expert) => {
                  const row = renderExpertRow(expert, globalIndex);
                  globalIndex++;
                  return row;
                })}
              </div>
            </div>
          )}

          {/* Potential Experts section */}
          {tierPotential.length > 0 && (
            <div className="overflow-hidden rounded-cos-lg border border-amber-200">
              <div className="flex items-center justify-between bg-amber-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-700">Potential Experts</span>
                  <span className="rounded-cos-pill bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {tierPotential.length}
                  </span>
                </div>
                <span className="text-[10px] text-amber-600/70">May be client-facing</span>
              </div>
              <div className="divide-y divide-amber-100">
                {tierPotential.map((expert) => {
                  const row = renderExpertRow(expert, globalIndex);
                  globalIndex++;
                  return row;
                })}
              </div>
            </div>
          )}

          {/* Unclassified / manually added section */}
          {tierOther.length > 0 && (
            <div className="overflow-hidden rounded-cos-lg border border-cos-border/60">
              <div className="flex items-center justify-between bg-cos-cloud/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-cos-slate">Team Members</span>
                  <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-bold text-cos-slate">
                    {tierOther.length}
                  </span>
                </div>
                <span className="text-[10px] text-cos-slate/70">Manually added or unclassified</span>
              </div>
              <div className="divide-y divide-cos-border/30">
                {tierOther.map((expert) => {
                  const row = renderExpertRow(expert, globalIndex);
                  globalIndex++;
                  return row;
                })}
              </div>
            </div>
          )}

          {/* Show nothing-classified note when all are unclassified */}
          {tierExperts.length === 0 && tierPotential.length === 0 && tierOther.length > 0 && (
            <p className="text-center text-[11px] text-cos-slate-dim">
              Your team hasn&apos;t been classified yet. Ask Ossy to discover and classify your team.
            </p>
          )}
        </div>
      ) : extracted?.teamMembers?.length ? (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-cos-slate-dim">
            Detected from website — add as experts to manage them
          </p>
          <div className="flex flex-wrap gap-1.5">
            {extracted.teamMembers.map((name) => (
              <span key={name} className="rounded-cos-pill bg-cos-cloud-dim px-2.5 py-1 text-xs text-cos-slate">
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-10 text-center">
          <Users className="mx-auto h-10 w-10 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No team members yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Add experts manually or ask Ossy to help discover your team.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddExpert(true)}
            className="mt-4 h-8 gap-1.5 text-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Your First Expert
          </Button>
        </div>
      )}

      {/* Locked slots placeholder for free plan */}
      {!isUnlimited && dbExperts.length > 0 && dbExperts.length < expertLimit && (
        <div className="space-y-2">
          {Array.from({ length: Math.min(2, expertLimit - dbExperts.length) }).map((_, i) => (
            <div
              key={`locked-${i}`}
              className="flex items-center justify-between rounded-cos-xl border border-dashed border-cos-border/50 bg-cos-surface/30 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-cos-border bg-cos-cloud/50">
                  <UserPlus className="h-4 w-4 text-cos-slate-light" />
                </div>
                <span className="text-xs text-cos-slate-dim">Empty slot — add an expert</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
