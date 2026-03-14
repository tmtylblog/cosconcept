"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Loader2,
  UserPlus,
  Linkedin,
  Mail,
  Copy,
  Check,
  ArrowUpRight,
  Star,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useDbExperts } from "@/hooks/use-db-experts";
import { useEnrichmentCredits } from "@/hooks/use-enrichment-credits";
import { usePlan } from "@/hooks/use-plan";
import { useTeamDiscovery } from "@/hooks/use-team-discovery";
import { Button } from "@/components/ui/button";
import { TeamDiscoveryProgress } from "@/components/firm/team-discovery-progress";
import type { Expert } from "@/types/cos-data";

const MAX_POLL_ATTEMPTS = 20; // 60 seconds at 3s intervals

export default function FirmExpertsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();
  const extracted = result?.extracted;
  const { plan, isLoading: planLoading } = usePlan();

  const {
    experts: dbExperts,
    total: dbTotalExperts,
    isLoading: dbLoading,
    refetch: refetchExperts,
  } = useDbExperts(activeOrg?.id);

  const {
    credits,
    isLoading: creditsLoading,
    refetch: refetchCredits,
  } = useEnrichmentCredits();

  // Team discovery: auto-trigger when 0 experts
  const discovery = useTeamDiscovery(activeOrg?.id, dbTotalExperts, !dbLoading && !!activeOrg?.id);

  // Refetch when discovery completes
  useEffect(() => {
    if (discovery.phase === "done") {
      refetchExperts();
      refetchCredits();
    }
  }, [discovery.phase, refetchExperts, refetchCredits]);

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
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchEnriching, setBatchEnriching] = useState(false);

  // ── Enrichment polling state ───────────────────────────────────────────────
  const [enrichingExperts, setEnrichingExperts] = useState<Set<string>>(new Set());
  const pollIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollCounts = useRef<Map<string, number>>(new Map());

  // Cleanup polling on unmount
  useEffect(() => {
    const intervals = pollIntervals.current;
    return () => {
      for (const interval of intervals.values()) {
        clearInterval(interval);
      }
      intervals.clear();
    };
  }, []);

  function startPolling(expertId: string) {
    // Don't double-poll
    if (pollIntervals.current.has(expertId)) return;
    pollCounts.current.set(expertId, 0);

    const interval = setInterval(async () => {
      const attempts = (pollCounts.current.get(expertId) ?? 0) + 1;
      pollCounts.current.set(expertId, attempts);

      if (attempts > MAX_POLL_ATTEMPTS) {
        // Give up — stop polling, keep enriching state but let user know
        clearInterval(interval);
        pollIntervals.current.delete(expertId);
        return;
      }

      try {
        const res = await fetch(`/api/experts/${expertId}`);
        if (!res.ok) return;
        const data = await res.json();
        const expert = data.expert ?? data;
        const isNowEnriched = expert.enrichmentStatus === "enriched" ||
          (expert.pdlEnrichedAt && expert.pdlData?.experience?.length > 0);

        if (isNowEnriched) {
          // Done! Stop polling and refresh the list
          clearInterval(interval);
          pollIntervals.current.delete(expertId);
          pollCounts.current.delete(expertId);
          setEnrichingExperts((prev) => {
            const next = new Set(prev);
            next.delete(expertId);
            return next;
          });
          refetchExperts();
          refetchCredits();
        }
      } catch {
        // Ignore fetch errors during polling
      }
    }, 3000);

    pollIntervals.current.set(expertId, interval);
  }

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
        refetchExperts();
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

  // ── Enrich a single expert (with polling) ──────────────────────────────────
  async function handleEnrich(expertId: string) {
    if (availableCredits <= 0) return;

    // Immediately mark as enriching
    setEnrichingExperts((prev) => new Set(prev).add(expertId));

    try {
      const res = await fetch("/api/experts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertProfileId: expertId }),
      });
      if (res.ok) {
        refetchCredits();
        // Start polling for completion
        startPolling(expertId);
      } else {
        const data = await res.json();
        console.error("Enrich failed:", data.error);
        // Remove from enriching on failure
        setEnrichingExperts((prev) => {
          const next = new Set(prev);
          next.delete(expertId);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to enrich:", err);
      setEnrichingExperts((prev) => {
        const next = new Set(prev);
        next.delete(expertId);
        return next;
      });
    }
  }

  // ── Batch enrich selected experts (with polling) ───────────────────────────
  async function handleBatchEnrich() {
    if (selectedForBatch.size === 0 || availableCredits < selectedForBatch.size) return;
    setBatchEnriching(true);

    // Mark all selected as enriching
    setEnrichingExperts((prev) => {
      const next = new Set(prev);
      for (const id of selectedForBatch) next.add(id);
      return next;
    });

    try {
      const res = await fetch("/api/experts/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertProfileIds: Array.from(selectedForBatch) }),
      });
      if (res.ok) {
        // Start polling for each
        for (const id of selectedForBatch) {
          startPolling(id);
        }
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

  // ── Render a single expert row ─────────────────────────────────────────────
  function renderExpertRow(expert: Expert) {
    const isEnriched = expert.enrichmentStatus === "enriched" || expert.isFullyEnriched;
    const isCurrentlyEnriching = enrichingExperts.has(expert.id);
    const isRoster = !isEnriched && !isCurrentlyEnriching;
    const sps = expert.specialistProfiles ?? [];
    const strongCount = sps.filter((s) => s.qualityStatus === "strong").length;
    const partialCount = sps.filter((s) => s.qualityStatus === "partial").length;
    const primarySp = sps.find((sp) => sp.isPrimary) ?? sps.find((sp) => sp.qualityStatus === "strong");
    const isExpanded = expandedExpert === expert.id;
    const isSelected = selectedForBatch.has(expert.id);

    // Left border color based on state
    const borderColor = isCurrentlyEnriching
      ? "border-l-cos-electric"
      : isEnriched
        ? "border-l-cos-signal"
        : "border-l-cos-border";

    return (
      <div
        key={expert.id}
        className={`border-l-2 ${borderColor} ${isCurrentlyEnriching ? "bg-cos-electric/[0.02]" : ""}`}
      >
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

          {/* Avatar */}
          {expert.photoUrl ? (
            <img src={expert.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-xs font-semibold text-cos-signal">
              {expert.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
          )}

          {/* Name + Title + Status — clickable to profile */}
          <Link
            href={`/experts/${expert.id}`}
            className="min-w-0 flex-1 group"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-cos-midnight group-hover:text-cos-electric transition-colors">
                {expert.name}
              </span>
              {isEnriched && (
                <span className="inline-flex items-center gap-0.5 rounded-cos-pill bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Enriched
                </span>
              )}
              {isCurrentlyEnriching && (
                <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-1.5 py-0.5 text-[9px] font-medium text-cos-electric animate-pulse">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Enriching...
                </span>
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
            {/* Specialist profile summary for enriched experts */}
            {sps.length > 0 && (strongCount > 0 || partialCount > 0) && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-signal">
                <Star className="h-2.5 w-2.5" />
                {[
                  strongCount > 0 ? `${strongCount} Strong` : null,
                  partialCount > 0 ? `${partialCount} Partial` : null,
                ].filter(Boolean).join(" \u00B7 ")}
                {" profile"}{sps.length === 1 ? "" : "s"}
              </p>
            )}
            {/* Hint for roster experts */}
            {isRoster && (
              <p className="mt-0.5 text-[10px] text-cos-slate-light">
                Enrich to unlock work history &amp; specialist profiles
              </p>
            )}
          </Link>

          {/* Expand chevron */}
          <button
            onClick={() => setExpandedExpert(isExpanded ? null : expert.id)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Enrich button for roster experts */}
            {isRoster && (
              availableCredits > 0 ? (
                <button
                  onClick={() => handleEnrich(expert.id)}
                  className="flex h-7 items-center gap-1 rounded-cos-pill bg-cos-electric px-2.5 text-[10px] font-medium text-white transition-colors hover:bg-cos-electric/90"
                >
                  <Zap className="h-3 w-3" />
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
            {/* Enriching spinner replaces enrich button */}
            {isCurrentlyEnriching && (
              <span className="flex h-7 items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2.5 text-[10px] font-medium text-cos-electric">
                <Loader2 className="h-3 w-3 animate-spin" />
                Working...
              </span>
            )}
            {/* Enriched badge (only when not currently enriching) */}
            {isEnriched && !isCurrentlyEnriching && (
              <Link
                href={`/experts/${expert.id}`}
                className="flex h-7 items-center gap-1 rounded-cos-pill bg-emerald-50 px-2 text-[10px] font-medium text-emerald-600 hover:bg-emerald-100 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                View Profile
              </Link>
            )}
            {expert.linkedinUrl && (
              <a
                href={expert.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            {expert.email && (
              <button
                onClick={() => handleSendInvite(expert.id)}
                disabled={invitingExpert === expert.id}
                className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-medium text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
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
              <p className="text-[11px] text-cos-slate-dim flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {expert.location}
              </p>
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
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/experts/${expert.id}`}
                className="inline-flex items-center gap-1 rounded-cos-md border border-cos-border px-3 py-1.5 text-[11px] font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
              >
                View Full Profile <ExternalLink className="h-3 w-3" />
              </Link>
              <Link
                href={`/experts/${expert.id}/edit`}
                className="inline-flex items-center gap-1 rounded-cos-md border border-cos-border px-3 py-1.5 text-[11px] font-medium text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
              >
                Edit Profile &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-5 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <p className="text-[9px] text-cos-slate-dim">v7 | phase: {discovery.phase} | org: {activeOrg?.id ?? "none"}</p>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Team &amp; Experts
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your full team roster pulled from PDL. Enrich experts to unlock full work history, skills, and specialist profiles.
        </p>
      </div>

      {/* Team Discovery Progress — replaces everything below when active */}
      {discovery.isActive ? (
        <TeamDiscoveryProgress
          phase={discovery.phase as "checking" | "queued" | "searching" | "enriching" | "error"}
          domain={discovery.domain}
          searchResults={discovery.searchResults}
          enrichProgress={discovery.enrichProgress}
          errorMessage={discovery.errorMessage}
          onRetry={discovery.retry}
        />
      ) : (
      <>
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
                  {enrichedCount} enriched &middot; {rosterCount} roster
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
            {enrichingExperts.size > 0 && (
              <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-1 text-[10px] font-medium text-cos-electric animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                {enrichingExperts.size} Enriching
              </span>
            )}
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
              <span className="text-white/60 ml-1">&mdash; not enough credits</span>
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
            Detected from website &mdash; add as experts to manage them
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
      </>
      )}
    </div>
  );
}
