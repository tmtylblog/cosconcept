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
} from "lucide-react";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useProfile } from "@/hooks/use-profile";
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

export default function DashboardPage() {
  const { status: enrichmentStatus, result } = useEnrichment();
  const { data: profile } = useProfile();

  const isEnriching = enrichmentStatus === "loading";
  const isFailed = enrichmentStatus === "failed";
  const isDone = enrichmentStatus === "done";

  // Extract data sections
  const companyData = result?.companyData;
  const extracted = result?.extracted;
  const classification = result?.classification;

  const firmName = companyData?.name;
  const firmIndustry = companyData?.industry;
  const firmLocation = companyData?.location;
  const firmSize = companyData?.size;
  const firmEmployeeCount = companyData?.employeeCount;
  const firmFounded = companyData?.founded;
  const firmTags = companyData?.tags;

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

  const hasEnrichment = isDone && (companyData || extracted || classification);
  const hasProfile = Object.keys(profile).length > 0;
  const hasAnyData = hasEnrichment || hasProfile;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-10">
      {/* Loading banner */}
      {isEnriching && (
        <div className="mb-6 flex w-full items-center gap-3 rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-3.5">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          <div>
            <p className="text-sm font-semibold text-cos-midnight">
              Researching your firm...
            </p>
            <p className="text-xs text-cos-slate">
              Analyzing your website and building your profile. This usually takes 30-60 seconds.
            </p>
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

      {/* Progressive reveal cards — only appear when data exists */}
      {hasAnyData && (
        <div className={cn("flex w-full flex-col gap-3", isDone && "mt-2")}>
          {/* Firm identity — PDL company data */}
          {firmName && (
            <RevealCard icon={Building2} label="Your Firm" delay={0}>
              <p className="text-base font-semibold">{firmName}</p>
              {firmIndustry && (
                <p className="mt-1 text-xs text-cos-slate">{firmIndustry}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cos-slate">
                {firmSize && (
                  <span>{firmSize}{firmEmployeeCount ? ` (${firmEmployeeCount.toLocaleString()} employees)` : ""}</span>
                )}
                {firmLocation && <span>{firmLocation}</span>}
                {firmFounded && <span>Founded {firmFounded}</span>}
              </div>
              {firmTags && firmTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {firmTags.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate"
                    >
                      {tag}
                    </span>
                  ))}
                  {firmTags.length > 8 && (
                    <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">
                      +{firmTags.length - 8} more
                    </span>
                  )}
                </div>
              )}
            </RevealCard>
          )}

          {/* Firm Category (from chat confirmation) */}
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

          {/* ─── Partner Preferences (from chat confirmations) ── */}
          {desiredServices.length > 0 && (
            <RevealCard icon={Search} label="Services Wanted from Partners" delay={600}>
              <PillList
                items={desiredServices}
                pillClass="bg-cos-electric/8 text-cos-electric"
              />
            </RevealCard>
          )}

          {partnerIndustries.length > 0 && (
            <RevealCard icon={Briefcase} label="Required Partner Industries" delay={620}>
              <PillList
                items={partnerIndustries}
                pillClass="bg-cos-signal/8 text-cos-signal"
              />
            </RevealCard>
          )}

          {clientSize && (
            <RevealCard icon={Users} label="Ideal Partner Client Size" delay={640}>
              <p>{clientSize}</p>
            </RevealCard>
          )}

          {partnerLocations.length > 0 && (
            <RevealCard icon={MapPin} label="Partner Locations" delay={660}>
              <p>{partnerLocations.join(", ")}</p>
            </RevealCard>
          )}

          {partnerTypes.length > 0 && (
            <RevealCard icon={Handshake} label="Preferred Partner Types" delay={680}>
              <PillList
                items={partnerTypes}
                pillClass="bg-cos-signal/10 text-cos-signal"
              />
            </RevealCard>
          )}

          {partnerSize.length > 0 && (
            <RevealCard icon={Building} label="Preferred Partner Size" delay={700}>
              <PillList
                items={partnerSize}
                pillClass="bg-cos-midnight/6 text-cos-midnight"
              />
            </RevealCard>
          )}

          {projectSize && (
            <RevealCard icon={Ruler} label="Ideal Project Size" delay={720}>
              <p>{projectSize}</p>
            </RevealCard>
          )}

          {hourlyRates && (
            <RevealCard icon={DollarSign} label="Typical Hourly Rates" delay={740}>
              <p>{hourlyRates}</p>
            </RevealCard>
          )}

          {partnerModels.length > 0 && (
            <RevealCard icon={Target} label="Partnership Models" delay={760}>
              <PillList
                items={partnerModels}
                pillClass="bg-cos-electric/10 text-cos-electric"
              />
            </RevealCard>
          )}

          {dealBreakers.length > 0 && (
            <RevealCard icon={ShieldAlert} label="Deal Breakers" delay={780}>
              <PillList
                items={dealBreakers}
                pillClass="bg-cos-ember/10 text-cos-ember"
              />
            </RevealCard>
          )}

          {growthGoals && (
            <RevealCard icon={TrendingUp} label="Growth Goals" delay={800}>
              <p>{growthGoals}</p>
            </RevealCard>
          )}
        </div>
      )}
    </div>
  );
}
