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
  Clock,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useDbExperts } from "@/hooks/use-db-experts";
import { usePlan } from "@/hooks/use-plan";
import { ExpertCard } from "@/components/firm/expert-card";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plan-limits";

const TIER_ORDER: Record<string, number> = { expert: 0, potential_expert: 1 };

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

  // Sort experts: expert tier first, then potential, then unclassified
  const sortedExperts = useMemo(
    () =>
      [...dbExperts].sort(
        (a, b) =>
          (TIER_ORDER[a.expertTier ?? ""] ?? 2) - (TIER_ORDER[b.expertTier ?? ""] ?? 2)
      ),
    [dbExperts]
  );

  // Tier counts for summary bar
  const tierCounts = useMemo(() => {
    let expertCount = 0;
    let potentialCount = 0;
    for (const e of dbExperts) {
      if (e.expertTier === "expert") expertCount++;
      else if (e.expertTier === "potential_expert") potentialCount++;
    }
    return { expertCount, potentialCount };
  }, [dbExperts]);

  const experts = sortedExperts;
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
  const [showAllExperts, setShowAllExperts] = useState(false);

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
        // Reload page to get fresh data
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

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-5 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Team & Experts
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Manage your team roster. Import from LinkedIn, invite members to claim their profiles.
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
        {/* LinkedIn import button is a future feature */}
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

      {/* Expert List */}
      {expertsLoading || status === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : experts.length > 0 ? (
        <div className="space-y-2">
          {/* Tier summary bar */}
          {(tierCounts.expertCount > 0 || tierCounts.potentialCount > 0) && totalExperts > 5 && (
            <div className="flex items-center gap-3 rounded-cos-lg border border-cos-border/40 bg-cos-cloud/30 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate">Team Breakdown</span>
              <span className="flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600">
                {tierCounts.expertCount} Expert-tier
              </span>
              {tierCounts.potentialCount > 0 && (
                <span className="flex items-center gap-1 rounded-cos-pill bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-600">
                  {tierCounts.potentialCount} Potential
                </span>
              )}
            </div>
          )}
          {(showAllExperts ? experts : experts.slice(0, 20)).map((expert, index) => {
            const locked = isExpertLocked(index);

            if (locked) {
              return (
                <div
                  key={expert.id}
                  className="relative rounded-cos-xl border border-cos-border bg-cos-surface/50 p-4 opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cos-cloud text-cos-slate-light">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-cos-slate">{expert.name}</p>
                        <p className="text-[11px] text-cos-slate-dim">{expert.role}</p>
                      </div>
                    </div>
                    <a
                      href="/settings/billing"
                      className="flex items-center gap-1.5 rounded-cos-pill bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/20"
                    >
                      <Lock className="h-3 w-3" />
                      Upgrade to unlock
                    </a>
                  </div>
                </div>
              );
            }

            return (
              <div key={expert.id} className="relative">
                <ExpertCard expert={expert} />
                {/* Claim status and invite actions overlay */}
                {expert.email && !expert.profileUrl?.includes("/edit") && (
                  <div className="absolute right-3 top-3 flex items-center gap-1.5">
                    <button
                      onClick={() => handleSendInvite(expert.id)}
                      disabled={invitingExpert === expert.id}
                      className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 text-[10px] font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                    >
                      {invitingExpert === expert.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      Invite
                    </button>
                    <button
                      onClick={() => handleCopyLink(expert.id)}
                      className="flex items-center gap-1 rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-[10px] font-medium text-cos-slate hover:bg-cos-cloud-dim transition-colors"
                    >
                      {copiedLink === expert.id ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedLink === expert.id ? "Copied!" : "Link"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {experts.length > 20 && !showAllExperts && (
            <button
              onClick={() => setShowAllExperts(true)}
              className="w-full rounded-cos-md border border-cos-border/50 py-2 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/5"
            >
              Show all {totalExperts} experts
            </button>
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
            Add experts manually or ask Ossy to help enrich your team roster from LinkedIn.
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
      {!isUnlimited && experts.length > 0 && experts.length < expertLimit && (
        <div className="space-y-2">
          {Array.from({ length: Math.min(2, expertLimit - experts.length) }).map((_, i) => (
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
