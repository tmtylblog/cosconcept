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
  ArrowUpRight,
  Sparkles,
  Star,
  Zap,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useDbExperts } from "@/hooks/use-db-experts";
import { useEnrichmentCredits } from "@/hooks/use-enrichment-credits";
import { usePlan } from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";
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

  const {
    credits,
    isLoading: creditsLoading,
    refetch: refetchCredits,
  } = useEnrichmentCredits();

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

  // Credit info
  const availableCredits = credits?.availableCredits ?? 0;
  const totalCredits = credits?.totalCredits ?? 0;
  const usedCredits = credits?.usedCredits ?? 0;
  const isPro = plan === "pro" || plan === "enterprise";
  const isEnterprise = plan === "enterprise";

  // Count enriched vs roster
  const enrichedCount = dbExperts.filter((e) => e.enrichmentStatus === "enriched" || e.isFullyEnriched).length;
  const rosterCount = dbExperts.filter((e) => e.enrichmentStatus !== "enriched" && !e.isFullyEnriched).length;

  // UI state
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", title: "", linkedinUrl: "" });
  const [addingExpert, setAddingExpert] = useState(false);
  const [invitingExpert, setInvitingExpert] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [expandedExpert, setExpandedExpert] = useState<string | null>(null);
  const [enrichingExpert, setEnrichingExpert] = useState<string | null>(null);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchEnriching, setBatchEnriching] = useState(false);

  // Add expert handler
  async function handleAddExpert() {
    if (!addForm.firstName && !addForm.lastName) return;
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

  // Enrich a single expert
  async function handleEnrich(expertId: string) {
    if (availableCredits <= 0) return;
    setEnrichingExpert(expertId);
    try {
      const res = await fetch("/api/experts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertProfileId: expertId }),
      });
      if (res.ok) {
        refetchCredits();
      } else {
        const data = await res.json();
        console.error("Enrich failed:", data.error);
      }
    } catch (err) {
      console.error("Failed to enrich:", err);
    } finally {
      setEnrichingExpert(null);
    }
  }

  // Batch enrich selected experts
  async function handleBatchEnrich() {
    if (selectedForBatch.size === 0 || availableCredits < selectedForBatch.size) return;
    setBatchEnriching(true);
    try {
      const res = await fetch("/api/experts/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertProfileIds: Array.from(selectedForBatch) }),
      });
      if (res.ok) {
        setSelectedForBatch(new Set());
        refetchCredits();
      }
    } catch (err) {
      console.error("Failed to batch enrich:", err);
    } finally {
      setBatchEnriching(false);
    }
  }

  // Toggle expert in batch selection
  const toggleBatchSelect = useCallback((expertId: string) => {
    setSelectedForBatch((prev) => {
      const next = new Set(prev);
      if (next.has(expertId)) next.delete(expertId);
      else next.add(expertId);
      return next;
    });
  }, []);

  // Render a single expert row inside a tier section
  function renderExpertRow(expert: Expert) {
    const isEnriched = expert.enrichmentStatus === "enriched" || expert.isFullyEnriched;
    const isRoster = !isEnriched;
    const sps = expert.specialistProfiles ?? [];
    const strongCount = sps.filter((s) => s.qualityStatus === "strong").length;
    const partialCount = sps.filter((s) => s.qualityStatus === "partial").length;
    const primarySp = sps.find((sp) => sp.isPrimary) ?? sps.find((sp) => sp.qualityStatus === "strong");
    const isExpanded = expandedExpert === expert.id;
    const isEnriching = enrichingExpert === expert.id;
    const isSelected = selectedForBatch.has(expert.id);

    return (
      <div key={expert.id}>
        <div className="flex w-full items-center gap-3 px-4 py-3">
          {/* Batch select checkbox (only for enrichable roster experts) */}
          {isRoster && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleBatchSelect(expert.id)}
              className="h-3.5 w-3.5 shrink-0 rounded border-cos-border accent-cos-electric"
            />
          )}

          {/* Clickable area for expand */}
          <button
            onClick={() => setExpandedExpert(isExpanded ? null : expert.id)}
            className="flex flex-1 items-center gap-3 text-left transition-colors hover:bg-cos-electric/[0.02] rounded-cos-md -mx-1 px-1"
          >
            {/* Avatar */}
            {expert.photoUrl ? (
              <img src={expert.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-xs font-semibold text-cos-signal">
                {expert.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
            )}

            {/* Name + Title + Status */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-cos-midnight">
                  {expert.name}
                </span>
                {isEnriched && (
                  <Sparkles className="h-3 w-3 shrink-0 text-cos-electric" title="Fully enriched with work history" />
                )}
                {isRoster && (
                  <span className="inline-flex items-center gap-0.5 rounded-cos-pill bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
                    Roster
                  </span>
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
              {sps.length === 0 && isEnriched && (
                <p className="mt-0.5 text-[10px] italic text-cos-slate-light">
                  No specialist profiles yet
                </p>
              )}
            </div>
          </button>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Enrich button for roster experts */}
            {isRoster && (
              availableCredits > 0 ? (
                <button
                  onClick={() => handleEnrich(expert.id)}
                  disabled={isEnriching}
                  className="flex h-7 items-center gap-1 rounded-cos-pill bg-cos-electric px-2.5 text-[10px] font-medium text-white transition-colors hover:bg-cos-electric/90 disabled:opacity-50"
                  title="Enrich this expert (uses 1 credit)"
                >
                  {isEnriching ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3" />
                  )}
                  Enrich
                </button>
              ) : !isPro ? (
                <a
                  href="/settings/billing"
                  className="flex h-7 items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2.5 text-[10px] font-medium text-cos-electric transition-colors hover:bg-cos-electric/20"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  Upgrade
                </a>
              ) : (
                <a
                  href="/settings/billing"
                  className="flex h-7 items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2.5 text-[10px] font-medium text-cos-signal transition-colors hover:bg-cos-signal/20"
                >
                  <Zap className="h-3 w-3" />
                  Buy Credits
                </a>
              )
            )}
            {isEnriched && (
              <span className="flex h-7 items-center gap-1 rounded-cos-pill bg-emerald-50 px-2 text-[10px] font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Enriched
              </span>
            )}
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
        </div>

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

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-5 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Team &amp; Experts
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your full team roster pulled from PDL. Enrich experts to unlock full work history, skills, and specialist profiles.
        </p>
      </div>

      {/* Credit bar */}
      {!planLoading && !creditsLoading && credits && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-cos-midnight">
                <Zap className="h-4 w-4 text-cos-electric" />
                Enrichment Credits:
                <span className="font-bold text-cos-electric">
                  {availableCredits}
                </span>
                {!isEnterprise && (
                  <span className="text-cos-slate">/ {totalCredits} remaining</span>
                )}
                {isEnterprise && (
                  <span className="text-cos-slate">unlimited</span>
                )}
              </div>
              <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-medium uppercase text-cos-slate">
                {plan} plan
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isPro && (
                <a
                  href="/settings/billing"
                  className="flex items-center gap-1 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
                >
                  Upgrade to Pro for 100 credits
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
              {isPro && !isEnterprise && availableCredits < 10 && (
                <a
                  href="/settings/billing"
                  className="flex items-center gap-1 text-xs font-medium text-cos-signal transition-colors hover:text-cos-signal/80"
                >
                  Buy Boost Pack (50 credits)
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {!isEnterprise && totalCredits > 0 && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-cos-cloud">
                <div
                  className={`h-full rounded-full transition-all ${
                    availableCredits === 0 ? "bg-cos-ember" : availableCredits < 5 ? "bg-cos-warm" : "bg-cos-electric"
                  }`}
                  style={{ width: `${Math.min(100, Math.round((usedCredits / totalCredits) * 100))}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-cos-slate-dim">
                <span>{usedCredits} credits used</span>
                <span>
                  {enrichedCount} enriched · {rosterCount} roster
                </span>
              </div>
            </div>
          )}

          {/* Stat pills */}
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              {enrichedCount} Enriched
            </span>
            <span className="inline-flex items-center gap-1 rounded-cos-pill bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600">
              <Users className="h-3 w-3" />
              {rosterCount} Roster
            </span>
            <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-cloud px-2 py-1 text-[10px] font-medium text-cos-slate">
              <ShieldCheck className="h-3 w-3" />
              {totalExperts} Total
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddExpert(true)}
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

        {/* Batch enrich button */}
        {selectedForBatch.size > 0 && (
          <Button
            size="sm"
            onClick={handleBatchEnrich}
            disabled={batchEnriching || availableCredits < selectedForBatch.size}
            className="h-8 gap-1.5 text-xs bg-cos-electric text-white hover:bg-cos-electric/90"
          >
            {batchEnriching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Enrich Selected ({selectedForBatch.size})
            {availableCredits < selectedForBatch.size && (
              <span className="text-white/60 ml-1">— not enough credits</span>
            )}
          </Button>
        )}
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
                {tierExperts.map((expert) => renderExpertRow(expert))}
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
                {tierPotential.map((expert) => renderExpertRow(expert))}
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
                {tierOther.map((expert) => renderExpertRow(expert))}
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
            Add experts manually or your team roster will be auto-pulled when your firm profile is set up.
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
    </div>
  );
}
