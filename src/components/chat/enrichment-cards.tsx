"use client";

import {
  Building2,
  Briefcase,
  Users,
  Wrench,
  Globe,
  Loader2,
  Check,
  MapPin,
  Calendar,
} from "lucide-react";
import Image from "next/image";
import { useEnrichment, type StageStatus } from "@/hooks/use-enrichment";
import { cn } from "@/lib/utils";

// ─── Compact Cards for Chat Panel ───────────────────────────

/** Compact pill list — wraps in a tight layout for the narrow chat column */
function MiniPills({
  items,
  className,
  max = 6,
}: {
  items: string[];
  className: string;
  max?: number;
}) {
  const display = items.slice(0, max);
  const overflow = items.length > max ? items.length - max : 0;
  return (
    <div className="flex flex-wrap gap-1">
      {display.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-cos-pill px-2 py-0.5 text-[10px] font-medium leading-tight",
            className
          )}
        >
          {item}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Stage dot indicator */
function StageDot({ label, stage }: { label: string; stage: StageStatus }) {
  if (stage === "idle") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium",
        stage === "loading" && "text-cos-electric",
        stage === "done" && "text-cos-signal",
        stage === "failed" && "text-cos-slate"
      )}
    >
      {stage === "loading" && (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      {stage === "done" && <Check className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────

/**
 * Inline enrichment cards that appear in the chat flow.
 * Shows progressive data as enrichment stages complete.
 * Compact layout designed for the narrow chat column.
 */
export function ChatEnrichmentCards() {
  const { status, stages, result } = useEnrichment();

  // Don't render when idle or nothing to show
  if (status === "idle") return null;

  const isEnriching = status === "loading";
  const company = result?.companyData;
  const classification = result?.classification;
  const extracted = result?.extracted;
  const domain = result?.domain;
  const logoUrl = result?.logoUrl;

  return (
    <div className="mx-2 my-3 space-y-2">
      {/* ─── Enrichment Progress ─── */}
      {isEnriching && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
            <span className="text-xs font-semibold text-cos-midnight">
              Researching your firm...
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <StageDot label="Company data" stage={stages.pdl} />
            <StageDot label="Website scan" stage={stages.scrape} />
            <StageDot label="Classification" stage={stages.classify} />
          </div>
        </div>
      )}

      {/* ─── Company Identity Card ─── */}
      {(result || isEnriching) && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          {result ? (
            <div className="flex items-start gap-2.5">
              {/* Logo */}
              {(logoUrl || domain) && (
                <img
                  src={logoUrl || `https://logo.clearbit.com/${domain}`}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-cos-lg border border-cos-border/30 bg-white object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-cos-midnight leading-tight">
                  {company?.name ||
                    (domain
                      ? domain.split(".")[0].charAt(0).toUpperCase() +
                        domain.split(".")[0].slice(1)
                      : "Unknown")}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-cos-slate">
                  {company?.size && (
                    <span className="flex items-center gap-0.5">
                      <Users className="h-2.5 w-2.5" />
                      {company.size}
                      {company.employeeCount
                        ? ` (${company.employeeCount.toLocaleString()})`
                        : ""}
                    </span>
                  )}
                  {company?.location && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {company.location}
                    </span>
                  )}
                  {company?.founded && (
                    <span className="flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />
                      Est. {company.founded}
                    </span>
                  )}
                </div>
                {company?.industry && (
                  <span className="mt-1 inline-block rounded-cos-pill bg-cos-electric/8 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
                    {company.industry}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex animate-pulse items-start gap-2.5">
              <div className="h-9 w-9 shrink-0 rounded-cos-lg bg-cos-cloud" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-cos-cloud" />
                <div className="h-2.5 w-36 rounded bg-cos-cloud" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Categories ─── */}
      {classification?.categories && classification.categories.length > 0 && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
            <Building2 className="h-3 w-3" />
            Category
          </div>
          <MiniPills
            items={classification.categories}
            className="bg-cos-electric/8 text-cos-electric"
          />
        </div>
      )}

      {/* ─── Services ─── */}
      {extracted?.services && extracted.services.length > 0 && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
            <Briefcase className="h-3 w-3" />
            Services
          </div>
          <MiniPills
            items={extracted.services}
            className="bg-cos-electric/8 text-cos-electric"
            max={8}
          />
        </div>
      )}

      {/* ─── Clients ─── */}
      {extracted?.clients && extracted.clients.length > 0 && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
            <Users className="h-3 w-3" />
            Clients
          </div>
          <MiniPills
            items={extracted.clients}
            className="bg-cos-signal/8 text-cos-signal"
            max={8}
          />
        </div>
      )}

      {/* ─── Skills ─── */}
      {classification?.skills && classification.skills.length > 0 && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
            <Wrench className="h-3 w-3" />
            Skills
          </div>
          <MiniPills
            items={classification.skills}
            className="bg-cos-midnight/6 text-cos-midnight"
            max={8}
          />
        </div>
      )}

      {/* ─── Industries & Markets (combined compact) ─── */}
      {((classification?.industries && classification.industries.length > 0) ||
        (classification?.markets && classification.markets.length > 0)) && (
        <div className="animate-slide-up rounded-cos-xl border border-cos-border/40 bg-white px-3 py-2.5 shadow-sm">
          {classification?.industries && classification.industries.length > 0 && (
            <>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
                <Globe className="h-3 w-3" />
                Industries
              </div>
              <MiniPills
                items={classification.industries}
                className="bg-cos-signal/8 text-cos-signal"
              />
            </>
          )}
          {classification?.markets && classification.markets.length > 0 && (
            <div className={classification?.industries?.length ? "mt-2" : ""}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cos-slate">
                <MapPin className="h-3 w-3" />
                Markets
              </div>
              <p className="text-[11px] text-cos-midnight">
                {classification.markets.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
