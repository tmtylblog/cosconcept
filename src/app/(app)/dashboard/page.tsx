"use client";

import Link from "next/link";
import {
  Building2,
  Globe,
  MapPin,
  Calendar,
  Users,
  FileText,
  Loader2,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useLegacyData } from "@/hooks/use-legacy-data";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status: enrichmentStatus, result } = useEnrichment();
  const {
    classifiedExpertCount,
    totalCaseStudies,
    isLoading: legacyLoading,
  } = useLegacyData(activeOrg?.name);

  const company = result?.companyData;
  const extracted = result?.extracted;
  const classification = result?.classification;
  const isEnriching = enrichmentStatus === "loading";
  const isDone = enrichmentStatus === "done";
  const isFailed = enrichmentStatus === "failed";
  const hasData = isDone && (company || extracted || classification);

  // Profile completeness calculation
  const completenessFactors = [
    !!company?.name,
    !!company?.industry,
    !!company?.location,
    !!extracted?.aboutPitch,
    (classification?.categories?.length ?? 0) > 0,
    (extracted?.services?.length ?? 0) > 0,
    (classification?.skills?.length ?? 0) > 0,
    (classification?.industries?.length ?? 0) > 0,
    (classification?.markets?.length ?? 0) > 0,
    totalCaseStudies > 0,
    classifiedExpertCount > 0,
  ];
  const completeness = Math.round(
    (completenessFactors.filter(Boolean).length / completenessFactors.length) *
      100
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Enrichment status banner */}
      {isEnriching && (
        <div className="flex items-center gap-3 rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-cos-midnight">
              Researching your firm...
            </p>
            <p className="text-xs text-cos-slate">
              Ossy is analyzing your website and building your profile. This usually takes 30-60 seconds.
            </p>
          </div>
        </div>
      )}

      {isDone && hasData && (
        <div className="flex items-center gap-3 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-5 py-3">
          <CheckCircle2 className="h-5 w-5 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            Research complete — your firm profile is ready
          </p>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-3 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-3">
          <AlertCircle className="h-5 w-5 text-cos-ember" />
          <div>
            <p className="text-sm font-medium text-cos-ember">
              We couldn&apos;t reach that website
            </p>
            <p className="text-xs text-cos-slate mt-0.5">
              Share a working website URL with Ossy to continue as a firm, or proceed as an individual expert.
            </p>
          </div>
        </div>
      )}

      {/* ─── Firm Header ─────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-cos-xl bg-gradient-to-br from-cos-electric/10 to-cos-signal/10">
            <Building2 className="h-7 w-7 text-cos-electric" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl font-bold text-cos-midnight">
              {company?.name || activeOrg?.name || "Your Firm"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cos-slate">
              {company?.industry && (
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-cos-electric" />
                  {company.industry}
                </span>
              )}
              {company?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {company.location}
                </span>
              )}
              {company?.size && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {company.size}
                </span>
              )}
              {company?.founded && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Est. {company.founded}
                </span>
              )}
              {result?.url && (
                <a
                  href={
                    result.url.startsWith("http")
                      ? result.url
                      : `https://${result.url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-cos-electric hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {result.domain}
                </a>
              )}
            </div>

            {/* About pitch */}
            {extracted?.aboutPitch && (
              <p className="mt-3 text-sm leading-relaxed text-cos-slate">
                {extracted.aboutPitch}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Profile Completeness ─────────────────────── */}
      {hasData && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
              Profile Completeness
            </p>
            <span
              className={cn(
                "text-sm font-bold",
                completeness >= 80
                  ? "text-cos-signal"
                  : completeness >= 50
                    ? "text-cos-warm"
                    : "text-cos-slate"
              )}
            >
              {completeness}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-cos-full bg-cos-cloud-dim">
            <div
              className={cn(
                "h-full rounded-cos-full transition-all duration-700",
                completeness >= 80
                  ? "bg-cos-signal"
                  : completeness >= 50
                    ? "bg-cos-warm"
                    : "bg-cos-electric"
              )}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Categories + Services ───────────────────── */}
      {((classification?.categories?.length ?? 0) > 0 ||
        (extracted?.services?.length ?? 0) > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Categories */}
          {(classification?.categories?.length ?? 0) > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                Categories
              </p>
              <div className="flex flex-wrap gap-1.5">
                {classification!.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          {(extracted?.services?.length ?? 0) > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                Services
              </p>
              <div className="flex flex-wrap gap-1.5">
                {extracted!.services.map((svc) => (
                  <span
                    key={svc}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2.5 py-1 text-xs font-medium text-cos-midnight"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Skills ──────────────────────────────────── */}
      {(classification?.skills?.length ?? 0) > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {classification!.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-cos-pill bg-cos-midnight/5 px-2.5 py-1 text-xs text-cos-slate"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Industries + Markets ─────────────────────── */}
      {((classification?.industries?.length ?? 0) > 0 ||
        (classification?.markets?.length ?? 0) > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Industries */}
          {(classification?.industries?.length ?? 0) > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                Industries
              </p>
              <div className="flex flex-wrap gap-1.5">
                {classification!.industries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-cos-pill bg-cos-signal/8 px-2.5 py-1 text-xs font-medium text-cos-signal"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Markets */}
          {(classification?.markets?.length ?? 0) > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">
                Markets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {classification!.markets.map((mkt) => (
                  <span
                    key={mkt}
                    className="rounded-cos-pill bg-cos-warm/10 px-2.5 py-1 text-xs font-medium text-cos-warm"
                  >
                    {mkt}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Case Studies + Experts Counts ───────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Case Studies */}
        <Link
          href="/firm/case-studies"
          className="group flex items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 transition-colors hover:border-cos-electric/30 hover:bg-cos-electric/3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-cos-lg bg-cos-warm/10">
            <FileText className="h-5 w-5 text-cos-warm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold text-cos-midnight">
              {legacyLoading ? (
                <Loader2 className="inline h-5 w-5 animate-spin text-cos-slate" />
              ) : (
                totalCaseStudies
              )}
            </p>
            <p className="text-xs text-cos-slate">case studies identified</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-cos-slate-light transition-colors group-hover:text-cos-electric" />
        </Link>

        {/* Experts */}
        <Link
          href="/firm"
          className="group flex items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 transition-colors hover:border-cos-electric/30 hover:bg-cos-electric/3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-cos-lg bg-cos-signal/10">
            <Users className="h-5 w-5 text-cos-signal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold text-cos-midnight">
              {legacyLoading ? (
                <Loader2 className="inline h-5 w-5 animate-spin text-cos-slate" />
              ) : (
                classifiedExpertCount
              )}
            </p>
            <p className="text-xs text-cos-slate">experts identified</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-cos-slate-light transition-colors group-hover:text-cos-electric" />
        </Link>
      </div>

      {/* ─── Empty State (no enrichment yet) ──────────── */}
      {enrichmentStatus === "idle" && !hasData && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Sparkles className="h-6 w-6 text-cos-electric" />
          </div>
          <h3 className="font-heading text-base font-semibold text-cos-midnight">
            Let&apos;s build your profile
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-cos-slate">
            Share your firm&apos;s website with Ossy in the chat and we&apos;ll
            automatically research and populate your firm profile.
          </p>
        </div>
      )}
    </div>
  );
}
