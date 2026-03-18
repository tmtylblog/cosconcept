"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PartnerMatch } from "@/app/api/partner-matching/route";

// ─── Preference Gate Form ────────────────────────────────────

const PREF_QUESTIONS = [
  {
    field: "partnershipPhilosophy",
    label: "Partnership Philosophy",
    description: "How do you approach partnerships? What makes a great partner relationship for you?",
    placeholder: "e.g., We believe in deep, long-term partnerships where both sides actively refer work...",
    type: "textarea" as const,
  },
  {
    field: "capabilityGaps",
    label: "Capability Gaps",
    description: "What services or skills do you wish you had in-house? These are what partners would fill.",
    placeholder: "e.g., SEO, paid media, data engineering",
    type: "tags" as const,
  },
  {
    field: "preferredPartnerTypes",
    label: "Preferred Partner Types",
    description: "What types of firms would make ideal partners?",
    placeholder: "e.g., Creative agency, Development shop, Analytics firm",
    type: "tags" as const,
  },
  {
    field: "dealBreaker",
    label: "Deal Breaker",
    description: "Is there anything that would make a partner an absolute no-go?",
    placeholder: "e.g., Direct competitors, firms that poach clients...",
    type: "textarea" as const,
  },
  {
    field: "geographyPreference",
    label: "Geography Preference",
    description: "Do you prefer partners in specific regions, or are you open to global partnerships?",
    placeholder: "e.g., North America preferred, open to UK/EU",
    type: "textarea" as const,
  },
];

function PreferenceGateForm({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { data: profile, updateField } = useProfile();
  const [currentStep, setCurrentStep] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [tagValues, setTagValues] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const currentQ = PREF_QUESTIONS[currentStep];
  const isLastStep = currentStep === PREF_QUESTIONS.length - 1;

  // Initialize from existing profile data
  useEffect(() => {
    const texts: Record<string, string> = {};
    const tags: Record<string, string[]> = {};
    for (const q of PREF_QUESTIONS) {
      const val = (profile as Record<string, unknown>)[q.field];
      if (q.type === "textarea" && typeof val === "string") {
        texts[q.field] = val;
      } else if (q.type === "tags" && Array.isArray(val)) {
        tags[q.field] = val;
      }
    }
    setTextInputs(texts);
    setTagValues(tags);
  }, [profile]);

  const currentValue = currentQ.type === "textarea"
    ? textInputs[currentQ.field] ?? ""
    : tagValues[currentQ.field] ?? [];

  const isCurrentFilled = currentQ.type === "textarea"
    ? (textInputs[currentQ.field] ?? "").trim().length > 0
    : (tagValues[currentQ.field] ?? []).length > 0;

  const saveField = useCallback(async (field: string, value: string | string[]) => {
    updateField(field, value);
    try {
      await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
    } catch {
      // Non-critical — local state is updated
    }
  }, [updateField]);

  const handleNext = async () => {
    if (!isCurrentFilled) return;
    setSaving(true);
    await saveField(currentQ.field, currentValue);
    setSaving(false);

    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    const field = currentQ.field;
    const existing = tagValues[field] ?? [];
    if (existing.some((t) => t.toLowerCase() === tagInput.trim().toLowerCase())) {
      setTagInput("");
      return;
    }
    setTagValues({ ...tagValues, [field]: [...existing, tagInput.trim()] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const field = currentQ.field;
    setTagValues({
      ...tagValues,
      [field]: (tagValues[field] ?? []).filter((t) => t !== tag),
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-8 p-6 py-12">
      {/* Header */}
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-cos-2xl bg-cos-electric/10">
          <Sparkles className="h-6 w-6 text-cos-electric" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-cos-midnight">
          Set Up Partner Matching
        </h2>
        <p className="text-sm text-cos-slate leading-relaxed">
          Answer 5 quick questions so Ossy can find your best-fit partners.
          This takes about 2 minutes.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {PREF_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= currentStep ? "bg-cos-electric" : "bg-cos-border"
            )}
          />
        ))}
      </div>

      {/* Current question */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-cos-electric">
            Question {currentStep + 1} of {PREF_QUESTIONS.length}
          </p>
          <h3 className="font-heading text-lg font-semibold text-cos-midnight">
            {currentQ.label}
          </h3>
          <p className="text-sm text-cos-slate">{currentQ.description}</p>
        </div>

        {currentQ.type === "textarea" ? (
          <textarea
            value={textInputs[currentQ.field] ?? ""}
            onChange={(e) =>
              setTextInputs({ ...textInputs, [currentQ.field]: e.target.value })
            }
            placeholder={currentQ.placeholder}
            rows={3}
            className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
        ) : (
          <div className="space-y-3">
            {(tagValues[currentQ.field] ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(tagValues[currentQ.field] ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-cos-electric/20"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={currentQ.placeholder}
                className="flex-1 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
              />
              <Button size="sm" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {currentStep > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep((s) => s - 1)}
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!isCurrentFilled || saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {isLastStep ? "Find My Partners" : "Next"}
            {!isLastStep && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
          </Button>
        </div>
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
        // Partnership was created, just note the intro failed
        console.warn("Intro email queue failed, partnership still created");
      }

      setRequested(true);
      setShowConfirm(false);
      onIntroRequested(match.firmId);
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
  const [matches, setMatches] = useState<PartnerMatch[]>([]);
  const [firmId, setFirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefsComplete, setPrefsComplete] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/partner-matching");
      if (!res.ok) throw new Error("Failed to load matches");
      const data = await res.json();
      setPrefsComplete(data.preferencesComplete);
      setMatches(data.matches ?? []);
      setFirmId(data.firmId ?? null);
      setMessage(data.message ?? null);
    } catch (err) {
      console.error("Failed to load partner matches:", err);
      setPrefsComplete(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      loadMatches();
    }
  }, [hydrated, loadMatches]);

  // Loading state
  if (!hydrated || loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
        <p className="text-sm text-cos-slate">
          {loading ? "Finding your best-fit partners..." : "Loading profile..."}
        </p>
      </div>
    );
  }

  // Preferences not complete — show gate form
  if (prefsComplete === false) {
    return (
      <PreferenceGateForm onComplete={loadMatches} />
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
            {message ?? "We couldn&apos;t find strong matches right now. Try broadening your partner preferences or check back as more firms join the platform."}
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
              <PreferencesSummary profile={profile as Record<string, unknown>} />
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
                  // Could refresh to update button state for duplicate prevention
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
