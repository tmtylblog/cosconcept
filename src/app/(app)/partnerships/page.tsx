"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Handshake,
  Send,
  Inbox,
  Check,
  X,
  Clock,
  ArrowRight,
  Building2,
  TrendingUp,
  Share2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";

// ─── Types ──────────────────────────────────────────────

interface PartnerFirm {
  id: string;
  name: string;
  website?: string | null;
  description?: string | null;
}

interface PartnershipItem {
  id: string;
  firmAId: string;
  firmBId: string;
  status: string;
  type: string;
  matchScore?: number | null;
  matchExplanation?: string | null;
  notes?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  partnerFirm: PartnerFirm;
  isInitiator: boolean;
}

interface ReferralStats {
  totalGiven: number;
  totalReceived: number;
  convertedGiven: number;
  convertedReceived: number;
  estimatedValueGiven: number;
  actualValueConverted: number;
}

type TabId = "active" | "pending" | "opportunities";

// ─── Page ───────────────────────────────────────────────

export default function PartnershipsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const [tab, setTab] = useState<TabId>("active");
  const [partnerships, setPartnerships] = useState<PartnershipItem[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const firmId = activeOrg?.id ?? null;

  const fetchPartnerships = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/partnerships?firmId=${firmId}`);
      if (res.ok) {
        const data = await res.json();
        setPartnerships(data.partnerships ?? []);
      }
    } catch {
      /* ignore */
    }

    try {
      const refRes = await fetch(`/api/referrals?firmId=${firmId}`);
      if (refRes.ok) {
        const data = await refRes.json();
        setReferralStats(data.stats ?? null);
      }
    } catch {
      /* ignore */
    }

    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    fetchPartnerships();
  }, [fetchPartnerships]);

  const handleRespond = async (partnershipId: string, action: "accept" | "decline") => {
    try {
      const res = await fetch(`/api/partnerships/${partnershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchPartnerships();
      }
    } catch {
      /* ignore */
    }
  };

  const active = partnerships.filter((p) => p.status === "accepted");
  const pending = partnerships.filter(
    (p) => p.status === "requested" || p.status === "suggested"
  );

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "active", label: "Active", count: active.length },
    { id: "pending", label: "Pending", count: pending.length },
    { id: "opportunities", label: "Opportunities", count: 0 },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Partnerships
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            Manage your trusted partners, track referrals, and share opportunities.
          </p>
        </div>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Find Partners
        </Button>
      </div>

      {/* Referral Stats */}
      {referralStats && (referralStats.totalGiven > 0 || referralStats.totalReceived > 0) && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Active Partners"
            value={active.length.toString()}
            icon={<Handshake className="h-4 w-4 text-cos-electric" />}
          />
          <StatCard
            label="Referrals Given"
            value={referralStats.totalGiven.toString()}
            icon={<Send className="h-4 w-4 text-green-600" />}
          />
          <StatCard
            label="Referrals Received"
            value={referralStats.totalReceived.toString()}
            icon={<Inbox className="h-4 w-4 text-blue-600" />}
          />
          <StatCard
            label="Revenue Generated"
            value={`$${(referralStats.actualValueConverted / 1000).toFixed(0)}K`}
            icon={<TrendingUp className="h-4 w-4 text-cos-warm" />}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cos-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-cos-electric text-cos-electric"
                : "border-transparent text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-xs text-cos-electric">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cos-electric border-t-transparent" />
        </div>
      ) : tab === "active" ? (
        active.length > 0 ? (
          <div className="space-y-3">
            {active.map((p) => (
              <PartnershipCard key={p.id} partnership={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Handshake className="h-8 w-8 text-cos-slate-light" />}
            title="No active partnerships"
            description="Use Discover to find firms that complement your services, then request partnerships."
          />
        )
      ) : tab === "pending" ? (
        pending.length > 0 ? (
          <div className="space-y-3">
            {pending.map((p) => (
              <PendingCard
                key={p.id}
                partnership={p}
                onRespond={handleRespond}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Clock className="h-8 w-8 text-cos-slate-light" />}
            title="No pending requests"
            description="When you or another firm requests a partnership, it will appear here."
          />
        )
      ) : (
        <EmptyState
          icon={<Share2 className="h-8 w-8 text-cos-slate-light" />}
          title="No opportunities yet"
          description="Create opportunities to share with your trusted partners, or wait for partners to share theirs."
        />
      )}
    </div>
  );
}

// ─── Components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-cos-slate">{label}</span>
      </div>
      <p className="mt-2 font-heading text-2xl font-semibold text-cos-midnight">
        {value}
      </p>
    </div>
  );
}

function PartnershipCard({ partnership }: { partnership: PartnershipItem }) {
  const scorePercent = partnership.matchScore
    ? Math.round(partnership.matchScore * 100)
    : null;

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 hover:border-cos-electric/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-green-100">
            <Handshake className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-cos-midnight">
              {partnership.partnerFirm.name}
            </h3>
            <p className="mt-0.5 text-xs text-cos-slate">
              {partnership.type.replace(/_/g, " ")} · Partner since{" "}
              {partnership.acceptedAt
                ? new Date(partnership.acceptedAt).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
        </div>
        {scorePercent !== null && (
          <span className="rounded-cos-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {scorePercent}% match
          </span>
        )}
      </div>

      {partnership.matchExplanation && (
        <p className="mt-3 text-sm text-cos-midnight/80">
          {partnership.matchExplanation}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" size="sm">
          View Profile
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="text-cos-slate">
          <Share2 className="mr-1 h-3 w-3" />
          Share Opportunity
        </Button>
      </div>
    </div>
  );
}

function PendingCard({
  partnership,
  onRespond,
}: {
  partnership: PartnershipItem;
  onRespond: (id: string, action: "accept" | "decline") => void;
}) {
  const isIncoming = !partnership.isInitiator;

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <Building2 className="h-5 w-5 text-cos-electric" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-cos-midnight">
              {partnership.partnerFirm.name}
            </h3>
            <p className="mt-0.5 text-xs text-cos-slate">
              {isIncoming ? "Wants to partner with you" : "You requested this partnership"}{" "}
              · {new Date(partnership.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="rounded-cos-full bg-cos-warm/10 px-2 py-0.5 text-xs font-medium text-cos-warm">
          {partnership.status}
        </span>
      </div>

      {partnership.notes && (
        <p className="mt-3 text-sm text-cos-midnight/80 italic">
          &ldquo;{partnership.notes}&rdquo;
        </p>
      )}

      {isIncoming && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onRespond(partnership.id, "accept")}
          >
            <Check className="mr-1 h-3 w-3" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRespond(partnership.id, "decline")}
          >
            <X className="mr-1 h-3 w-3" />
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-12 text-center">
      {icon}
      <h3 className="mt-3 font-heading text-sm font-semibold text-cos-midnight">
        {title}
      </h3>
      <p className="mt-1 max-w-xs text-xs text-cos-slate">{description}</p>
    </div>
  );
}
