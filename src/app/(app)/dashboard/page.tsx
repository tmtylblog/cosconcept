"use client";

import {
  Loader2,
  AlertCircle,
  MessageCircle,
  ArrowRight,
  Building2,
  Briefcase,
  Users,
  Wrench,
  Globe,
  Languages,
  Handshake,
  Target,
  ShieldAlert,
  TrendingUp,
  Search,
  Building,
  DollarSign,
  Ruler,
  MapPin,
  Check,
} from "lucide-react";
import { useEnrichment, type StageStatus } from "@/hooks/use-enrichment";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/lib/auth-client";
import { getEmailDomain } from "@/lib/email-validation";
import { cn } from "@/lib/utils";

/** A single data card that slides in from the bottom when it has content */
function RevealCard({
  icon: Icon,
  label,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="animate-slide-up w-full rounded-cos-xl border border-cos-border/40 bg-white px-5 py-4 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cos-slate">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm leading-relaxed text-cos-midnight">
        {children}
      </div>
    </div>
  );
}

/** Render an array of strings as pills inside a RevealCard */
function PillList({
  items,
  pillClass,
  max,
}: {
  items: string[];
  pillClass: string;
  max?: number;
}) {
  const display = max ? items.slice(0, max) : items;
  const overflow = max && items.length > max ? items.length - max : 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {display.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-cos-pill px-2.5 py-1 text-xs font-medium",
            pillClass
          )}
        >
          {item}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

/** Small status chip for each enrichment stage */
function StageChip({ label, stage }: { label: string; stage: StageStatus }) {
  if (stage === "idle") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
        stage === "loading" && "bg-cos-electric/10 text-cos-electric",
        stage === "done" && "bg-cos-signal/10 text-cos-signal",
        stage === "failed" && "bg-cos-slate/10 text-cos-slate"
      )}
    >
      {stage === "loading" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {stage === "done" && <Check className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

/** Progress indicator for the 8 partner preference questions */
function PreferenceProgress({
  desiredServices,
  partnerIndustries,
  clientSize,
  partnerLocations,
  partnerTypes,
  partnerSize,
  projectSize,
  hourlyRates,
}: {
  desiredServices: string[];
  partnerIndustries: string[];
  clientSize: string | undefined;
  partnerLocations: string[];
  partnerTypes: string[];
  partnerSize: string[];
  projectSize: string | undefined;
  hourlyRates: string | undefined;
}) {
  const fields = [
    { label: "Services wanted", done: desiredServices.length > 0 },
    { label: "Partner industries", done: partnerIndustries.length > 0 },
    { label: "Client size", done: !!clientSize },
    { label: "Locations", done: partnerLocations.length > 0 },
    { label: "Partner types", done: partnerTypes.length > 0 },
    { label: "Partner size", done: partnerSize.length > 0 },
    { label: "Project size", done: !!projectSize },
    { label: "Hourly rates", done: !!hourlyRates },
  ];

  const completedCount = fields.filter((f) => f.done).length;

  // Don't show when nothing or everything is done
  if (completedCount === 0 || completedCount === 8) return null;

  return (
    <div className="w-full rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-cos-slate">
          Partner Preferences
        </span>
        <span className="text-xs font-bold text-cos-electric">
          {completedCount}/8
        </span>
      </div>
      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cos-electric to-cos-signal transition-all duration-500"
          style={{ width: `${(completedCount / 8) * 100}%` }}
        />
      </div>
      {/* Individual field status */}
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span
            key={f.label}
            className={cn(
              "flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
              f.done
                ? "bg-cos-signal/10 text-cos-signal"
                : "bg-cos-cloud text-cos-slate-dim"
            )}
          >
            {f.done && <Check className="h-2.5 w-2.5" />}
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { status: enrichmentStatus, stages, result } = useEnrichment();
  const { data: profile } = useProfile();
  const { data: session } = useSession();

  const isEnriching = stages.overall === "enriching";
  const isFailed = enrichmentStatus === "failed";

  // Extract data sections
  const companyData = result?.companyData;
  const extracted = result?.extracted;
  const classification = result?.classification;

  // Email domain for logo fallback (e.g. chameleon.co from freddie@chameleon.co)
  const emailDomain = session?.user?.email ? getEmailDomain(session.user.email) : null;

  // Firm identity — PDL data with fallbacks from enrichment result
  const firmDomain = result?.domain;
  const firmName =
    companyData?.name ||
    (firmDomain
      ? firmDomain.split(".")[0].charAt(0).toUpperCase() +
        firmDomain.split(".")[0].slice(1)
      : null);
  const firmLocation = companyData?.location;
  const firmSize = companyData?.size;
  const firmEmployeeCount = companyData?.employeeCount;
  const firmFounded = companyData?.founded;
  const firmRevenue = companyData?.inferredRevenue;

  // Merge: confirmed profile data takes precedence over enrichment
  const services = profile.services?.length
    ? profile.services
    : extracted?.services?.length
      ? extracted.services
      : null;
  const clients = profile.clients?.length
    ? profile.clients
    : extracted?.clients?.length
      ? extracted.clients
      : null;
  const skills = profile.skills?.length
    ? profile.skills
    : classification?.skills?.length
      ? classification.skills
      : null;
  const markets = profile.markets?.length
    ? profile.markets
    : classification?.markets?.length
      ? classification.markets
      : null;
  const languages = profile.languages?.length
    ? profile.languages
    : classification?.languages?.length
      ? classification.languages
      : null;
  const industries = profile.industries?.length
    ? profile.industries
    : classification?.industries?.length
      ? classification.industries
      : null;
  const categories = profile.firmCategory
    ? [profile.firmCategory]
    : classification?.categories?.length
      ? classification.categories
      : null;

  // Partner preference data (only from profile/chat confirmations)
  const partnerTypes = profile.preferredPartnerTypes ?? [];
  const partnerSize = profile.preferredPartnerSize ?? [];
  const partnerIndustries = profile.requiredPartnerIndustries ?? [];
  const partnerLocations = profile.preferredPartnerLocations ?? [];
  const partnerModels = profile.partnershipModels ?? [];
  const dealBreakers = profile.dealBreakers ?? [];
  const growthGoals = profile.growthGoals;
  const desiredServices = profile.desiredPartnerServices ?? [];
  const clientSize = profile.idealPartnerClientSize;
  const projectSize = profile.idealProjectSize;
  const hourlyRates = profile.typicalHourlyRates;

  // Progressive data check — show cards section as soon as ANY data arrives
  const hasEnrichment = !!(companyData || extracted || classification);
  const hasProfile = Object.keys(profile).length > 0;
  const hasAnyData = hasEnrichment || hasProfile || !!result || isEnriching;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-10">
      {/* Stage-aware progress banner */}
      {isEnriching && (
        <div className="mb-6 flex w-full items-center gap-3 rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-3.5">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          <div>
            <p className="text-sm font-semibold text-cos-midnight">
              Researching your firm...
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StageChip label="Company data" stage={stages.pdl} />
              <StageChip label="Website scan" stage={stages.scrape} />
              <StageChip label="Classification" stage={stages.classify} />
            </div>
          </div>
        </div>
      )}

      {/* Failure banner */}
      {isFailed && (
        <div className="mb-6 flex w-full items-center gap-3 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-3">
          <AlertCircle className="h-5 w-5 text-cos-ember" />
          <div>
            <p className="text-sm font-medium text-cos-ember">
              We couldn&apos;t reach that website
            </p>
            <p className="text-xs text-cos-slate mt-0.5">
              Share a working URL with Ossy, or continue as an individual expert.
            </p>
          </div>
        </div>
      )}

      {/* Welcome prompt — only when idle (no enrichment or profile yet) */}
      {enrichmentStatus === "idle" && !hasAnyData && (
        <div className="text-center py-6">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-cos-2xl bg-gradient-to-br from-cos-electric/15 to-cos-signal/15">
            <MessageCircle className="h-8 w-8 text-cos-electric" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">
            Welcome to Collective OS
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-cos-slate">
            Drop your firm&apos;s website into the chat and Ossy will research
            your company, build your profile, and start finding the right
            partners for you.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-cos-electric">
            <ArrowRight className="h-4 w-4" />
            <span>Start in the chat panel</span>
          </div>
        </div>
      )}

      {/* Progressive reveal cards — appear as each stage resolves */}
      {hasAnyData && (
        <div className="flex w-full flex-col gap-3 mt-2">
          {/* Firm identity — shows as soon as result shell exists OR enrichment is running */}
          {(result || isEnriching) && (
            <RevealCard icon={Building2} label="Your Firm" delay={0}>
              {result ? (
                <div className="flex items-start gap-3">
                  {/* Company logo via Clearbit — tries enrichment domain first, falls back to email domain */}
                  {(firmDomain || emailDomain) && (
                    <img
                      src={`https://logo.clearbit.com/${firmDomain || emailDomain}`}
                      alt=""
                      className="h-10 w-10 rounded-cos-lg object-contain bg-white border border-cos-border/30"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        // If the enrichment domain logo failed and we have a different email domain, try that
                        if (emailDomain && firmDomain && emailDomain !== firmDomain && img.src.includes(firmDomain)) {
                          img.src = `https://logo.clearbit.com/${emailDomain}`;
                        } else {
                          img.style.display = "none";
                        }
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-cos-midnight">{firmName || firmDomain}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cos-slate">
                      {firmSize && (
                        <span>{firmSize}{firmEmployeeCount ? ` (${firmEmployeeCount.toLocaleString()})` : ""}</span>
                      )}
                      {firmRevenue && <span>{firmRevenue}</span>}
                      {firmLocation && <span>{firmLocation}</span>}
                      {firmFounded && <span>Est. {firmFounded}</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse flex items-start gap-3">
                  <div className="h-10 w-10 rounded-cos-lg bg-cos-cloud" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-cos-cloud" />
                    <div className="h-3 w-48 rounded bg-cos-cloud" />
                  </div>
                </div>
              )}
            </RevealCard>
          )}

          {/* Firm Category */}
          {categories && (
            <RevealCard icon={Building2} label="Firm Category" delay={50}>
              <PillList
                items={categories}
                pillClass="bg-cos-electric/8 px-2.5 py-1 text-xs font-medium text-cos-electric"
              />
            </RevealCard>
          )}

          {/* Services */}
          {services && (
            <RevealCard icon={Briefcase} label="Services" delay={100}>
              <PillList
                items={services}
                pillClass="bg-cos-electric/8 text-cos-electric"
                max={8}
              />
            </RevealCard>
          )}

          {/* Clients */}
          {clients && (
            <RevealCard icon={Users} label="Clients Identified" delay={200}>
              <PillList
                items={clients}
                pillClass="bg-cos-signal/8 text-cos-signal"
                max={10}
              />
            </RevealCard>
          )}

          {/* Skills */}
          {skills && (
            <RevealCard icon={Wrench} label="Skills" delay={300}>
              <PillList
                items={skills}
                pillClass="bg-cos-midnight/6 text-cos-midnight"
                max={10}
              />
            </RevealCard>
          )}

          {/* Industries */}
          {industries && (
            <RevealCard icon={Globe} label="Industries" delay={350}>
              <PillList
                items={industries}
                pillClass="bg-cos-signal/8 text-cos-signal"
              />
            </RevealCard>
          )}

          {/* Markets */}
          {markets && (
            <RevealCard icon={Globe} label="Markets" delay={400}>
              <p>{markets.join(", ")}</p>
            </RevealCard>
          )}

          {/* Languages */}
          {languages && (
            <RevealCard icon={Languages} label="Languages" delay={500}>
              <p>{languages.join(", ")}</p>
            </RevealCard>
          )}

          {/* ─── Partner Preferences Progress Indicator ── */}
          {hasAnyData && (
            <PreferenceProgress
              desiredServices={desiredServices}
              partnerIndustries={partnerIndustries}
              clientSize={clientSize}
              partnerLocations={partnerLocations}
              partnerTypes={partnerTypes}
              partnerSize={partnerSize}
              projectSize={projectSize}
              hourlyRates={hourlyRates}
            />
          )}

          {/* ─── Partner Preferences (from chat confirmations) ── */}
          {desiredServices.length > 0 && (
            <RevealCard icon={Search} label="Services Wanted from Partners" delay={0}>
              <PillList
                items={desiredServices}
                pillClass="bg-cos-electric/8 text-cos-electric"
              />
            </RevealCard>
          )}

          {partnerIndustries.length > 0 && (
            <RevealCard icon={Briefcase} label="Required Partner Industries" delay={0}>
              <PillList
                items={partnerIndustries}
                pillClass="bg-cos-signal/8 text-cos-signal"
              />
            </RevealCard>
          )}

          {clientSize && (
            <RevealCard icon={Users} label="Ideal Partner Client Size" delay={0}>
              <p>{clientSize}</p>
            </RevealCard>
          )}

          {partnerLocations.length > 0 && (
            <RevealCard icon={MapPin} label="Partner Locations" delay={0}>
              <p>{partnerLocations.join(", ")}</p>
            </RevealCard>
          )}

          {partnerTypes.length > 0 && (
            <RevealCard icon={Handshake} label="Preferred Partner Types" delay={0}>
              <PillList
                items={partnerTypes}
                pillClass="bg-cos-signal/10 text-cos-signal"
              />
            </RevealCard>
          )}

          {partnerSize.length > 0 && (
            <RevealCard icon={Building} label="Preferred Partner Size" delay={0}>
              <PillList
                items={partnerSize}
                pillClass="bg-cos-midnight/6 text-cos-midnight"
              />
            </RevealCard>
          )}

          {projectSize && (
            <RevealCard icon={Ruler} label="Ideal Project Size" delay={0}>
              <p>{projectSize}</p>
            </RevealCard>
          )}

          {hourlyRates && (
            <RevealCard icon={DollarSign} label="Typical Hourly Rates" delay={0}>
              <p>{hourlyRates}</p>
            </RevealCard>
          )}

          {partnerModels.length > 0 && (
            <RevealCard icon={Target} label="Partnership Models" delay={0}>
              <PillList
                items={partnerModels}
                pillClass="bg-cos-electric/10 text-cos-electric"
              />
            </RevealCard>
          )}

          {dealBreakers.length > 0 && (
            <RevealCard icon={ShieldAlert} label="Deal Breakers" delay={0}>
              <PillList
                items={dealBreakers}
                pillClass="bg-cos-ember/10 text-cos-ember"
              />
            </RevealCard>
          )}

          {growthGoals && (
            <RevealCard icon={TrendingUp} label="Growth Goals" delay={0}>
              <p>{growthGoals}</p>
            </RevealCard>
          )}
        </div>
      )}
    </div>
  );
}
