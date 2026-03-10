"use client";

import { useEffect, useRef } from "react";
import {
  Loader2,
  AlertCircle,
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
import Image from "next/image";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useGuestData } from "@/hooks/use-guest-data";
import { RevealCard, PillList, StageChip, PreferenceProgress } from "@/components/enrichment/reveal-cards";

/**
 * Full enrichment data display for the center content area during guest onboarding.
 * Shows company data, classification, services, clients, skills, etc. as cards
 * that appear progressively as enrichment stages complete.
 *
 * Also shows partner preference cards populated from guest sessionStorage cache.
 */
export function GuestEnrichmentPanel() {
  const { status: enrichmentStatus, stages, result } = useEnrichment();
  const { guestPreferences } = useGuestData();

  const isEnriching = stages.overall === "enriching";
  const isFailed = enrichmentStatus === "failed";

  // Extract enrichment data sections
  const companyData = result?.companyData;
  const extracted = result?.extracted;
  const classification = result?.classification;
  const firmDomain = result?.domain;
  const logoUrl = result?.logoUrl;

  // Firm identity
  const firmName =
    companyData?.name ||
    (firmDomain
      ? firmDomain.split(".")[0].charAt(0).toUpperCase() +
        firmDomain.split(".")[0].slice(1)
      : null);

  // Enrichment data (no profile to merge with in guest mode)
  const services = extracted?.services?.length ? extracted.services : null;
  const clients = extracted?.clients?.length ? extracted.clients : null;
  const skills = classification?.skills?.length ? classification.skills : null;
  const markets = classification?.markets?.length ? classification.markets : null;
  const languages = classification?.languages?.length ? classification.languages : null;
  const industries = classification?.industries?.length ? classification.industries : null;
  const categories = classification?.categories?.length ? classification.categories : null;

  // Partner preferences from guest cache
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;

  const desiredServices = asArray(guestPreferences.desiredPartnerServices);
  const partnerIndustries = asArray(guestPreferences.requiredPartnerIndustries);
  const clientSize = asArray(guestPreferences.idealPartnerClientSize);
  const partnerLocations = asArray(guestPreferences.preferredPartnerLocations);
  const partnerTypes = asArray(guestPreferences.preferredPartnerTypes);
  const partnerSize = asArray(guestPreferences.preferredPartnerSize);
  const projectSize = asArray(guestPreferences.idealProjectSize);
  const hourlyRates = asString(guestPreferences.typicalHourlyRates);
  const partnershipRole = asString(guestPreferences.partnershipRole);
  const partnerModels = asArray(guestPreferences.partnershipModels);
  const dealBreakers = asArray(guestPreferences.dealBreakers);
  const growthGoals = asString(guestPreferences.growthGoals);

  const hasEnrichment = !!(companyData || extracted || classification);
  const hasAnyData = hasEnrichment || !!result || isEnriching;

  // ─── Auto-scroll to bottom when new cards appear ──────────
  const bottomRef = useRef<HTMLDivElement>(null);
  const cardCount =
    (result ? 1 : 0) +
    (categories ? 1 : 0) +
    (skills ? 1 : 0) +
    (industries ? 1 : 0) +
    (markets ? 1 : 0) +
    (languages ? 1 : 0) +
    (desiredServices.length > 0 ? 1 : 0) +
    (partnerIndustries.length > 0 ? 1 : 0) +
    (clientSize.length > 0 ? 1 : 0) +
    (partnerLocations.length > 0 ? 1 : 0) +
    (partnerTypes.length > 0 ? 1 : 0) +
    (partnerSize.length > 0 ? 1 : 0) +
    (projectSize.length > 0 ? 1 : 0) +
    (hourlyRates ? 1 : 0) +
    (partnershipRole ? 1 : 0) +
    (partnerModels.length > 0 ? 1 : 0) +
    (dealBreakers.length > 0 ? 1 : 0) +
    (growthGoals ? 1 : 0);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [cardCount]);

  return (
    <div className="mx-auto mt-auto flex w-full max-w-xl flex-col items-stretch px-6 py-8">
      {/* Branding */}
      <div className="mb-6 flex flex-col items-center gap-1 self-center">
        <Image
          src="/logo.png"
          alt="Collective OS"
          width={40}
          height={40}
          className="h-10 w-10 rounded-cos-xl"
        />
        <h1 className="font-heading text-base font-bold text-cos-midnight">
          Collective OS
        </h1>
        <p className="text-[11px] text-cos-slate-dim">Grow Faster Together</p>
      </div>

      {/* Stage-aware progress banner */}
      {isEnriching && (
        <div className="mb-4 flex w-full items-center gap-3 rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-3.5">
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
        <div className="mb-4 flex w-full items-center gap-3 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-3">
          <AlertCircle className="h-5 w-5 text-cos-ember" />
          <div>
            <p className="text-sm font-medium text-cos-ember">
              We couldn&apos;t reach that website
            </p>
            <p className="mt-0.5 text-xs text-cos-slate">
              Share a working URL with Ossy in the chat, or try a different domain.
            </p>
          </div>
        </div>
      )}

      {/* Progressive reveal cards */}
      {hasAnyData && (
        <div className="flex w-full flex-col gap-3">
          {/* Firm identity */}
          {(result || isEnriching) && (
            <RevealCard icon={Building2} label="Your Firm" delay={0}>
              {result ? (
                <div className="flex items-start gap-3">
                  {(logoUrl || firmDomain) && (
                    <img
                      src={logoUrl || `https://img.logo.dev/${firmDomain}?token=pk_anonymous&size=128&format=png`}
                      alt=""
                      className="h-10 w-10 rounded-cos-lg border border-cos-border/30 bg-white object-contain"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        // Fallback to Google favicon if logo.dev fails
                        if (!img.src.includes("google.com/s2/favicons")) {
                          img.src = `https://www.google.com/s2/favicons?domain=${firmDomain}&sz=128`;
                        } else {
                          img.style.display = "none";
                        }
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-cos-midnight">
                      {firmName || firmDomain}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cos-slate">
                      {companyData?.size && (
                        <span>
                          {companyData.size}
                          {companyData.employeeCount
                            ? ` (${companyData.employeeCount.toLocaleString()})`
                            : ""}
                        </span>
                      )}
                      {companyData?.inferredRevenue && (
                        <span>{companyData.inferredRevenue}</span>
                      )}
                      {companyData?.location && (
                        <span>{companyData.location}</span>
                      )}
                      {companyData?.founded && (
                        <span>Est. {companyData.founded}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex animate-pulse items-start gap-3">
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

          {/* Services and Clients are hidden during guest onboarding —
              they appear after the user creates an account and reaches the dashboard */}

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

          {/* Data correction notice — shown once enrichment has some data */}
          {hasEnrichment && !isEnriching && (
            <div className="rounded-cos-xl border border-cos-electric/15 bg-cos-electric/5 px-4 py-3">
              <p className="text-xs leading-relaxed text-cos-electric">
                If any of the data above is wrong, you&apos;ll have a chance to
                update it once you complete the onboarding questions and create
                your account.
              </p>
            </div>
          )}

          {/* ─── Partner Preferences Progress ─── */}
          <PreferenceProgress
            desiredServices={desiredServices}
            partnerIndustries={partnerIndustries}
            clientSize={clientSize}
            partnerLocations={partnerLocations}
            partnerTypes={partnerTypes}
            partnerSize={partnerSize}
            projectSize={projectSize}
            hourlyRates={hourlyRates}
            partnershipRole={partnershipRole}
          />

          {/* ─── Partner Preference Cards (from guest cache) ─── */}
          {desiredServices.length > 0 && (
            <RevealCard icon={Search} label="Services Wanted from Partners" delay={0}>
              <PillList items={desiredServices} pillClass="bg-cos-electric/8 text-cos-electric" />
            </RevealCard>
          )}
          {partnerIndustries.length > 0 && (
            <RevealCard icon={Briefcase} label="Required Partner Industries" delay={0}>
              <PillList items={partnerIndustries} pillClass="bg-cos-signal/8 text-cos-signal" />
            </RevealCard>
          )}
          {clientSize.length > 0 && (
            <RevealCard icon={Users} label="Ideal Partner Client Size" delay={0}>
              <PillList items={clientSize} pillClass="bg-cos-midnight/6 text-cos-midnight" />
            </RevealCard>
          )}
          {partnerLocations.length > 0 && (
            <RevealCard icon={MapPin} label="Partner Locations" delay={0}>
              <p>{partnerLocations.join(", ")}</p>
            </RevealCard>
          )}
          {partnerTypes.length > 0 && (
            <RevealCard icon={Handshake} label="Preferred Partner Types" delay={0}>
              <PillList items={partnerTypes} pillClass="bg-cos-signal/10 text-cos-signal" />
            </RevealCard>
          )}
          {partnerSize.length > 0 && (
            <RevealCard icon={Building} label="Preferred Partner Size" delay={0}>
              <PillList items={partnerSize} pillClass="bg-cos-midnight/6 text-cos-midnight" />
            </RevealCard>
          )}
          {projectSize.length > 0 && (
            <RevealCard icon={Ruler} label="Ideal Project Size" delay={0}>
              <PillList items={projectSize} pillClass="bg-cos-warm/10 text-cos-warm" />
            </RevealCard>
          )}
          {hourlyRates && (
            <RevealCard icon={DollarSign} label="Typical Hourly Rates" delay={0}>
              <p>{hourlyRates}</p>
            </RevealCard>
          )}
          {partnershipRole && (
            <RevealCard icon={Handshake} label="Partnership Role" delay={0}>
              <p>{partnershipRole}</p>
            </RevealCard>
          )}
          {partnerModels.length > 0 && (
            <RevealCard icon={Target} label="Partnership Models" delay={0}>
              <PillList items={partnerModels} pillClass="bg-cos-electric/10 text-cos-electric" />
            </RevealCard>
          )}
          {dealBreakers.length > 0 && (
            <RevealCard icon={ShieldAlert} label="Deal Breakers" delay={0}>
              <PillList items={dealBreakers} pillClass="bg-cos-ember/10 text-cos-ember" />
            </RevealCard>
          )}
          {growthGoals && (
            <RevealCard icon={TrendingUp} label="Growth Goals" delay={0}>
              <p>{growthGoals}</p>
            </RevealCard>
          )}
          {/* Scroll anchor — auto-scrolls here when new cards appear */}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
