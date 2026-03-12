"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  Building2,
  Globe,
  Users,
  Briefcase,
  MapPin,
  ArrowLeft,
  ExternalLink,
  Calendar,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

// ─── Contextual section ordering ──────────────────────────

type SectionId =
  | "case_studies"
  | "experts"
  | "clients"
  | "services"
  | "skills"
  | "industries"
  | "markets"
  | "partnership";

function computeSectionOrder(context: string, profile: FirmProfile): SectionId[] {
  const ctx = context.toLowerCase();

  const scores: Record<SectionId, number> = {
    case_studies: profile.caseStudies.length > 0 ? 60 : -1,
    experts: profile.experts.length > 0 ? 50 : -1,
    clients: profile.clients.length > 0 ? 40 : -1,
    services: profile.services.length > 0 ? 30 : -1,
    skills: profile.skills.length > 0 ? 20 : -1,
    industries: profile.industries.length > 0 ? 15 : -1,
    markets: profile.markets.length > 0 ? 10 : -1,
    partnership:
      profile.typicalClientProfile || profile.partnershipReadiness ? 5 : -1,
  };

  // Boost sections based on what the user was searching for
  if (/case stud|work|portfolio|project|result/i.test(ctx))
    scores.case_studies += 50;
  if (/expert|team|people|who|specialist|staff/i.test(ctx))
    scores.experts += 50;
  if (/client|customer/i.test(ctx)) scores.clients += 40;
  if (/service|offer|capabilit/i.test(ctx)) {
    scores.services += 40;
    scores.skills += 20;
  }
  if (/skill|expertise|speciali/i.test(ctx)) scores.skills += 30;
  if (/industry|vertical|sector|healthcare|fintech|saas|ecomm/i.test(ctx))
    scores.industries += 30;
  if (/market|region|country|geo|apac|emea|latam|europe|asia/i.test(ctx))
    scores.markets += 30;
  if (/partner|referral|collaborate/i.test(ctx)) scores.partnership += 30;

  return (Object.entries(scores) as [SectionId, number][])
    .filter(([, score]) => score >= 0)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
}

// ─── Mappings ──────────────────────────────────────────────

const SIZE_BAND_LABELS: Record<string, string> = {
  individual: "Solo",
  micro_1_10: "2–10 people",
  small_11_50: "11–50 people",
  emerging_51_200: "51–200 people",
  mid_201_500: "201–500 people",
  upper_mid_501_1000: "501–1,000 people",
  large_1001_5000: "1,001–5,000 people",
};

const FIRM_TYPE_LABELS: Record<string, string> = {
  fractional_interim: "Fractional & Interim",
  staff_augmentation: "Staff Augmentation",
  boutique_agency: "Boutique Agency",
  project_consulting: "Project Consulting",
  advisory: "Advisory",
  global_consulting: "Global Consulting",
};

// ─── Sub-components ────────────────────────────────────────

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

function FirmLogo({
  logoUrl,
  website,
  name,
  size = 56,
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
        setSrc(
          `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`
        );
      }
    }
  }, [logoUrl, website]);

  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-cos-xl bg-cos-electric/10"
        style={{ width: size, height: size }}
      >
        <Building2
          className="text-cos-electric"
          style={{ width: size * 0.45, height: size * 0.45 }}
        />
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
      className="rounded-cos-xl border border-cos-border bg-white object-contain"
      style={{ width: size, height: size }}
      onError={() => setSrc(null)}
    />
  );
}

function ExpertAvatar({ expert }: { expert: Expert }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (expert.photoUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={expert.photoUrl}
        alt={expert.fullName}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
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

function Pill({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "warm" | "electric" | "signal";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-cos-full px-2.5 py-0.5 text-xs font-medium",
        variant === "electric" && "bg-cos-electric/10 text-cos-electric",
        variant === "warm" && "bg-cos-warm/10 text-cos-warm",
        variant === "signal" && "bg-cos-signal/10 text-cos-signal",
        variant === "default" && "bg-cos-cloud text-cos-slate"
      )}
    >
      {label}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-widest text-cos-slate">
      {children}
    </h2>
  );
}

function EmptySection({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-cloud/40 p-8 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-cos-slate/40" />
      <p className="text-sm text-cos-slate">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-cos-cloud mb-6" />
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-cos-xl bg-cos-cloud shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 rounded bg-cos-cloud" />
            <div className="h-4 w-64 rounded bg-cos-cloud" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded bg-cos-cloud" />
          <div className="h-3 w-4/5 rounded bg-cos-cloud" />
        </div>
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
            <div className="h-4 w-32 rounded bg-cos-cloud mb-2" />
            <div className="h-3 w-full rounded bg-cos-cloud" />
            <div className="h-3 w-3/4 rounded bg-cos-cloud mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section renderers ─────────────────────────────────────

function CaseStudiesSection({ caseStudies }: { caseStudies: CaseStudy[] }) {
  return (
    <section>
      <SectionHeading>Case Studies</SectionHeading>
      <div className="space-y-3">
        {caseStudies.map((cs) => (
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
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-sm font-semibold text-cos-midnight group-hover:text-cos-electric transition-colors line-clamp-2">
                    {cs.title}
                  </p>
                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cos-slate opacity-0 group-hover:opacity-100 transition-opacity" />
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
  );
}

function ExpertsSection({ experts }: { experts: Expert[] }) {
  return (
    <section>
      <SectionHeading>The Team</SectionHeading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {experts.map((expert) => (
          <div
            key={expert.id}
            className="flex items-start gap-3 rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4"
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
    </section>
  );
}

function ServicesSection({ services, skills }: { services: Service[]; skills: string[] }) {
  return (
    <section>
      <SectionHeading>What They Do</SectionHeading>
      {services.length > 0 ? (
        <div className="space-y-3">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4"
            >
              <div className="flex items-start gap-2">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-cos-electric" />
                <div className="min-w-0">
                  <p className="font-heading text-sm font-semibold text-cos-midnight">
                    {svc.name}
                  </p>
                  {svc.description && (
                    <p className="mt-1 text-sm text-cos-slate leading-relaxed">
                      {svc.description}
                    </p>
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
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <Pill key={skill} label={skill} variant="electric" />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function DiscoverFirmPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const firmId = params.firmId as string;
  const searchContext = searchParams.get("context") ?? "";

  const [profile, setProfile] = useState<FirmProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      .then(setProfile)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [firmId]);

  function askOssy() {
    const msg = profile
      ? `Tell me more about ${profile.name} and why they might be a good fit for what I'm looking for`
      : "Tell me more about this firm";
    window.dispatchEvent(
      new CustomEvent("cos:inject-chat", { detail: { text: msg } })
    );
  }

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
        <EmptySection icon={Building2} message={error ?? "Profile not found"} />
      </div>
    );
  }

  const websiteUrl = profile.website
    ? profile.website.startsWith("http")
      ? profile.website
      : `https://${profile.website}`
    : null;

  // Contextual section ordering
  const sectionOrder = computeSectionOrder(searchContext, profile);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-5 flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-midnight transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </button>

      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="mb-8 rounded-cos-xl border border-cos-border bg-cos-surface-raised p-6">
        <div className="flex items-start gap-4">
          <FirmLogo logoUrl={profile.logoUrl} website={profile.website} name={profile.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
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
                  {extractDomain(websiteUrl) ?? "Website"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Category + type pills */}
            {(profile.firmType || profile.categories.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.firmType && FIRM_TYPE_LABELS[profile.firmType] && (
                  <Pill label={FIRM_TYPE_LABELS[profile.firmType]} variant="electric" />
                )}
                {profile.categories.slice(0, 3).map((cat) => (
                  <Pill key={cat} label={cat} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Description / narrative */}
        {(profile.narrative || profile.description) && (
          <p className="mt-4 text-sm text-cos-midnight/80 leading-relaxed">
            {profile.narrative ?? profile.description}
          </p>
        )}

        {/* CTAs */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button onClick={askOssy} variant="outline">
            <Sparkles className="mr-1.5 h-4 w-4 text-cos-electric" />
            Ask Ossy about this firm
          </Button>
        </div>
      </div>

      {/* ── Search context reminder ─────────────────────────── */}
      {searchContext && (
        <div className="mb-6 flex items-start gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cos-electric" />
          <p className="text-xs text-cos-electric leading-relaxed">
            Showing results relevant to: <span className="font-medium">&ldquo;{searchContext}&rdquo;</span>
          </p>
        </div>
      )}

      {/* ── Dynamic sections ────────────────────────────────── */}
      <div className="space-y-8">
        {sectionOrder.map((sectionId) => {
          switch (sectionId) {
            case "case_studies":
              return profile.caseStudies.length > 0 ? (
                <CaseStudiesSection key="case_studies" caseStudies={profile.caseStudies} />
              ) : null;

            case "experts":
              return profile.experts.length > 0 ? (
                <ExpertsSection key="experts" experts={profile.experts} />
              ) : null;

            case "clients":
              return profile.clients.length > 0 ? (
                <section key="clients">
                  <SectionHeading>Notable Clients</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.clients.map((client) => (
                      <Pill key={client} label={client} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "services":
              return profile.services.length > 0 || profile.skills.length > 0 ? (
                <ServicesSection key="services" services={profile.services} skills={profile.skills} />
              ) : null;

            case "skills":
              // Only show standalone skills section if services section didn't already show skills
              return profile.skills.length > 0 && !sectionOrder.includes("services") ? (
                <section key="skills">
                  <SectionHeading>Capabilities</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((skill) => (
                      <Pill key={skill} label={skill} variant="electric" />
                    ))}
                  </div>
                </section>
              ) : null;

            case "industries":
              return profile.industries.length > 0 ? (
                <section key="industries">
                  <SectionHeading>Industries Served</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.industries.map((ind) => (
                      <Pill key={ind} label={ind} variant="warm" />
                    ))}
                  </div>
                </section>
              ) : null;

            case "markets":
              return profile.markets.length > 0 ? (
                <section key="markets">
                  <SectionHeading>Markets</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.markets.map((mkt) => (
                      <Pill key={mkt} label={mkt} />
                    ))}
                  </div>
                </section>
              ) : null;

            case "partnership":
              return profile.typicalClientProfile ||
                profile.partnershipReadiness ? (
                <section key="partnership">
                  <SectionHeading>Partnership Signals</SectionHeading>
                  <div className="space-y-4">
                    {profile.typicalClientProfile && (
                      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
                        <h3 className="mb-2 flex items-center gap-2 font-heading text-sm font-semibold text-cos-midnight">
                          <Users className="h-4 w-4 text-cos-electric" />
                          Typical Client Profile
                        </h3>
                        <p className="text-sm text-cos-slate leading-relaxed">
                          {profile.typicalClientProfile}
                        </p>
                      </div>
                    )}
                    {profile.partnershipReadiness?.partnershipGoals &&
                      profile.partnershipReadiness.partnershipGoals.length > 0 && (
                        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
                          <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold text-cos-midnight">
                            <Sparkles className="h-4 w-4 text-cos-electric" />
                            Partnership Goals
                          </h3>
                          <ul className="space-y-2">
                            {profile.partnershipReadiness.partnershipGoals.map(
                              (goal) => (
                                <li
                                  key={goal}
                                  className="flex items-start gap-2 text-sm text-cos-slate"
                                >
                                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-electric" />
                                  {goal}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                    {profile.partnershipReadiness?.preferredPartnerTypes &&
                      profile.partnershipReadiness.preferredPartnerTypes.length > 0 && (
                        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
                          <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold text-cos-midnight">
                            <Briefcase className="h-4 w-4 text-cos-electric" />
                            Looking to Partner With
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {profile.partnershipReadiness.preferredPartnerTypes.map(
                              (type) => (
                                <Pill key={type} label={type} variant="electric" />
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </section>
              ) : null;

            default:
              return null;
          }
        })}

        {/* Fallback: if somehow no sections rendered */}
        {sectionOrder.length === 0 && (
          <EmptySection icon={BookOpen} message="This firm's profile is still being built." />
        )}
      </div>

      <div className="mt-10 border-t border-cos-border pt-4 text-center">
        <p className="text-xs text-cos-slate/60">Profile data from COS Knowledge Graph</p>
      </div>
    </div>
  );
}
