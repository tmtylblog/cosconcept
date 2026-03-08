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
} from "lucide-react";
import { useEnrichment } from "@/hooks/use-enrichment";
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

export default function DashboardPage() {
  const { status: enrichmentStatus, result } = useEnrichment();

  const isEnriching = enrichmentStatus === "loading";
  const isFailed = enrichmentStatus === "failed";
  const isDone = enrichmentStatus === "done";

  // Extract data sections (only show cards with actual data)
  const companyData = result?.companyData;
  const extracted = result?.extracted;
  const classification = result?.classification;

  const firmName = companyData?.name;
  const firmIndustry = companyData?.industry;
  const firmLocation = companyData?.location;
  const firmSize = companyData?.size;

  const services = extracted?.services?.length ? extracted.services : null;
  const clients = extracted?.clients?.length ? extracted.clients : null;
  const skills = classification?.skills?.length ? classification.skills : null;
  const markets = classification?.markets?.length ? classification.markets : null;
  const languages = classification?.languages?.length ? classification.languages : null;

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

      {/* Welcome prompt — only when idle (no enrichment yet) */}
      {enrichmentStatus === "idle" && (
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
      {isDone && (
        <div className={cn("flex w-full flex-col gap-3", isDone && "mt-2")}>
          {/* Firm identity */}
          {firmName && (
            <RevealCard icon={Building2} label="Your Firm" delay={0}>
              <p className="font-semibold">{firmName}</p>
              {(firmIndustry || firmLocation || firmSize) && (
                <p className="mt-0.5 text-xs text-cos-slate">
                  {[firmIndustry, firmSize, firmLocation].filter(Boolean).join(" · ")}
                </p>
              )}
            </RevealCard>
          )}

          {/* Services */}
          {services && (
            <RevealCard icon={Briefcase} label="Services" delay={100}>
              <div className="flex flex-wrap gap-1.5">
                {services.slice(0, 8).map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-electric/8 px-2.5 py-1 text-xs font-medium text-cos-electric"
                  >
                    {s}
                  </span>
                ))}
                {services.length > 8 && (
                  <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate">
                    +{services.length - 8} more
                  </span>
                )}
              </div>
            </RevealCard>
          )}

          {/* Clients */}
          {clients && (
            <RevealCard icon={Users} label="Clients Identified" delay={200}>
              <div className="flex flex-wrap gap-1.5">
                {clients.slice(0, 10).map((c) => (
                  <span
                    key={c}
                    className="rounded-cos-pill bg-cos-signal/8 px-2.5 py-1 text-xs font-medium text-cos-signal"
                  >
                    {c}
                  </span>
                ))}
                {clients.length > 10 && (
                  <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate">
                    +{clients.length - 10} more
                  </span>
                )}
              </div>
            </RevealCard>
          )}

          {/* Skills */}
          {skills && (
            <RevealCard icon={Wrench} label="Skills" delay={300}>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 10).map((s) => (
                  <span
                    key={s}
                    className="rounded-cos-pill bg-cos-midnight/6 px-2.5 py-1 text-xs font-medium text-cos-midnight"
                  >
                    {s}
                  </span>
                ))}
                {skills.length > 10 && (
                  <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-xs text-cos-slate">
                    +{skills.length - 10} more
                  </span>
                )}
              </div>
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
        </div>
      )}
    </div>
  );
}
