"use client";

import { useState, useEffect } from "react";
import {
  X,
  Building2,
  User,
  BookOpen,
  Globe,
  Briefcase,
  ExternalLink,
  ArrowLeft,
  Linkedin,
  Users,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types mirrored from page.tsx ─────────────────────────

interface MatchCandidate {
  entityType: "firm" | "expert" | "case_study";
  entityId: string;
  displayName: string;
  totalScore: number;
  preview: {
    categories: string[];
    topServices: string[];
    topSkills: string[];
    industries: string[];
    markets?: string[];
    subtitle?: string;
    firmName?: string;
    website?: string;
    caseStudyCount?: number;
    specialistProfileCount?: number;
    primarySpecialistTitle?: string;
    languages?: string[];
    contributorCount?: number;
    employeeCount?: number;
  };
}

interface EntityDetail {
  entityType: "firm" | "expert" | "case_study";
  data: FirmDetail | ExpertDetail | CaseStudyDetail;
}

interface FirmDetail {
  name: string;
  website: string | null;
  linkedinUrl: string | null;
  sizeBand: string | null;
  description: string | null;
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  caseStudies: Array<{
    legacyId: string;
    summary: string | null;
    skills: string[];
    industries: string[];
  }>;
  experts: Array<{
    legacyId: string;
    displayName: string;
    title: string | null;
  }>;
}

interface ExpertDetail {
  legacyId: string;
  displayName: string;
  email: string | null;
  linkedinUrl: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  specialistProfiles: Array<{
    title: string | null;
    description: string | null;
    skills: string[];
  }>;
  caseStudies: Array<{
    legacyId: string;
    summary: string | null;
    firmName: string | null;
    skills: string[];
    industries: string[];
  }>;
}

interface CaseStudyDetail {
  legacyId: string;
  summary: string | null;
  sourceUrl: string | null;
  status: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  skills: string[];
  industries: string[];
  contributors: Array<{
    legacyId: string;
    displayName: string;
    title: string | null;
  }>;
}

// ─── Props ────────────────────────────────────────────────

interface DrawerProps {
  result: MatchCandidate;
  onClose: () => void;
  onNavigate: (r: MatchCandidate) => void;
  searchQuery: string;
}

// ─── Main Drawer ──────────────────────────────────────────

export function DiscoverDrawer({ result, onClose, searchQuery }: DrawerProps) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MatchCandidate[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(
      `/api/discover/entity?entityId=${encodeURIComponent(result.entityId)}&entityType=${result.entityType}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setDetail(d);
      })
      .catch(() => setError("Failed to load details"))
      .finally(() => setLoading(false));
  }, [result.entityId, result.entityType]);

  const score = Math.round(result.totalScore * 100);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-cos-border px-5 py-4">
        {history.length > 0 && (
          <button
            onClick={() => setHistory((h) => h.slice(0, -1))}
            className="text-cos-slate hover:text-cos-midnight"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <EntityIcon type={result.entityType} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-semibold text-cos-midnight">
            {result.displayName}
          </p>
          <p className="text-[11px] text-cos-slate capitalize">
            {result.entityType.replace("_", " ")} · {score}% fit
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-cos-slate hover:text-cos-midnight"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {loading && <DrawerSkeleton />}
        {error && (
          <div className="rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 p-4 text-sm text-cos-ember">
            {error}
          </div>
        )}
        {!loading && !error && detail && (
          <>
            {detail.entityType === "firm" && (
              <FirmDrawerContent
                data={detail.data as FirmDetail}
                searchQuery={searchQuery}
              />
            )}
            {detail.entityType === "expert" && (
              <ExpertDrawerContent
                data={detail.data as ExpertDetail}
                searchQuery={searchQuery}
              />
            )}
            {detail.entityType === "case_study" && (
              <CaseStudyDrawerContent
                data={detail.data as CaseStudyDetail}
                searchQuery={searchQuery}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Firm Detail ──────────────────────────────────────────

function FirmDrawerContent({
  data,
  searchQuery,
}: {
  data: FirmDetail;
  searchQuery: string;
}) {
  return (
    <>
      {/* About */}
      <Section title="About">
        {data.description ? (
          <p className="text-sm text-cos-midnight/80 leading-relaxed">
            {data.description}
          </p>
        ) : (
          <p className="text-sm italic text-cos-slate">No description available.</p>
        )}
      </Section>

      {/* Quick facts */}
      <div className="grid grid-cols-2 gap-3">
        {data.website && (
          <QuickFact
            icon={Globe}
            label="Website"
            value={
              <a
                href={data.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-cos-electric hover:underline"
              >
                {new URL(data.website).hostname}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        {data.linkedinUrl && (
          <QuickFact
            icon={Linkedin}
            label="LinkedIn"
            value={
              <a
                href={data.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-cos-electric hover:underline"
              >
                View profile
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        {data.sizeBand && (
          <QuickFact
            icon={Users}
            label="Size"
            value={<span className="capitalize">{data.sizeBand.replace(/_/g, " ")}</span>}
          />
        )}
      </div>

      {/* Categories */}
      {data.categories.length > 0 && (
        <Section title="Categories">
          <TagCloud tags={data.categories} color="electric" />
        </Section>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <Section title="Skills">
          <TagCloud tags={data.skills} color="slate" />
        </Section>
      )}

      {/* Industries */}
      {data.industries.length > 0 && (
        <Section title="Industries">
          <TagCloud tags={data.industries} color="warm" />
        </Section>
      )}

      {/* Markets */}
      {data.markets.length > 0 && (
        <Section title="Markets">
          <TagCloud tags={data.markets} color="electric" />
        </Section>
      )}

      {/* Case Studies */}
      {data.caseStudies.length > 0 && (
        <Section title={`Case Studies (${data.caseStudies.length})`}>
          <div className="space-y-2">
            {data.caseStudies.map((cs, i) => (
              <CaseStudyMini key={cs.legacyId ?? i} cs={cs} />
            ))}
          </div>
        </Section>
      )}

      {/* Experts at this firm */}
      {data.experts.length > 0 && (
        <Section title={`Experts (${data.experts.length})`}>
          <div className="space-y-2">
            {data.experts.map((exp, i) => (
              <PersonMini key={exp.legacyId ?? i} person={exp} />
            ))}
          </div>
        </Section>
      )}

      {/* CTA */}
      <div className="pt-2">
        <Button className="w-full">Request Partnership</Button>
        <p className="mt-2 text-center text-[11px] text-cos-slate">
          Searching for: &ldquo;{searchQuery}&rdquo;
        </p>
      </div>
    </>
  );
}

// ─── Expert Detail ────────────────────────────────────────

function ExpertDrawerContent({
  data,
  searchQuery,
}: {
  data: ExpertDetail;
  searchQuery: string;
}) {
  return (
    <>
      {/* Firm affiliation */}
      {data.firmName && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud px-4 py-3">
          <Building2 className="h-4 w-4 shrink-0 text-cos-electric" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-cos-midnight">{data.firmName}</p>
            {data.firmWebsite && (
              <a
                href={data.firmWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cos-slate hover:text-cos-electric"
              >
                {new URL(data.firmWebsite).hostname}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex flex-wrap gap-2">
        {data.linkedinUrl && (
          <a
            href={data.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-electric hover:text-cos-electric"
          >
            <Linkedin className="h-3 w-3" />
            LinkedIn
          </a>
        )}
        {data.languages.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate">
            <Globe className="h-3 w-3" />
            {data.languages.join(", ")}
          </span>
        )}
      </div>

      {/* Specialist Profiles */}
      {data.specialistProfiles.length > 0 && (
        <Section title="Specialist Profiles">
          <div className="space-y-3">
            {data.specialistProfiles.map((sp, i) => (
              <div key={i} className="rounded-cos-xl border border-cos-border p-3">
                {sp.title && (
                  <p className="text-sm font-medium text-cos-midnight">{sp.title}</p>
                )}
                {sp.description && (
                  <p className="mt-1 text-xs text-cos-slate leading-relaxed line-clamp-3">
                    {sp.description}
                  </p>
                )}
                {sp.skills.length > 0 && (
                  <div className="mt-2">
                    <TagCloud tags={sp.skills} color="electric" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <Section title="Skills">
          <TagCloud tags={data.skills} color="slate" />
        </Section>
      )}

      {/* Industries */}
      {data.industries.length > 0 && (
        <Section title="Industries Served">
          <TagCloud tags={data.industries} color="warm" />
        </Section>
      )}

      {/* Markets */}
      {data.markets.length > 0 && (
        <Section title="Markets">
          <TagCloud tags={data.markets} color="electric" />
        </Section>
      )}

      {/* Case Studies */}
      {data.caseStudies.length > 0 && (
        <Section title={`Case Studies (${data.caseStudies.length})`}>
          <div className="space-y-2">
            {data.caseStudies.map((cs, i) => (
              <CaseStudyMini key={cs.legacyId ?? i} cs={cs} showFirm />
            ))}
          </div>
        </Section>
      )}

      {/* CTA */}
      <div className="pt-2">
        <Button className="w-full">Request Introduction</Button>
        <p className="mt-2 text-center text-[11px] text-cos-slate">
          Searching for: &ldquo;{searchQuery}&rdquo;
        </p>
      </div>
    </>
  );
}

// ─── Case Study Detail ────────────────────────────────────

function CaseStudyDrawerContent({
  data,
  searchQuery,
}: {
  data: CaseStudyDetail;
  searchQuery: string;
}) {
  return (
    <>
      {/* Firm */}
      {data.firmName && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud px-4 py-3">
          <Building2 className="h-4 w-4 shrink-0 text-cos-signal" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-cos-midnight">by {data.firmName}</p>
            {data.firmWebsite && (
              <a
                href={data.firmWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cos-slate hover:text-cos-electric"
              >
                {new URL(data.firmWebsite).hostname}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      <Section title="Summary">
        {data.summary ? (
          <p className="text-sm text-cos-midnight/80 leading-relaxed">{data.summary}</p>
        ) : (
          <p className="text-sm italic text-cos-slate">No summary available.</p>
        )}
      </Section>

      {/* Source link */}
      {data.sourceUrl && (
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-cos-full border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:border-cos-signal hover:text-cos-signal"
        >
          <ExternalLink className="h-3 w-3" />
          View original case study
        </a>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <Section title="Skills Demonstrated">
          <TagCloud tags={data.skills} color="slate" />
        </Section>
      )}

      {/* Industries */}
      {data.industries.length > 0 && (
        <Section title="Industries">
          <TagCloud tags={data.industries} color="warm" />
        </Section>
      )}

      {/* Contributors */}
      {data.contributors.length > 0 && (
        <Section title={`Contributors (${data.contributors.length})`}>
          <div className="space-y-2">
            {data.contributors.map((c, i) => (
              <PersonMini key={c.legacyId ?? i} person={c} />
            ))}
          </div>
        </Section>
      )}

      {/* CTA */}
      <div className="pt-2">
        <p className="text-center text-[11px] text-cos-slate">
          Searching for: &ldquo;{searchQuery}&rdquo;
        </p>
      </div>
    </>
  );
}

// ─── Shared sub-components ────────────────────────────────

function EntityIcon({ type }: { type: "firm" | "expert" | "case_study" }) {
  const cfg = {
    firm: { Icon: Building2, cls: "bg-cos-electric/10 text-cos-electric" },
    expert: { Icon: User, cls: "bg-cos-warm/10 text-cos-warm" },
    case_study: { Icon: BookOpen, cls: "bg-cos-signal/10 text-cos-signal" },
  }[type];
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-lg ${cfg.cls}`}>
      <cfg.Icon className="h-4 w-4" />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cos-slate-light">
        {title}
      </p>
      {children}
    </div>
  );
}

function QuickFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-cos-xl border border-cos-border p-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-slate" />
      <div>
        <p className="text-[10px] text-cos-slate-light">{label}</p>
        <div className="text-xs text-cos-midnight">{value}</div>
      </div>
    </div>
  );
}

type TagColor = "electric" | "warm" | "signal" | "slate";

function TagCloud({ tags, color }: { tags: string[]; color: TagColor }) {
  const cls: Record<TagColor, string> = {
    electric: "bg-cos-electric/10 text-cos-electric",
    warm: "bg-cos-warm/10 text-cos-warm",
    signal: "bg-cos-signal/10 text-cos-signal",
    slate: "bg-cos-cloud text-cos-slate",
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className={`rounded-cos-full px-2 py-0.5 text-xs ${cls[color]}`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function CaseStudyMini({
  cs,
  showFirm = false,
}: {
  cs: {
    legacyId: string;
    summary: string | null;
    firmName?: string | null;
    skills: string[];
    industries: string[];
  };
  showFirm?: boolean;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border p-3">
      {showFirm && cs.firmName && (
        <p className="mb-1 text-[11px] text-cos-slate">by {cs.firmName}</p>
      )}
      {cs.summary ? (
        <p className="text-xs text-cos-midnight/80 leading-relaxed line-clamp-3">
          {cs.summary}
        </p>
      ) : (
        <p className="text-xs italic text-cos-slate">No summary</p>
      )}
      {(cs.skills.length > 0 || cs.industries.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cs.skills.slice(0, 3).map((s) => (
            <span key={s} className="rounded-cos-full bg-cos-cloud px-1.5 py-0.5 text-[10px] text-cos-slate">
              {s}
            </span>
          ))}
          {cs.industries.slice(0, 2).map((i) => (
            <span key={i} className="rounded-cos-full bg-cos-warm/10 px-1.5 py-0.5 text-[10px] text-cos-warm">
              {i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonMini({
  person,
}: {
  person: { legacyId: string; displayName: string; title: string | null };
}) {
  return (
    <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-full bg-cos-warm/10">
        <User className="h-3.5 w-3.5 text-cos-warm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-cos-midnight">
          {person.displayName}
        </p>
        {person.title && (
          <p className="truncate text-[10px] italic text-cos-slate">{person.title}</p>
        )}
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 rounded-cos-xl bg-cos-border/40" />
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-cos-border/40" />
        <div className="h-4 w-full rounded bg-cos-border/30" />
        <div className="h-4 w-4/5 rounded bg-cos-border/30" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-cos-border/40" />
        <div className="flex gap-2">
          <div className="h-6 w-16 rounded-full bg-cos-border/30" />
          <div className="h-6 w-20 rounded-full bg-cos-border/30" />
          <div className="h-6 w-14 rounded-full bg-cos-border/30" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-cos-border/40" />
        <div className="h-20 rounded-cos-xl bg-cos-border/30" />
        <div className="h-20 rounded-cos-xl bg-cos-border/30" />
      </div>
    </div>
  );
}
