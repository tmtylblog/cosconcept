"use client";

import Link from "next/link";
import {
  FileText,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useLegacyData } from "@/hooks/use-legacy-data";
import { ProfileSection, EmptyHint } from "@/components/firm/shared";

export default function FirmExperiencePage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();
  const extracted = result?.extracted;

  const {
    totalCaseStudies,
    isLoading: legacyLoading,
  } = useLegacyData(activeOrg?.name);

  const discoveredCount = extracted?.caseStudyUrls?.length ?? 0;
  const totalCount = totalCaseStudies + discoveredCount;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Experience & Case Studies
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your portfolio of client work and case studies. These demonstrate your ground truth capabilities.
        </p>
      </div>

      {/* Case Studies section */}
      <ProfileSection
        icon={<FileText className="h-4 w-4" />}
        title="Case Studies"
        count={totalCount}
        loading={legacyLoading || status === "loading"}
      >
        {totalCount > 0 ? (
          <Link
            href="/firm/case-studies"
            className="flex items-center gap-3 rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3 transition-colors hover:border-cos-electric/30 hover:bg-cos-electric/3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-cos-md bg-cos-electric/10 text-cos-electric">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-cos-midnight">
                {totalCaseStudies > 0 ? `${totalCaseStudies} case studies` : ""}
                {totalCaseStudies > 0 && discoveredCount > 0 ? " \u00B7 " : ""}
                {discoveredCount > 0 ? `${discoveredCount} discovered from website` : ""}
              </p>
              <p className="text-[10px] text-cos-slate-dim">
                Click to review and manage
              </p>
            </div>
            <span className="shrink-0 rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[9px] font-semibold text-cos-warm">
              For Review
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-cos-slate-light" />
          </Link>
        ) : (
          <EmptyHint text="Case studies from your website and portfolio" />
        )}
      </ProfileSection>

      {/* Empty state */}
      {totalCount === 0 && !legacyLoading && status !== "loading" && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No case studies yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Case studies are the gold standard for partner matching. Ask Ossy to help import them from your website.
          </p>
        </div>
      )}
    </div>
  );
}
