"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, Building2, Globe, Loader2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface PartnerFirm {
  id: string;
  name: string;
  website?: string | null;
  description?: string | null;
}

interface PartnershipData {
  id: string;
  firmAId: string;
  firmBId: string;
  status: string;
  type: string;
  matchScore: number | null;
  matchExplanation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  partnerFirm: PartnerFirm;
  isInitiator: boolean;
}

export default function NetworkPage() {
  const { data: activeOrg } = useActiveOrganization();
  const [partnerships, setPartnerships] = useState<PartnershipData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!activeOrg?.id) {
        setLoading(false);
        return;
      }

      try {
        const firmId = `firm_${activeOrg.id}`;
        const res = await fetch(`/api/partnerships?firmId=${firmId}`);
        if (res.ok) {
          const data = await res.json();
          setPartnerships(data.partnerships ?? []);
        }
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeOrg?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  const accepted = partnerships.filter((p) => p.status === "accepted");
  const requested = partnerships.filter((p) => p.status === "requested");
  const suggested = partnerships.filter((p) => p.status === "suggested");

  const isEmpty = partnerships.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Your Network
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            {isEmpty
              ? "Firms you're connected with."
              : `${accepted.length} active partner${accepted.length !== 1 ? "s" : ""}, ${requested.length} pending`}
          </p>
        </div>
        <Button size="sm" onClick={() => window.location.href = "/discover"}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Find Partners
        </Button>
      </div>

      {/* Active partnerships */}
      {accepted.length > 0 && (
        <PartnershipSection
          title="Active Partners"
          partnerships={accepted}
          statusColor="text-cos-signal"
          statusIcon={<CheckCircle2 className="h-3 w-3" />}
        />
      )}

      {/* Pending requests */}
      {requested.length > 0 && (
        <PartnershipSection
          title="Pending Requests"
          partnerships={requested}
          statusColor="text-cos-electric"
          statusIcon={<Clock className="h-3 w-3" />}
        />
      )}

      {/* Suggested */}
      {suggested.length > 0 && (
        <PartnershipSection
          title="Suggested Partnerships"
          partnerships={suggested}
          statusColor="text-cos-slate"
          statusIcon={<Users className="h-3 w-3" />}
        />
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-signal/10">
            <Users className="h-6 w-6 text-cos-signal" />
          </div>
          <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
            No connections yet
          </h3>
          <p className="mt-1 max-w-xs text-xs text-cos-slate">
            When you connect with partner firms, they&apos;ll appear here. Ask Ossy
            to find potential partners, or search the Discover tab.
          </p>
        </div>
      )}
    </div>
  );
}

function PartnershipSection({
  title,
  partnerships,
  statusColor,
  statusIcon,
}: {
  title: string;
  partnerships: PartnershipData[];
  statusColor: string;
  statusIcon: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
        {title} ({partnerships.length})
      </h3>
      <div className="space-y-2">
        {partnerships.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Building2 className="h-5 w-5 text-cos-electric" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-cos-midnight truncate">
                {p.partnerFirm.name}
              </h4>
              {p.partnerFirm.website && (
                <p className="flex items-center gap-1 text-[10px] text-cos-slate-dim">
                  <Globe className="h-2.5 w-2.5" />
                  {p.partnerFirm.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </p>
              )}
              {p.matchExplanation && (
                <p className="mt-1 text-xs text-cos-slate line-clamp-1">
                  {p.matchExplanation}
                </p>
              )}
            </div>
            <div className={cn("flex items-center gap-1 text-xs font-medium", statusColor)}>
              {statusIcon}
              <span className="capitalize">{p.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
