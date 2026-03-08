"use client";

import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { useEnrichment } from "@/hooks/use-enrichment";

export default function DashboardPage() {
  const { status: enrichmentStatus } = useEnrichment();

  const isEnriching = enrichmentStatus === "loading";
  const isDone = enrichmentStatus === "done";
  const isFailed = enrichmentStatus === "failed";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-16">
      {/* Enrichment status banners */}
      {isEnriching && (
        <div className="mb-8 flex w-full items-center gap-3 rounded-cos-xl border border-cos-electric/20 bg-gradient-to-r from-cos-electric/5 to-cos-signal/5 px-5 py-3.5">
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

      {isDone && (
        <div className="mb-8 flex w-full items-center gap-3 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-5 py-3">
          <CheckCircle2 className="h-5 w-5 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            Research complete — continue chatting with Ossy to refine your profile
          </p>
        </div>
      )}

      {isFailed && (
        <div className="mb-8 flex w-full items-center gap-3 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-5 py-3">
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

      {/* Focused onboarding prompt — only when idle */}
      {enrichmentStatus === "idle" && (
        <div className="text-center">
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
    </div>
  );
}
