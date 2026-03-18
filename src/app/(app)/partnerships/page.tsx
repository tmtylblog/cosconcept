"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Handshake,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Users,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitCosSignal } from "@/lib/cos-signal";

// ─── Types ──────────────────────────────────────────────────

interface PartnerFirm {
  id: string;
  name: string;
  website?: string;
  description?: string;
}

interface Partnership {
  id: string;
  firmAId: string;
  firmBId: string;
  status: "suggested" | "requested" | "accepted" | "declined" | "inactive";
  type: string;
  initiatedBy: string;
  matchScore: number | null;
  matchExplanation: string | null;
  notes: string | null;
  acceptedAt: string | null;
  createdAt: string;
  partnerFirm: PartnerFirm;
  isInitiator: boolean;
}

// ─── Stats Bar ──────────────────────────────────────────────

function StatsBar({ partnerships }: { partnerships: Partnership[] }) {
  const active = partnerships.filter((p) => p.status === "accepted").length;
  const pendingIncoming = partnerships.filter(
    (p) => p.status === "requested" && !p.isInitiator
  ).length;
  const pendingOutgoing = partnerships.filter(
    (p) => p.status === "requested" && p.isInitiator
  ).length;
  const introsSent = partnerships.filter(
    (p) => p.status !== "declined" && p.status !== "inactive"
  ).length;

  const stats = [
    { label: "Active Partners", value: active, color: "text-cos-signal" },
    { label: "Incoming Requests", value: pendingIncoming, color: "text-cos-warm" },
    { label: "Outgoing Requests", value: pendingOutgoing, color: "text-cos-electric" },
    { label: "Total Introductions", value: introsSent, color: "text-cos-midnight" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 text-center"
        >
          <p className={cn("font-heading text-2xl font-bold", s.color)}>
            {s.value}
          </p>
          <p className="mt-0.5 text-[11px] text-cos-slate-dim">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Partnership Card ───────────────────────────────────────

function PartnershipCard({
  partnership,
  firmId,
  onAction,
}: {
  partnership: Partnership;
  firmId: string;
  onAction: () => void;
}) {
  const [acting, setActing] = useState(false);

  const statusConfig = {
    accepted: { icon: CheckCircle2, label: "Active", color: "text-cos-signal bg-cos-signal/10" },
    requested: { icon: Clock, label: "Pending", color: "text-cos-warm bg-cos-warm/10" },
    suggested: { icon: Sparkles, label: "Suggested", color: "text-cos-electric bg-cos-electric/10" },
    declined: { icon: XCircle, label: "Declined", color: "text-cos-slate bg-cos-cloud-dim" },
    inactive: { icon: XCircle, label: "Inactive", color: "text-cos-slate bg-cos-cloud-dim" },
  };

  const status = statusConfig[partnership.status];
  const StatusIcon = status.icon;
  const isIncoming = partnership.status === "requested" && !partnership.isInitiator;

  const handleAccept = async () => {
    setActing(true);
    try {
      await fetch(`/api/partnerships/${partnership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      onAction();
      emitCosSignal({
        kind: "action",
        page: "partnerships",
        action: "accept_partnership",
        entityId: partnership.id,
        displayName: partnership.partnerFirm.name,
      });
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    setActing(true);
    try {
      await fetch(`/api/partnerships/${partnership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      onAction();
      emitCosSignal({
        kind: "action",
        page: "partnerships",
        action: "decline_partnership",
        entityId: partnership.id,
        displayName: partnership.partnerFirm.name,
      });
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-heading text-sm font-semibold text-cos-midnight truncate">
              {partnership.partnerFirm.name}
            </h4>
            {partnership.partnerFirm.website && (
              <a
                href={
                  partnership.partnerFirm.website.startsWith("http")
                    ? partnership.partnerFirm.website
                    : `https://${partnership.partnerFirm.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-cos-slate-light hover:text-cos-electric"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {partnership.partnerFirm.description && (
            <p className="mt-0.5 text-xs text-cos-slate line-clamp-1">
              {partnership.partnerFirm.description}
            </p>
          )}
        </div>
        <div className={cn("flex items-center gap-1 rounded-cos-lg px-2 py-0.5 text-xs font-medium", status.color)}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </div>
      </div>

      {partnership.matchScore != null && (
        <div className="flex items-center gap-2 text-xs text-cos-slate-dim">
          <span>Match: {Math.round(partnership.matchScore)}%</span>
          {partnership.type && (
            <>
              <span>&middot;</span>
              <span className="capitalize">{partnership.type.replace(/_/g, " ")}</span>
            </>
          )}
        </div>
      )}

      {partnership.matchExplanation && (
        <p className="text-xs text-cos-slate leading-relaxed line-clamp-2">
          {partnership.matchExplanation}
        </p>
      )}

      {partnership.acceptedAt && (
        <p className="text-[10px] text-cos-slate-dim">
          Accepted {new Date(partnership.acceptedAt).toLocaleDateString()}
        </p>
      )}

      {/* Incoming request actions */}
      {isIncoming && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={acting}
          >
            {acting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3 w-3" />}
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDecline}
            disabled={acting}
          >
            Decline
          </Button>
        </div>
      )}

      {/* Outgoing request status */}
      {partnership.status === "requested" && partnership.isInitiator && (
        <div className="flex items-center gap-1.5 text-xs text-cos-warm">
          <Send className="h-3 w-3" />
          Awaiting response
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

type Tab = "active" | "pending";

export default function PartnershipsPage() {
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");

  const loadPartnerships = useCallback(async () => {
    try {
      // firmId auto-resolved from session when omitted
      const res = await fetch("/api/partnerships");
      if (!res.ok) return;
      const data = await res.json();
      setPartnerships(data.partnerships ?? []);
      if (data.firmId) setFirmId(data.firmId);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartnerships();
  }, [loadPartnerships]);

  const activePartnerships = partnerships.filter((p) => p.status === "accepted");
  const pendingPartnerships = partnerships.filter(
    (p) => p.status === "requested" || p.status === "suggested"
  );

  const displayedPartnerships = tab === "active" ? activePartnerships : pendingPartnerships;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-xl font-bold text-cos-midnight">
            Partnerships
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            Manage your partner network and track introductions.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/partner-matching">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Find New Partners
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <StatsBar partnerships={partnerships} />

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-cos-lg bg-cos-cloud-dim p-1">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "flex-1 rounded-cos-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "active"
              ? "bg-white text-cos-midnight shadow-sm"
              : "text-cos-slate hover:text-cos-midnight"
          )}
        >
          Active ({activePartnerships.length})
        </button>
        <button
          onClick={() => setTab("pending")}
          className={cn(
            "flex-1 rounded-cos-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "pending"
              ? "bg-white text-cos-midnight shadow-sm"
              : "text-cos-slate hover:text-cos-midnight"
          )}
        >
          Pending ({pendingPartnerships.length})
        </button>
      </div>

      {/* Partnership list */}
      {displayedPartnerships.length > 0 ? (
        <div className="space-y-3">
          {displayedPartnerships.map((p) => (
            <PartnershipCard
              key={p.id}
              partnership={p}
              firmId={firmId!}
              onAction={loadPartnerships}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-cos-2xl bg-cos-cloud-dim">
            {tab === "active" ? (
              <Users className="h-8 w-8 text-cos-slate-light" />
            ) : (
              <Clock className="h-8 w-8 text-cos-slate-light" />
            )}
          </div>
          <h3 className="font-heading text-lg font-semibold text-cos-midnight">
            {tab === "active" ? "No active partnerships yet" : "No pending requests"}
          </h3>
          <p className="text-sm text-cos-slate">
            {tab === "active"
              ? "Find your first partner and start growing together."
              : "No partnership requests waiting for action."}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/partner-matching">
              Find Partners
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
