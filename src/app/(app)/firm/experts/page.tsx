"use client";

import { useState } from "react";
import {
  Users,
  Loader2,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useLegacyData } from "@/hooks/use-legacy-data";
import { useDbExperts } from "@/hooks/use-db-experts";
import { ExpertCard } from "@/components/firm/expert-card";
import { ProfileSection, EmptyHint } from "@/components/firm/shared";

export default function FirmExpertsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();
  const extracted = result?.extracted;

  const {
    experts: legacyExperts,
    totalExperts: legacyTotalExperts,
    isLoading: legacyLoading,
  } = useLegacyData(activeOrg?.name);

  const {
    experts: dbExperts,
    total: dbTotalExperts,
    isLoading: dbLoading,
  } = useDbExperts(activeOrg?.id);

  // Prefer DB experts (quality-scored) over legacy JSON experts
  const experts = dbExperts.length > 0 ? dbExperts : legacyExperts;
  const totalExperts = dbExperts.length > 0 ? dbTotalExperts : legacyTotalExperts;
  const expertsLoading = dbLoading || legacyLoading;

  const [showAllExperts, setShowAllExperts] = useState(false);

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Team & Experts
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your team roster enriched from LinkedIn and website data.
        </p>
      </div>

      {/* Experts list */}
      <ProfileSection
        icon={<Users className="h-4 w-4" />}
        title="Experts"
        count={totalExperts || undefined}
        loading={expertsLoading || status === "loading"}
      >
        {experts.length > 0 ? (
          <div className="space-y-2">
            {(showAllExperts ? experts : experts.slice(0, 20)).map((expert) => (
              <ExpertCard key={expert.id} expert={expert} />
            ))}
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
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-cos-slate-dim">
              Detected from website
            </p>
            <div className="flex flex-wrap gap-1">
              {extracted.teamMembers.map((name) => (
                <span key={name} className="rounded-cos-pill bg-cos-cloud-dim px-2 py-0.5 text-[10px] text-cos-slate-dim">
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <EmptyHint text="Expert profiles will appear here. We can enrich your team from LinkedIn." />
        )}
      </ProfileSection>

      {/* Empty state for no experts at all */}
      {experts.length === 0 && !extracted?.teamMembers?.length && !expertsLoading && status !== "loading" && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
          <Users className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No team members found yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Ask Ossy to help enrich your team roster from LinkedIn or add team members manually.
          </p>
        </div>
      )}
    </div>
  );
}
