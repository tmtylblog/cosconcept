"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Search,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Handshake,
  RotateCcw,
  X,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface FirmOption {
  id: string;
  name: string;
  firmType: string | null;
}

interface ScoreBreakdown {
  capabilityGapMatch: number;
  reverseMatch: number;
  firmTypePreference: number;
  geographyOverlap: number;
  symbioticBonus: number;
  dealBreakerPenalty: number;
  industryOverlap: number;
  dataRichness: number;
  preferenceCompleteness: number;
  total: number;
}

interface PartnerMatch {
  firmId: string;
  firmName: string;
  website: string | null;
  description: string | null;
  firmType: string | null;
  services: string[];
  industries: string[];
  skills: string[];
  matchScore: number;
  scoreBreakdown?: ScoreBreakdown;
  explanation: string;
  symbioticType: string | null;
  theirGapsThatYouFill: string[];
  talkingPoints: string[];
  bidirectionalFit: { theyWantUs: number; weWantThem: number };
}

interface SimulationResult {
  sourceFirm: { id: string; name: string; firmType: string | null; services: string[]; skills: string[]; industries: string[] };
  preferencesUsed: Record<string, unknown>;
  matches: PartnerMatch[];
  stats: { candidatesScored: number; matchesReturned: number; durationMs: number };
}

// ─── Firm Selector ──────────────────────────────────────────

function FirmSelector({
  firms,
  selected,
  onSelect,
}: {
  firms: FirmOption[];
  selected: FirmOption | null;
  onSelect: (firm: FirmOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? firms.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : firms.slice(0, 30);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative w-80">
      <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border bg-white px-3 py-2">
        <Search className="h-4 w-4 text-cos-slate-light" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected ? selected.name : "Search for a firm..."}
          className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-cos-lg border border-cos-border bg-white shadow-lg max-h-64 overflow-y-auto">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => { onSelect(f); setOpen(false); setQuery(""); }}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-cos-electric/5 transition-colors",
                selected?.id === f.id && "bg-cos-electric/10"
              )}
            >
              <span className="font-medium text-cos-midnight">{f.name}</span>
              {f.firmType && (
                <span className="ml-2 text-xs text-cos-slate-light">{f.firmType}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tag Input ──────────────────────────────────────────────

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] font-medium text-cos-electric">
              {t}
              <button onClick={() => onRemove(t)} className="hover:text-cos-ember"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { onAdd(input.trim()); setInput(""); } }}
          placeholder={placeholder}
          className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
        />
        <button
          onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput(""); } }}
          className="rounded-cos-md bg-cos-electric/10 px-2 py-1 text-cos-electric hover:bg-cos-electric/20"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Score Bar ──────────────────────────────────────────────

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  const isNegative = value < 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-cos-slate-dim">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-cos-border">
        <div
          className={cn("h-1.5 rounded-full transition-all", isNegative ? "bg-cos-ember" : "bg-cos-electric")}
          style={{ width: `${Math.abs(pct)}%` }}
        />
      </div>
      <span className={cn("w-10 text-right font-mono", isNegative ? "text-cos-ember" : "text-cos-midnight")}>
        {value}/{max}
      </span>
    </div>
  );
}

// ─── Match Card ─────────────────────────────────────────────

function MatchCard({
  match,
  sourceFirmId,
}: {
  match: PartnerMatch;
  sourceFirmId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const scoreColor = match.matchScore >= 70
    ? "text-cos-signal bg-cos-signal/10"
    : match.matchScore >= 40
      ? "text-cos-warm bg-cos-warm/10"
      : "text-cos-slate bg-cos-cloud-dim";

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: sourceFirmId,
          targetFirmId: match.firmId,
          type: "suggested",
          message: `Admin simulator match. Score: ${match.matchScore}%. ${match.explanation}`,
        }),
      });
      if (res.ok || res.status === 409) setCreated(true);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-heading text-sm font-semibold text-cos-midnight truncate">{match.firmName}</h4>
            {match.website && (
              <a href={match.website.startsWith("http") ? match.website : `https://${match.website}`} target="_blank" rel="noopener noreferrer" className="text-cos-slate-light hover:text-cos-electric">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {match.firmType && <p className="text-[11px] text-cos-slate">{match.firmType}</p>}
        </div>
        <div className={cn("rounded-cos-lg px-2.5 py-1 text-sm font-bold", scoreColor)}>
          {match.matchScore}%
        </div>
      </div>

      {/* Explanation */}
      {match.explanation !== "AI explanation skipped." && (
        <p className="text-xs text-cos-slate leading-relaxed">{match.explanation}</p>
      )}

      {/* Symbiotic */}
      {match.symbioticType && (
        <div className="flex items-center gap-1.5">
          <Handshake className="h-3 w-3 text-cos-signal" />
          <p className="text-[10px] text-cos-signal font-medium truncate">{match.symbioticType.slice(0, 80)}</p>
        </div>
      )}

      {/* Score Breakdown (expandable) */}
      {match.scoreBreakdown && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim hover:text-cos-electric"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Score Breakdown
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 rounded-cos-lg bg-cos-cloud-dim p-3">
              <ScoreBar label="Gap Match" value={match.scoreBreakdown.capabilityGapMatch} max={30} />
              <ScoreBar label="Reverse Match" value={match.scoreBreakdown.reverseMatch} max={20} />
              <ScoreBar label="Firm Type" value={match.scoreBreakdown.firmTypePreference} max={20} />
              <ScoreBar label="Geography" value={match.scoreBreakdown.geographyOverlap} max={10} />
              <ScoreBar label="Symbiotic" value={match.scoreBreakdown.symbioticBonus} max={10} />
              {match.scoreBreakdown.dealBreakerPenalty < 0 && (
                <ScoreBar label="Deal Breaker" value={match.scoreBreakdown.dealBreakerPenalty} max={40} />
              )}
              <ScoreBar label="Industry" value={match.scoreBreakdown.industryOverlap} max={5} />
              <ScoreBar label="Data Richness" value={match.scoreBreakdown.dataRichness} max={5} />
              <ScoreBar label="Has Prefs" value={match.scoreBreakdown.preferenceCompleteness} max={10} />
            </div>
          )}
        </div>
      )}

      {/* Bidirectional fit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-cos-slate-dim">They want you</p>
          <div className="h-1.5 rounded-full bg-cos-border">
            <div className="h-1.5 rounded-full bg-cos-signal" style={{ width: `${Math.round(match.bidirectionalFit.theyWantUs * 100)}%` }} />
          </div>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-cos-slate-dim">You want them</p>
          <div className="h-1.5 rounded-full bg-cos-border">
            <div className="h-1.5 rounded-full bg-cos-electric" style={{ width: `${Math.round(match.bidirectionalFit.weWantThem * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Talking points */}
      {match.talkingPoints.length > 0 && (
        <ul className="space-y-0.5">
          {match.talkingPoints.map((tp, i) => (
            <li key={i} className="text-[11px] text-cos-slate flex items-start gap-1">
              <span className="text-cos-slate-light mt-0.5">•</span> {tp}
            </li>
          ))}
        </ul>
      )}

      {/* Create partnership */}
      {created ? (
        <div className="flex items-center gap-1.5 text-xs text-cos-signal">
          <CheckCircle2 className="h-3.5 w-3.5" /> Partnership created
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={handleCreate} disabled={creating} className="w-full">
          {creating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Handshake className="mr-1.5 h-3 w-3" />}
          Create Suggested Partnership
        </Button>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function PartnerSimulatorPage() {
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [selectedFirm, setSelectedFirm] = useState<FirmOption | null>(null);
  const [skipAI, setSkipAI] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preference overrides
  const [philosophy, setPhilosophy] = useState("");
  const [capGaps, setCapGaps] = useState<string[]>([]);
  const [partnerTypes, setPartnerTypes] = useState<string[]>([]);
  const [dealBreaker, setDealBreaker] = useState("");
  const [geoPreference, setGeoPreference] = useState("");
  const prefsInitializedRef = useRef(false);

  // Load firms list
  useEffect(() => {
    fetch("/api/admin/customers?limit=2000")
      .then((r) => r.json())
      .then((data) => {
        const users = data.users ?? [];
        // Dedupe by firmId
        const seen = new Set<string>();
        const firmList: FirmOption[] = [];
        for (const u of users) {
          if (u.firmId && !seen.has(u.firmId)) {
            seen.add(u.firmId);
            firmList.push({ id: u.firmId, name: u.firmName ?? u.orgName ?? "Unknown", firmType: u.firmType ?? null });
          }
        }
        firmList.sort((a, b) => a.name.localeCompare(b.name));
        setFirms(firmList);
      })
      .catch(console.error);
  }, []);

  const resetPrefsToActual = useCallback((prefs: Record<string, unknown>) => {
    setPhilosophy(typeof prefs.partnershipPhilosophy === "string" ? prefs.partnershipPhilosophy : "");
    setCapGaps(Array.isArray(prefs.capabilityGaps) ? prefs.capabilityGaps as string[] : []);
    setPartnerTypes(Array.isArray(prefs.preferredPartnerTypes) ? prefs.preferredPartnerTypes as string[] : []);
    setDealBreaker(typeof prefs.dealBreaker === "string" ? prefs.dealBreaker : "");
    setGeoPreference(typeof prefs.geographyPreference === "string" ? prefs.geographyPreference : "");
  }, []);

  const runSimulation = async () => {
    if (!selectedFirm) return;
    setRunning(true);
    setError(null);
    setResult(null);

    const overrides: Record<string, unknown> = {};
    if (philosophy) overrides.partnershipPhilosophy = philosophy;
    if (capGaps.length > 0) overrides.capabilityGaps = capGaps;
    if (partnerTypes.length > 0) overrides.preferredPartnerTypes = partnerTypes;
    if (dealBreaker) overrides.dealBreaker = dealBreaker;
    if (geoPreference) overrides.geographyPreference = geoPreference;

    try {
      const res = await fetch("/api/admin/partner-matching/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFirmId: selectedFirm.id,
          overridePreferences: Object.keys(overrides).length > 0 ? overrides : undefined,
          skipAI,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Simulation failed");
      }
      const data: SimulationResult = await res.json();
      setResult(data);

      // Initialize pref overrides from actual prefs on first run
      if (!prefsInitializedRef.current) {
        resetPrefsToActual(data.preferencesUsed);
        prefsInitializedRef.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cos-electric" />
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Partnership Simulator
          </h1>
        </div>
        <p className="mt-1 text-sm text-cos-slate">
          Test partner matching for any firm. Adjust preferences on the fly. No data is changed unless you explicitly create a partnership.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-surface p-4">
        <FirmSelector firms={firms} selected={selectedFirm} onSelect={(f) => { setSelectedFirm(f); prefsInitializedRef.current = false; setResult(null); }} />
        <label className="flex items-center gap-2 text-xs text-cos-slate">
          <input type="checkbox" checked={skipAI} onChange={(e) => setSkipAI(e.target.checked)} className="rounded" />
          Skip AI (faster)
        </label>
        <Button onClick={runSimulation} disabled={!selectedFirm || running} size="sm">
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          Run Matching
        </Button>
      </div>

      {error && (
        <div className="rounded-cos-lg bg-cos-ember/10 px-4 py-3 text-sm text-cos-ember">{error}</div>
      )}

      {/* Two-column layout */}
      {selectedFirm && (
        <div className="flex gap-6">
          {/* Left — Preferences */}
          <div className="w-80 shrink-0 space-y-4">
            <div className="sticky top-6 space-y-4">
              {/* Source firm info */}
              {result?.sourceFirm && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Source Firm</h3>
                  <p className="font-heading text-sm font-semibold text-cos-midnight">{result.sourceFirm.name}</p>
                  {result.sourceFirm.firmType && <p className="text-[11px] text-cos-slate">{result.sourceFirm.firmType}</p>}
                  {result.sourceFirm.services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.sourceFirm.services.slice(0, 5).map((s) => (
                        <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-1.5 py-0.5 text-[10px] text-cos-slate">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preference overrides */}
              <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Preference Overrides</h3>
                  {result?.preferencesUsed && (
                    <button onClick={() => resetPrefsToActual(result.preferencesUsed)} className="text-[10px] text-cos-electric hover:underline flex items-center gap-1">
                      <RotateCcw className="h-2.5 w-2.5" /> Reset
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Philosophy</label>
                  <textarea
                    value={philosophy}
                    onChange={(e) => setPhilosophy(e.target.value)}
                    rows={2}
                    placeholder="breadth / depth / opportunities"
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Capability Gaps</label>
                  <TagInput
                    tags={capGaps}
                    onAdd={(t) => setCapGaps([...capGaps, t])}
                    onRemove={(t) => setCapGaps(capGaps.filter((g) => g !== t))}
                    placeholder="Add gap..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Partner Types</label>
                  <TagInput
                    tags={partnerTypes}
                    onAdd={(t) => setPartnerTypes([...partnerTypes, t])}
                    onRemove={(t) => setPartnerTypes(partnerTypes.filter((g) => g !== t))}
                    placeholder="Add type..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Deal Breaker</label>
                  <input
                    type="text"
                    value={dealBreaker}
                    onChange={(e) => setDealBreaker(e.target.value)}
                    placeholder="None"
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Geography</label>
                  <input
                    type="text"
                    value={geoPreference}
                    onChange={(e) => setGeoPreference(e.target.value)}
                    placeholder="Global"
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right — Results */}
          <div className="min-w-0 flex-1 space-y-4">
            {running && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
                  <p className="text-sm text-cos-slate">{skipAI ? "Scoring candidates..." : "Scoring + generating AI explanations..."}</p>
                </div>
              </div>
            )}

            {!running && result && (
              <>
                {/* Stats */}
                <div className="flex items-center gap-4 rounded-cos-lg bg-cos-cloud-dim px-4 py-2.5 text-xs text-cos-slate">
                  <span><strong className="text-cos-midnight">{result.stats.candidatesScored}</strong> candidates scored</span>
                  <span><strong className="text-cos-midnight">{result.stats.matchesReturned}</strong> matches returned</span>
                  <span><strong className="text-cos-midnight">{result.stats.durationMs}ms</strong> total</span>
                </div>

                {result.matches.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm text-cos-slate">No matches found. Try adjusting preferences and re-running.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.matches.map((m) => (
                      <MatchCard key={m.firmId} match={m} sourceFirmId={result.sourceFirm.id} />
                    ))}
                  </div>
                )}
              </>
            )}

            {!running && !result && (
              <div className="py-20 text-center text-sm text-cos-slate">
                Select a firm and click &quot;Run Matching&quot; to see partner recommendations.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
