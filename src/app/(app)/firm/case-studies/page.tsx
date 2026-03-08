"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Globe,
  Search,
  Tag,
  Building2,
  Users,
  ExternalLink,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useLegacyData } from "@/hooks/use-legacy-data";
import { useEnrichment } from "@/hooks/use-enrichment";
import { cn } from "@/lib/utils";
import type { LegacyCaseStudy } from "@/types/cos-data";

const PAGE_SIZE = 25;

export default function CaseStudiesPage() {
  const { data: activeOrg } = useActiveOrganization();
  const {
    caseStudies: legacyCaseStudies,
    totalCaseStudies,
    isLoading: legacyLoading,
  } = useLegacyData(activeOrg?.name);
  const { result } = useEnrichment();
  const discoveredUrls = result?.extracted?.caseStudyUrls ?? [];

  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return legacyCaseStudies;
    const q = searchQuery.toLowerCase();
    return legacyCaseStudies.filter(
      (cs) =>
        cs.title.toLowerCase().includes(q) ||
        cs.clients.some((c) => c.toLowerCase().includes(q)) ||
        cs.skills.some((s) => s.toLowerCase().includes(q)) ||
        cs.industries.some((i) => i.toLowerCase().includes(q)) ||
        cs.aboutText.toLowerCase().includes(q)
    );
  }, [legacyCaseStudies, searchQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/firm"
          className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-dim transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-sm font-semibold text-cos-midnight">
            Case Studies
          </h2>
          <p className="text-[10px] text-cos-slate-dim">
            {legacyLoading
              ? "Loading..."
              : `${totalCaseStudies} legacy · ${discoveredUrls.length} discovered from website`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cos-slate-light" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by title, client, skill, or industry..."
          className="w-full rounded-cos-xl border border-cos-border bg-white py-2 pl-9 pr-3 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
        />
      </div>

      {/* Loading state */}
      {legacyLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      )}

      {/* Legacy case studies */}
      {!legacyLoading && filtered.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Legacy Case Studies
            </p>
            {searchQuery && (
              <p className="text-[10px] text-cos-slate-dim">
                {filtered.length} of {legacyCaseStudies.length} shown
              </p>
            )}
          </div>

          {visible.map((cs) => (
            <LegacyCaseStudyCard key={cs.id} caseStudy={cs} />
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="flex w-full items-center justify-center gap-1.5 rounded-cos-md border border-cos-border/50 py-2 text-xs font-medium text-cos-electric transition-colors hover:bg-cos-electric/5"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* Empty state for legacy */}
      {!legacyLoading && legacyCaseStudies.length === 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-2 text-xs font-medium text-cos-midnight">
            No legacy case studies
          </p>
          <p className="mt-1 text-[10px] text-cos-slate-dim">
            Case studies will appear here once imported or discovered
          </p>
        </div>
      )}

      {/* No search results */}
      {!legacyLoading &&
        legacyCaseStudies.length > 0 &&
        filtered.length === 0 && (
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 text-center">
            <Search className="mx-auto h-6 w-6 text-cos-slate-light" />
            <p className="mt-2 text-xs text-cos-slate-dim">
              No case studies match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}

      {/* Discovered from website */}
      {discoveredUrls.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
            Discovered from Website ({discoveredUrls.length})
          </p>
          <div className="space-y-1">
            {discoveredUrls.map((url, i) => {
              const shortUrl = url
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "");
              const title =
                shortUrl
                  .split("/")
                  .filter(Boolean)
                  .pop()
                  ?.replace(/[-_]/g, " ") ?? shortUrl;
              return (
                <a
                  key={`disc-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-cos-md bg-cos-cloud-dim/50 px-2.5 py-1.5 transition-colors hover:bg-cos-cloud-dim"
                >
                  <Globe className="h-3 w-3 shrink-0 text-cos-slate-dim" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium capitalize text-cos-midnight">
                      {title}
                    </p>
                    <p className="truncate text-[10px] text-cos-slate-dim">
                      {shortUrl}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-cos-electric" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function LegacyCaseStudyCard({ caseStudy }: { caseStudy: LegacyCaseStudy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-slate-dim" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h4 className="flex-1 text-xs font-semibold leading-snug text-cos-midnight line-clamp-2">
                {caseStudy.title}
              </h4>
              <span className="shrink-0 rounded-cos-pill bg-cos-warm/10 px-1.5 py-0.5 text-[9px] font-semibold text-cos-warm">
                For Review
              </span>
            </div>

            {/* Client names */}
            {caseStudy.clients.length > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-cos-slate-dim">
                <Building2 className="h-2.5 w-2.5" />
                <span className="truncate">
                  {caseStudy.clients.join(", ")}
                </span>
              </div>
            )}

            {/* Contributors */}
            {caseStudy.contributorNames.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-slate-dim">
                <Users className="h-2.5 w-2.5" />
                <span className="truncate">
                  {caseStudy.contributorNames.slice(0, 3).join(", ")}
                  {caseStudy.contributorNames.length > 3 &&
                    ` +${caseStudy.contributorNames.length - 3}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-cos-border/30 pt-2">
          {/* About text */}
          {caseStudy.aboutText && (
            <p className="text-[11px] leading-relaxed text-cos-slate-dim">
              {caseStudy.aboutText}
            </p>
          )}

          {/* Skills */}
          {caseStudy.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Skills
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {caseStudy.industries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
                Industries
              </p>
              <div className="flex flex-wrap gap-1">
                {caseStudy.industries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Markets */}
          {caseStudy.markets.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-cos-slate-dim">
              <Globe className="h-2.5 w-2.5" />
              Markets: {caseStudy.markets.join(", ")}
            </div>
          )}

          {/* External links */}
          {caseStudy.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {caseStudy.links.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  View source
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
