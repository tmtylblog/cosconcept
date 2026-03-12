"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Building2,
  Globe,
  Users,
  Briefcase,
  MapPin,
  ArrowLeft,
  ExternalLink,
  Calendar,
  Star,
  Sparkles,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────

interface PartnershipReadiness {
  openToPartnerships: boolean;
  preferredPartnerTypes: string[];
  partnershipGoals: string[];
}

interface Service {
  id: string;
  name: string;
  description?: string;
  subServices?: string[];
}

interface CaseStudy {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  skills: string[];
  industries: string[];
  clientName?: string;
}

interface Expert {
  id: string;
  fullName: string;
  title?: string;
  headline?: string;
  photoUrl?: string;
  location?: string;
  topSkills?: string[];
}

interface FirmProfile {
  id: string;
  name: string;
  website?: string;
  description?: string;
  location?: string;
  foundedYear?: number;
  sizeBand?: string;
  firmType?: string;
  employeeCount?: number;
  logoUrl?: string;
  isCosCustomer?: boolean;
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  languages: string[];
  clients: string[];
  services: Service[];
  caseStudies: CaseStudy[];
  experts: Expert[];
  narrative?: string;
  typicalClientProfile?: string;
  partnershipReadiness?: PartnershipReadiness;
}

// ─── Mappings ──────────────────────────────────────────────

const SIZE_BAND_LABELS: Record<string, string> = {
  individual: "1 person",
  micro_1_10: "2-10 people",
  small_11_50: "11-50 people",
  emerging_51_200: "51-200 people",
  mid_201_500: "201-500 people",
  upper_mid_501_1000: "501-1000 people",
  large_1001_5000: "1001-5000 people",
};

const FIRM_TYPE_LABELS: Record<string, string> = {
  fractional_interim: "Fractional & Interim",
  staff_augmentation: "Staff Augmentation",
  boutique_agency: "Boutique Agency",
  project_consulting: "Project Consulting",
  advisory: "Advisory",
  global_consulting: "Global Consulting",
};

type TabKey = "what" | "work" | "team" | "fit";

// ─── Helpers ───────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ─── Logo component ────────────────────────────────────────

function FirmLogo({
  logoUrl,
  website,
  name,
  size = 48,
}: {
  logoUrl?: string;
  website?: string;
  name: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (logoUrl) {
      setSrc(logoUrl);
    } else if (website) {
      const domain = extractDomain(website);
      if (domain) {
        setSrc(`https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`);
      }
    }
  }, [logoUrl, website]);

  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10"
        style={{ width: size, height: size }}
      >
        <Building2 className="text-cos-electric" style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name} logo`}
      width={size}
      height={size}
      className="rounded-cos-lg object-contain bg-white border border-cos-border"
      style={{ width: size, height: size }}
      onError={() => setSrc(null)}
    />
  );
}

// ─── Expert Avatar ─────────────────────────────────────────

function ExpertAvatar({ expert }: { expert: Expert }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (expert.photoUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={expert.photoUrl}
        alt={expert.fullName}
        className="h-12 w-12 rounded-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cos-electric/10 text-sm font-semibold text-cos-electric">
      {getInitials(expert.fullName || "?")}
    </div>
  );
}

// ─── Pill ──────────────────────────────────────────────────

function Pill({ label, variant = "default" }: { label: string; variant?: "default" | "warm" | "electric" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-cos-full px-2.5 py-0.5 text-xs font-medium",
        variant === "electric" && "bg-cos-electric/10 text-cos-electric",
        variant === "warm" && "bg-cos-warm/10 text-cos-warm",
        variant === "default" && "bg-cos-cloud text-cos-slate"
      )}
    >
      {label}
    </span>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-cos-cloud mb-6" />
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-cos-lg bg-cos-cloud shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 rounded bg-cos-cloud" />
            <div className="h-4 w-32 rounded bg-cos-cloud" />
            <div className="h-4 w-64 rounded bg-cos-cloud" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-20 rounded-full bg-cos-cloud" />
          <div className="h-6 w-24 rounded-full bg-cos-cloud" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-cos-border mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded bg-cos-cloud" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
            <div className="h-4 w-36 rounded bg-cos-cloud mb-2" />
            <div className="h-3 w-full rounded bg-cos-cloud" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function DiscoverFirmPage() {
  const router = useRouter();
  const params = useParams();
  const firmId = params.firmId as string;
  const { data: activeOrg } = useActiveOrganization();

  const [profile, setProfile] = useState<FirmProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("what");
  const [requestingPartnership, setRequestingPartnership] = useState(false);
  const [partnershipRequested, setPartnershipRequested] = useState(false);

  // Fetch profile
  useEffect(() => {
    if (!firmId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/discover/${firmId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<FirmProfile>;
      })
      .then((data) => {
        setProfile(data);
        // Show Partnership Fit tab only if narrative exists
        if (data.narrative || data.partnershipReadiness) {
          // tab stays at "what"
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [firmId]);

  const handleRequestPartnership = async () => {
    if (!activeOrg?.id || !profile) return;
    const myFirmId = `firm_${activeOrg.id}`;
    setRequestingPartnership(true);
    try {
      const res = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId: myFirmId, targetFirmId: profile.id }),
      });
      if (res.ok || res.status === 409) {
        setPartnershipRequested(true);
      }
    } catch {
      /* ignore */
    } finally {
      setRequestingPartnership(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-6">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-midnight transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </button>
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-8 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-cos-slate/40" />
          <p className="text-cos-slate">{error ?? "Profile not found"}</p>
        </div>
      </div>
    );
  }

  const hasFitSection = !!(profile.narrative || profile.partnershipReadiness || profile.typicalClientProfile);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "what", label: "What They Do" },
    { key: "work", label: "Their Work" },
    { key: "team", label: "The Team" },
    ...(hasFitSection ? [{ key: "fit" as TabKey, label: "Partnership Fit" }] : []),
  ];

  const websiteUrl = profile.website
    ? profile.website.startsWith("http")
      ? profile.website
      : `https://${profile.website}`
    : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mb-5 flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-midnight transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </button>

      {/* ── Hero card ─────────────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <FirmLogo
              logoUrl={profile.logoUrl}
              website={profile.website}
              name={profile.name}
              size={56}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-xl font-bold text-cos-midnight">
                  {profile.name}
                </h1>
                {profile.isCosCustomer && (
                  <span className="inline-flex items-center gap-1 rounded-cos-full bg-cos-signal/10 px-2 py-0.5 text-xs font-medium text-cos-signal">
                    <CheckCircle2 className="h-3 w-3" />
                    COS Member
                  </span>
                )}
              </div>

              {/* Meta row */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cos-slate">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {profile.location}
                  </span>
                )}
                {profile.sizeBand && SIZE_BAND_LABELS[profile.sizeBand] && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {SIZE_BAND_LABELS[profile.sizeBand]}
                  </span>
                )}
                {profile.foundedYear && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Est. {profile.foundedYear}
                  </span>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-cos-electric transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Firm type */}
        {profile.firmType && FIRM_TYPE_LABELS[profile.firmType] && (
          <div className="mt-3">
            <Pill label={FIRM_TYPE_LABELS[profile.firmType]} variant="electric" />
          </div>
        )}

        {/* Category pills */}
        {profile.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.categories.slice(0, 3).map((cat) => (
              <Pill key={cat} label={cat} />
            ))}
          </div>
        )}

        {/* Description / narrative */}
        {(profile.description || profile.narrative) && (
          <p className="mt-3 text-sm text-cos-midnight/80 leading-relaxed">
            {profile.narrative ?? profile.description}
          </p>
        )}

        {/* Action */}
        <div className="mt-4">
          <Button
            onClick={handleRequestPartnership}
            disabled={requestingPartnership || partnershipRequested}
            className={cn(
              partnershipRequested
                ? "bg-cos-signal/10 text-cos-signal border border-cos-signal/20 hover:bg-cos-signal/10"
                : ""
            )}
          >
            {partnershipRequested ? (
              <>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Partnership Requested
              </>
            ) : requestingPartnership ? (
              "Requesting..."
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Request Partnership
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Tab navigation ────────────────────────────────── */}
      <div className="flex gap-1 border-b border-cos-border mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-cos-electric text-cos-electric"
                : "border-transparent text-cos-slate hover:text-cos-midnight"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────── */}

      {/* WHAT THEY DO */}
      {activeTab === "what" && (
        <div className="space-y-6">
          {/* Services */}
          {profile.services.length > 0 ? (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Services
              </h2>
              <div className="space-y-3">
                {profile.services.map((svc) => (
                  <div
                    key={svc.id}
                    className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4"
                  >
                    <div className="flex items-start gap-2">
                      <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-cos-electric" />
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-semibold text-cos-midnight">{svc.name}</p>
                        {svc.description && (
                          <p className="mt-1 text-sm text-cos-slate leading-relaxed">{svc.description}</p>
                        )}
                        {svc.subServices && svc.subServices.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {svc.subServices.map((sub) => (
                              <Pill key={sub} label={sub} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : profile.skills.length > 0 ? (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Capabilities
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill) => (
                  <Pill key={skill} label={skill} variant="electric" />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/40 p-8 text-center">
              <Briefcase className="mx-auto mb-2 h-8 w-8 text-cos-slate/40" />
              <p className="text-sm text-cos-slate">No service information available yet</p>
            </div>
          )}

          {/* Industries */}
          {profile.industries.length > 0 && (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Industries Served
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.industries.map((ind) => (
                  <Pill key={ind} label={ind} variant="warm" />
                ))}
              </div>
            </section>
          )}

          {/* Markets */}
          {profile.markets.length > 0 && (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Markets
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.markets.map((mkt) => (
                  <Pill key={mkt} label={mkt} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* THEIR WORK */}
      {activeTab === "work" && (
        <div className="space-y-6">
          {profile.caseStudies.length > 0 ? (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Case Studies
              </h2>
              <div className="space-y-3">
                {profile.caseStudies.map((cs) => (
                  <a
                    key={cs.id}
                    href={cs.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 hover:border-cos-electric/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {cs.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cs.thumbnailUrl}
                          alt={cs.title}
                          className="h-14 w-20 shrink-0 rounded-cos-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-heading text-sm font-semibold text-cos-midnight group-hover:text-cos-electric transition-colors line-clamp-2">
                            {cs.title}
                          </p>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-cos-slate opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {cs.clientName && (
                          <p className="mt-0.5 text-xs text-cos-slate">{cs.clientName}</p>
                        )}
                        {(cs.skills.length > 0 || cs.industries.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {cs.skills.slice(0, 3).map((s) => (
                              <Pill key={s} label={s} variant="electric" />
                            ))}
                            {cs.industries.slice(0, 2).map((ind) => (
                              <Pill key={ind} label={ind} variant="warm" />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/40 p-8 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-cos-slate/40" />
              <p className="text-sm text-cos-slate">No case studies available yet</p>
            </div>
          )}

          {/* Clients */}
          {profile.clients.length > 0 && (
            <section>
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-cos-slate mb-3">
                Notable Clients
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.clients.map((client) => (
                  <Pill key={client} label={client} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* THE TEAM */}
      {activeTab === "team" && (
        <div>
          {profile.experts.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {profile.experts.map((expert) => (
                <div
                  key={expert.id}
                  className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 flex items-start gap-3"
                >
                  <ExpertAvatar expert={expert} />
                  <div className="min-w-0">
                    <p className="font-heading text-sm font-semibold text-cos-midnight truncate">
                      {expert.fullName}
                    </p>
                    {(expert.title || expert.headline) && (
                      <p className="mt-0.5 text-xs text-cos-slate line-clamp-2">
                        {expert.title ?? expert.headline}
                      </p>
                    )}
                    {expert.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-cos-slate/70">
                        <MapPin className="h-3 w-3" />
                        {expert.location}
                      </p>
                    )}
                    {expert.topSkills && expert.topSkills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {expert.topSkills.slice(0, 3).map((skill) => (
                          <Pill key={skill} label={skill} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/40 p-8 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-cos-slate/40" />
              <p className="text-sm text-cos-slate">Team data not available</p>
            </div>
          )}
        </div>
      )}

      {/* PARTNERSHIP FIT */}
      {activeTab === "fit" && hasFitSection && (
        <div className="space-y-5">
          {profile.typicalClientProfile && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
              <h3 className="font-heading text-sm font-semibold text-cos-midnight mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-cos-electric" />
                Typical Client Profile
              </h3>
              <p className="text-sm text-cos-slate leading-relaxed">{profile.typicalClientProfile}</p>
            </div>
          )}

          {profile.partnershipReadiness && (
            <>
              {profile.partnershipReadiness.partnershipGoals.length > 0 && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
                  <h3 className="font-heading text-sm font-semibold text-cos-midnight mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cos-electric" />
                    Partnership Goals
                  </h3>
                  <ul className="space-y-2">
                    {profile.partnershipReadiness.partnershipGoals.map((goal) => (
                      <li key={goal} className="flex items-start gap-2 text-sm text-cos-slate">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-electric" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {profile.partnershipReadiness.preferredPartnerTypes.length > 0 && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
                  <h3 className="font-heading text-sm font-semibold text-cos-midnight mb-3 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-cos-electric" />
                    Looking to Partner With
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.partnershipReadiness.preferredPartnerTypes.map((type) => (
                      <Pill key={type} label={type} variant="electric" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────── */}
      <div className="mt-8 border-t border-cos-border pt-4 text-center">
        <p className="text-xs text-cos-slate/60">Profile data from COS Knowledge Graph</p>
      </div>
    </div>
  );
}
