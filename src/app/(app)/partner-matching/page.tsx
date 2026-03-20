"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  ExternalLink,
  MessageCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Handshake,
  Target,
  MapPin,
  ShieldAlert,
  Lightbulb,
  Send,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { useOssyContext } from "@/hooks/use-ossy-context";
import { emitOssyEvent } from "@/lib/ossy-events";
import { emitCosSignal } from "@/lib/cos-signal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchLoader } from "@/components/discover/search-loader";
import type { PartnerMatch } from "@/app/api/partner-matching/route";

// V2 preference fields required for matching
const V2_FIELDS = [
  "partnershipPhilosophy",
  "capabilityGaps",
  "preferredPartnerTypes",
  "dealBreaker",
  "geographyPreference",
] as const;

const V2_LABELS: Record<string, string> = {
  partnershipPhilosophy: "Partnership Philosophy",
  capabilityGaps: "Capability Gaps",
  preferredPartnerTypes: "Partner Types",
  dealBreaker: "Deal Breaker",
  geographyPreference: "Geography",
};

// ─── Preference Incomplete State ─────────────────────────────
// Shows what's missing and prompts the user to talk to Ossy

function PreferenceIncompleteState({
  filledFields,
  missingFields,
}: {
  filledFields: string[];
  missingFields: string[];
}) {
  return (
    <div className="mx-auto max-w-xl space-y-8 p-6 py-12">
      {/* Header */}
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-cos-2xl bg-cos-electric/10">
          <Sparkles className="h-6 w-6 text-cos-electric" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-cos-midnight">
          Partner Matching
        </h2>
        <p className="text-sm text-cos-slate leading-relaxed">
          Before I can find your best-fit partners, Ossy needs to understand what
          you&apos;re looking for. Answer 5 quick questions in the chat panel and
          your matches will appear here automatically.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-cos-midnight">
            {filledFields.length} of {V2_FIELDS.length} preferences set
          </span>
          <span className="text-cos-slate-dim">
            {Math.round((filledFields.length / V2_FIELDS.length) * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {V2_FIELDS.map((f) => (
            <div
              key={f}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                filledFields.includes(f) ? "bg-cos-signal" : "bg-cos-border"
              )}
            />
          ))}
        </div>
      </div>

      {/* Field status list */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface p-5 space-y-3">
        {V2_FIELDS.map((f) => {
          const filled = filledFields.includes(f);
          return (
            <div key={f} className="flex items-center gap-3">
              {filled ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-cos-signal" />
              ) : (
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-cos-border" />
              )}
              <span
                className={cn(
                  "text-sm",
                  filled ? "text-cos-midnight" : "text-cos-slate"
                )}
              >
                {V2_LABELS[f]}
              </span>
              {filled && (
                <span className="ml-auto text-[10px] font-medium text-cos-signal">Done</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Ossy prompt */}
      <div className="rounded-cos-2xl border border-cos-electric/20 bg-cos-electric/5 p-5 text-center space-y-3">
        <MessageCircle className="mx-auto h-6 w-6 text-cos-electric" />
        <p className="text-sm font-medium text-cos-midnight">
          Talk to Ossy in the chat panel
        </p>
        <p className="text-xs text-cos-slate">
          Ossy will ask you about your partnership goals, capability gaps,
          and preferences. Your answers appear here in real-time as you chat.
        </p>
      </div>
    </div>
  );
}

// ─── Match Card ──────────────────────────────────────────────

function MatchCard({
  match,
  firmId,
  onIntroRequested,
}: {
  match: PartnerMatch;
  firmId: string;
  onIntroRequested: (firmId: string) => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreColor =
    match.matchScore >= 70
      ? "text-cos-signal bg-cos-signal/10"
      : match.matchScore >= 40
        ? "text-cos-warm bg-cos-warm/10"
        : "text-cos-slate bg-cos-cloud-dim";

  const handleRequestIntro = async () => {
    setRequesting(true);
    setError(null);
    try {
      // 1. Create partnership
      const pRes = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId,
          targetFirmId: match.firmId,
          type: "trusted_partner",
          message: `Partner matching introduction request. Match score: ${match.matchScore}%. ${match.explanation}`,
        }),
      });

      if (!pRes.ok) {
        const data = await pRes.json();
        if (pRes.status === 409) {
          setRequested(true);
          setShowConfirm(false);
          return;
        }
        throw new Error(data.error ?? "Failed to create partnership");
      }

      const { partnership } = await pRes.json();

      // 2. Queue intro email
      const introRes = await fetch("/api/partnerships/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnershipId: partnership.id,
          firmAId: firmId,
          firmBId: match.firmId,
          matchScore: match.matchScore,
          matchExplanation: match.explanation,
        }),
      });

      if (!introRes.ok) {
        console.warn("Intro email queue failed, partnership still created");
      }

      setRequested(true);
      setShowConfirm(false);
      onIntroRequested(match.firmId);

      // Emit signal for Ossy to acknowledge
      emitCosSignal({
        kind: "action",
        page: "partner-matching",
        action: "request_intro",
        entityId: match.firmId,
        displayName: match.firmName,
        meta: { matchScore: match.matchScore },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="rounded-cos-2xl border border-cos-border bg-cos-surface-raised p-5 space-y-4 transition-shadow hover:shadow-cos-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-base font-semibold text-cos-midnight truncate">
              {match.firmName}
            </h3>
            {match.website && (
              <a
                href={match.website.startsWith("http") ? match.website : `https://${match.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-cos-slate-light hover:text-cos-electric"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {match.firmType && (
            <p className="text-xs text-cos-slate">{match.firmType}</p>
          )}
        </div>
        <div className={cn("rounded-cos-lg px-2.5 py-1 text-sm font-bold", scoreColor)}>
          {match.matchScore}%
        </div>
      </div>

      {/* Description */}
      {match.description && (
        <p className="text-xs text-cos-slate leading-relaxed line-clamp-2">
          {match.description}
        </p>
      )}

      {/* Why this could work */}
      <div className="rounded-cos-lg bg-cos-electric/5 p-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-cos-electric" />
          <p className="text-xs font-semibold text-cos-electric">Why this could work</p>
        </div>
        <p className="text-xs text-cos-midnight leading-relaxed">{match.explanation}</p>
      </div>

      {/* Symbiotic type */}
      {match.symbioticType && (
        <div className="flex items-center gap-1.5">
          <Handshake className="h-3 w-3 text-cos-signal" />
          <p className="text-[11px] text-cos-signal font-medium">
            Known symbiotic pair: {match.symbioticType.slice(0, 80)}
          </p>
        </div>
      )}

      {/* Services/Skills tags */}
      {match.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {match.services.slice(0, 5).map((s) => (
            <span
              key={s}
              className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
            >
              {s}
            </span>
          ))}
          {match.services.length > 5 && (
            <span className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate-light">
              +{match.services.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* What they need from YOU */}
      {match.theirGapsThatYouFill.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-warm">
            They need what you offer
          </p>
          <div className="flex flex-wrap gap-1">
            {match.theirGapsThatYouFill.slice(0, 4).map((g) => (
              <span
                key={g}
                className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Talking points */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
          Suggested talking points
        </p>
        <ul className="space-y-1">
          {match.talkingPoints.map((tp, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-cos-slate">
              <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-cos-slate-light" />
              <span>{tp}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bidirectional fit bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] text-cos-slate-dim">They want you</p>
          <div className="h-1.5 rounded-full bg-cos-border">
            <div
              className="h-1.5 rounded-full bg-cos-signal transition-all"
              style={{ width: `${Math.round(match.bidirectionalFit.theyWantUs * 100)}%` }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-cos-slate-dim">You want them</p>
          <div className="h-1.5 rounded-full bg-cos-border">
            <div
              className="h-1.5 rounded-full bg-cos-electric transition-all"
              style={{ width: `${Math.round(match.bidirectionalFit.weWantThem * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* CTA */}
      {requested ? (
        <div className="flex items-center gap-2 rounded-cos-lg bg-cos-signal/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-xs font-medium text-cos-signal">
            Introduction queued! Our team will review and send it shortly.
          </p>
        </div>
      ) : showConfirm ? (
        <div className="space-y-2 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 p-3">
          <p className="text-xs text-cos-midnight leading-relaxed">
            Ossy will draft an introduction email for admin review. Both parties will be asked
            to reply-all to coordinate a meeting time.
          </p>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-cos-ember">
              <AlertCircle className="h-3 w-3" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleRequestIntro}
              disabled={requesting}
            >
              {requesting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirm Introduction
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowConfirm(false)}
              disabled={requesting}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setShowConfirm(true)}
        >
          <Handshake className="mr-1.5 h-3.5 w-3.5" />
          Request Introduction
        </Button>
      )}
    </div>
  );
}

// ─── Preferences Summary Card ────────────────────────────────

function PreferencesSummary({ profile }: { profile: Record<string, unknown> }) {
  return (
    <div className="rounded-cos-2xl border border-cos-border bg-cos-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-cos-midnight">
          Your Preferences
        </h3>
        <Link
          href="/firm/preferences"
          className="text-xs text-cos-electric hover:underline"
        >
          Edit
        </Link>
      </div>

      {profile.partnershipPhilosophy && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3 text-cos-slate-dim" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Philosophy
            </p>
          </div>
          <p className="text-xs text-cos-midnight line-clamp-2">
            {String(profile.partnershipPhilosophy)}
          </p>
        </div>
      )}

      {Array.isArray(profile.capabilityGaps) && profile.capabilityGaps.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-cos-slate-dim" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Capability Gaps
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(profile.capabilityGaps as string[]).map((g) => (
              <span
                key={g}
                className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.geographyPreference && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-cos-slate-dim" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Geography
            </p>
          </div>
          <p className="text-xs text-cos-midnight">
            {String(profile.geographyPreference)}
          </p>
        </div>
      )}

      {profile.dealBreaker && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-cos-slate-dim" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">
              Deal Breaker
            </p>
          </div>
          <p className="text-xs text-cos-midnight">
            {String(profile.dealBreaker)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function PartnerMatchingPage() {
  const { data: profile, hydrated } = useProfile();
  const { setPageContext } = useOssyContext();
  const [matches, setMatches] = useState<PartnerMatch[]>([]);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Compute V2 preference completeness from profile data
  const profileData = profile as Record<string, unknown>;
  const filledFields = V2_FIELDS.filter((f) => {
    const val = profileData[f];
    if (Array.isArray(val)) return val.length > 0;
    return !!val;
  });
  const missingFields = useMemo(() => V2_FIELDS.filter((f) => !filledFields.includes(f)), [filledFields]);
  const prefsComplete = missingFields.length === 0;

  // Register page context for Ossy
  useEffect(() => {
    if (!hydrated) return;
    setPageContext({
      page: "partner-matching",
      prefsComplete,
      missingFields: [...missingFields],
      matchCount: matches.length,
    });
    return () => setPageContext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, prefsComplete, missingFields.length, matches.length, setPageContext]);

  // Auto-trigger Ossy to start preference interview when prefs are incomplete
  const ossyTriggeredRef = useRef(false);
  useEffect(() => {
    if (!hydrated || prefsComplete || ossyTriggeredRef.current) return;
    // Small delay to let chat panel mount and be ready to receive events
    const timer = setTimeout(() => {
      emitOssyEvent({
        type: "partner_matching_needs_prefs",
        missingFields: [...missingFields],
      });
      ossyTriggeredRef.current = true;
    }, 1500);
    return () => clearTimeout(timer);
  }, [hydrated, prefsComplete, missingFields]);

  // Load matches when preferences are complete (with session cache to avoid repeat AI calls)
  const matchesNotifiedRef = useRef(false);
  const CACHE_KEY = "cos_partner_matches";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const loadMatches = useCallback(async () => {
    // Check session cache first — avoids 2-5s Gemini AI call on revisit
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data: cachedData, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL && cachedData.matches?.length > 0) {
          setMatches(cachedData.matches);
          setFirmId(cachedData.firmId ?? null);
          setMessage(cachedData.message ?? null);
          return;
        }
      }
    } catch { /* ignore cache errors */ }

    setLoading(true);
    try {
      const res = await fetch("/api/partner-matching");
      if (!res.ok) throw new Error("Failed to load matches");
      const data = await res.json();
      const loadedMatches: PartnerMatch[] = data.matches ?? [];

      // Cache results to avoid re-calling Gemini on page revisit
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      } catch { /* ignore */ }
      setMatches(loadedMatches);
      setFirmId(data.firmId ?? null);
      setMessage(data.message ?? null);

      // Notify Ossy about the matches so it can comment
      if (loadedMatches.length > 0 && !matchesNotifiedRef.current) {
        matchesNotifiedRef.current = true;
        const top3 = loadedMatches.slice(0, 3);
        const topMatches = top3
          .map((m) => `${m.firmName} (${m.matchScore}%${m.firmType ? ", " + m.firmType : ""})`)
          .join("; ");
        // Detect patterns
        const types = loadedMatches.map((m) => m.firmType).filter(Boolean);
        const typeCounts = types.reduce((acc, t) => { acc[t!] = (acc[t!] ?? 0) + 1; return acc; }, {} as Record<string, number>);
        const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, c]) => `${c}x ${t}`);
        const withPrefs = loadedMatches.filter((m) => m.theirGapsThatYouFill.length > 0).length;
        const patterns = [
          topTypes.length > 0 ? `Firm types: ${topTypes.join(", ")}` : "",
          withPrefs > 0 ? `${withPrefs} firms actively need what you offer` : "",
          loadedMatches.some((m) => m.symbioticType) ? "Some known symbiotic pairs found" : "",
        ].filter(Boolean).join(". ");

        setTimeout(() => {
          emitOssyEvent({
            type: "partner_matches_loaded",
            matchCount: loadedMatches.length,
            topMatches,
            patterns,
          });
        }, 1000);
      }
    } catch (err) {
      console.error("Failed to load partner matches:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && prefsComplete) {
      const controller = new AbortController();
      loadMatches();
      return () => controller.abort();
    }
  }, [hydrated, prefsComplete, loadMatches]);

  // Loading state
  if (!hydrated) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
        <p className="text-sm text-cos-slate">Loading profile...</p>
      </div>
    );
  }

  // Preferences not complete — show status + prompt to use Ossy
  if (!prefsComplete) {
    return (
      <PreferenceIncompleteState
        filledFields={[...filledFields]}
        missingFields={[...missingFields]}
      />
    );
  }

  // Loading matches
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <SearchLoader />
      </div>
    );
  }

  // Matches loaded
  return (
    <div className="cos-scrollbar mx-auto max-w-6xl overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cos-electric" />
            <h2 className="font-heading text-xl font-bold text-cos-midnight">
              Partner Matching
            </h2>
          </div>
          <p className="mt-1 text-sm text-cos-slate">
            AI-powered partner recommendations based on your preferences and mutual fit.
          </p>
        </div>
        <Link href="/partnerships">
          <Button variant="outline" size="sm">
            <Handshake className="mr-1.5 h-3.5 w-3.5" />
            My Partnerships
          </Button>
        </Link>
      </div>

      {matches.length === 0 ? (
        // Empty state
        <div className="mx-auto max-w-md space-y-4 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-cos-2xl bg-cos-cloud-dim">
            <Handshake className="h-8 w-8 text-cos-slate-light" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-cos-midnight">
            No matches yet
          </h3>
          <p className="text-sm text-cos-slate">
            {message ?? "We couldn\u0027t find strong matches right now. Try broadening your partner preferences or check back as more firms join the platform."}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/firm/preferences">Update Preferences</Link>
          </Button>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Left sidebar — preferences summary */}
          <div className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-6">
              <PreferencesSummary profile={profileData} />
            </div>
          </div>

          {/* Right — match cards */}
          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-xs font-medium text-cos-slate-dim">
              {matches.length} potential partner{matches.length !== 1 ? "s" : ""} found
            </p>
            {matches.map((match) => (
              <MatchCard
                key={match.firmId}
                match={match}
                firmId={firmId!}
                onIntroRequested={() => {
                  // Could refresh to update button state
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
