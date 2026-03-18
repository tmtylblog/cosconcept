/* eslint-disable @typescript-eslint/no-explicit-any */
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
  CheckCircle2,
  Shuffle,
  Microscope,
  FileText,
  User,
  Zap,
  Globe,
  Shield,
  Factory,
  Database,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Option Constants ────────────────────────────────────────

const PHILOSOPHY_OPTIONS = ["breadth", "depth", "opportunities"] as const;

const FIRM_CATEGORIES = [
  "Fractional & Embedded Leadership", "Training, Enablement & Professional Coaching",
  "Outsourcing & Managed Business Services", "Brand Strategy & Positioning",
  "Creative, Content & Production", "Customer Success & Retention",
  "Data, Analytics & Business Intelligence", "Market Research & Customer Intelligence",
  "Finance, Accounting & Tax", "Human Capital & Talent", "People Operations & HR",
  "Privacy, Risk & Compliance", "Legal", "Growth Marketing & Demand Generation",
  "Lifecycle, CRM & Marketing Operations", "Public Relations & Communications",
  "Operations & Process", "Change, Transformation & Reengineering",
  "Product Strategy & Innovation", "Product Management, UX & Design",
  "Sales Strategy & Enablement", "Revenue Operations & Go-To-Market",
  "Strategy & Management Consulting", "Technology Strategy & Digital Transformation",
  "Systems Integration & Enterprise Platforms", "Software Engineering & Custom Development",
  "AI, Automation & Intelligent Systems", "IT Infrastructure & Managed Services",
  "Cybersecurity & Information Security", "Industry & Applied Engineering",
];

const GEOGRAPHY_OPTIONS = ["Global", "North America", "Latin America", "Europe", "Asia Pacific", "Middle East & Africa", "UK only", "US only"];

const DEAL_BREAKER_OPTIONS = ["None", "Direct competitors", "Firms that poach clients", "Firms under 5 people", "No remote teams", "No offshore teams"];

function pickRandom<T>(arr: readonly T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

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
  evidenceDepth: number;
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

// ─── Multi-Select Dropdown ───────────────────────────────────

function MultiSelect({
  selected,
  options,
  onChange,
  placeholder,
}: {
  selected: string[];
  options: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const available = options.filter((o) =>
    !selected.includes(o) && o.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[11px] font-medium text-cos-electric">
              {t}
              <button onClick={() => onChange(selected.filter((s) => s !== t))} className="hover:text-cos-ember"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
      />
      {open && available.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-cos-md border border-cos-border bg-white shadow-lg max-h-40 overflow-y-auto">
          {available.slice(0, 15).map((o) => (
            <button
              key={o}
              onClick={() => { onChange([...selected, o]); setFilter(""); }}
              className="w-full px-2 py-1.5 text-left text-[11px] text-cos-midnight hover:bg-cos-electric/5 transition-colors"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Score Bar ──────────────────────────────────────────────

type DimensionKey = "capabilityGapMatch" | "reverseMatch" | "firmTypePreference" | "geographyOverlap" | "symbioticBonus" | "dealBreakerPenalty" | "industryOverlap" | "dataRichness" | "preferenceCompleteness";

function ScoreBar({ label, value, max, onClick }: { label: string; value: number; max: number; onClick?: () => void }) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  const isNegative = value < 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 text-xs rounded-cos-md px-1.5 py-1 -mx-1.5 transition-colors",
        onClick && "hover:bg-cos-electric/5 cursor-pointer"
      )}
    >
      <span className="w-28 shrink-0 text-cos-slate-dim text-left">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-cos-border">
        <div
          className={cn("h-1.5 rounded-full transition-all", isNegative ? "bg-cos-ember" : "bg-cos-electric")}
          style={{ width: `${Math.abs(pct)}%` }}
        />
      </div>
      <span className={cn("w-10 text-right font-mono", isNegative ? "text-cos-ember" : "text-cos-midnight")}>
        {value}/{max}
      </span>
      {onClick && <Microscope className="h-3 w-3 text-cos-slate-light shrink-0" />}
    </button>
  );
}

// ─── Evidence Types ─────────────────────────────────────────

interface EvidenceTrace {
  scoreBreakdown: ScoreBreakdown;
  dataLineage: {
    scorerUsed: { services: string[]; skills: string[]; industries: string[]; markets: string[]; categories: string[]; source: string };
    neo4jHas: { skills: number; services: number; caseStudies: number; experts: number; industries: number; markets: number; clients: number; prefEdges: number };
    notUsedByScorer: { neo4jOnlySkills: string[]; neo4jOnlyServices: string[]; neo4jOnlyIndustries: string[]; neo4jOnlyMarkets: string[]; caseStudySkillsNotInPg: string[]; expertSkillsNotInPg: string[] };
    warnings: string[];
  };
  dimensions: {
    capabilityGapMatch: any;
    reverseMatch: any;
    firmTypePreference: any;
    geographyOverlap: any;
    symbioticBonus: any;
    dealBreakerPenalty: any;
    industryOverlap: any;
    dataRichness: any;
    preferenceCompleteness: any;
  };
  candidateGraph: {
    skills: Array<{ name: string; caseStudyCount: number; expertCount: number; confidence: number; level: string | null; parentSkill: string | null }>;
    services: Array<{ name: string; evidenceCount: number; caseStudyCount: number; expertCount: number; websiteMentionCount: number; source: string | null }>;
    caseStudies: Array<{ title: string; id: string; skills: string[]; industries: string[]; clients: string[]; outcomes: string[] }>;
    experts: Array<{ name: string; headline: string; skills: string[]; industries: string[]; previousCompanies: string[] }>;
    categories: string[];
    markets: string[];
    clients: string[];
    industries: Array<{ name: string; source: string; fromCaseStudies: string[]; confidence: number | null; level: string | null }>;
  };
}
// ─── Tag ────────────────────────────────────────────────────

function Tag({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "signal" | "ember" | "warm" | "electric" }) {
  const colors = {
    default: "bg-cos-midnight/5 text-cos-slate",
    signal: "bg-cos-signal/10 text-cos-signal",
    ember: "bg-cos-ember/10 text-cos-ember",
    warm: "bg-cos-warm/10 text-cos-warm",
    electric: "bg-cos-electric/10 text-cos-electric",
  };
  return (
    <span className={cn("inline-block rounded-cos-pill px-1.5 py-0.5 text-[10px] font-medium", colors[variant])}>
      {children}
    </span>
  );
}

// ─── Source Label ────────────────────────────────────────────

function SourceLabel({ source }: { source: string }) {
  const colors: Record<string, string> = {
    pg: "bg-blue-100 text-blue-700",
    neo4j: "bg-purple-100 text-purple-700",
    csv: "bg-amber-100 text-amber-700",
    none: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={cn("inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider", colors[source] ?? colors.none)}>
      {source}
    </span>
  );
}

// ─── Deep Evidence Modal ────────────────────────────────────

const DIMENSION_META: Record<DimensionKey, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  capabilityGapMatch: { label: "Capability Gap Match", icon: Zap, description: "Do their services/skills fill your stated capability gaps?" },
  reverseMatch: { label: "Reverse Match", icon: RotateCcw, description: "Do your services/skills fill their stated capability gaps?" },
  firmTypePreference: { label: "Firm Type Preference", icon: Handshake, description: "Does the candidate match your preferred partner types (and vice versa)?" },
  geographyOverlap: { label: "Geography Overlap", icon: Globe, description: "Does the candidate operate in your preferred geography?" },
  symbioticBonus: { label: "Symbiotic Bonus", icon: Sparkles, description: "Is there a known symbiotic relationship between your firm types?" },
  dealBreakerPenalty: { label: "Deal Breaker", icon: AlertTriangle, description: "Does the candidate trigger any of your deal breakers?" },
  industryOverlap: { label: "Industry Overlap", icon: Factory, description: "Do you share industry verticals?" },
  dataRichness: { label: "Data Richness", icon: Database, description: "How much data exists for this firm? More data = higher confidence." },
  preferenceCompleteness: { label: "Preference Completeness", icon: Settings, description: "Has this firm completed their partnership preferences?" },
};

function DeepEvidenceModal({
  evidence,
  firmName,
  dimension,
  onClose,
}: {
  evidence: EvidenceTrace;
  firmName: string;
  dimension: DimensionKey;
  onClose: () => void;
}) {
  const meta = DIMENSION_META[dimension];
  const Icon = meta.icon;
  const d = evidence.dimensions[dimension];
  const g = evidence.candidateGraph;
  const lineage = evidence.dataLineage;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-cos-xl border border-cos-border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-cos-lg bg-cos-electric/10 p-2">
              <Icon className="h-5 w-5 text-cos-electric" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-cos-midnight">{meta.label}</h2>
              <p className="text-xs text-cos-slate">{firmName} &mdash; {meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-cos-lg px-3 py-1.5 text-lg font-bold",
              d.score < 0 ? "bg-cos-ember/10 text-cos-ember" : d.score > 0 ? "bg-cos-signal/10 text-cos-signal" : "bg-gray-100 text-gray-500"
            )}>
              {d.score}/{d.maxScore ?? 0}
            </div>
            <button onClick={onClose} className="rounded-cos-md p-1.5 hover:bg-cos-cloud-dim transition-colors">
              <X className="h-5 w-5 text-cos-slate" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Data Source Banner */}
          <div className="rounded-cos-lg bg-cos-cloud-dim p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cos-midnight flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-cos-warm" /> Data Source for This Dimension
            </h3>
            <p className="text-[11px] text-cos-slate leading-relaxed">
              The partner scorer reads from <SourceLabel source="pg" /> PostgreSQL <code className="bg-cos-midnight/5 px-1 rounded text-[10px]">enrichmentData</code> JSONB ({lineage.scorerUsed.source} layer).
              It does <strong>not</strong> query <SourceLabel source="neo4j" /> Neo4j directly.
              The knowledge graph has richer data that is currently invisible to scoring.
            </p>
          </div>

          {/* Dimension-specific content */}
          {dimension === "capabilityGapMatch" && <CapGapDetail d={d} lineage={lineage} />}
          {dimension === "reverseMatch" && <ReverseMatchDetail d={d} />}
          {dimension === "firmTypePreference" && <FirmTypeDetail d={d} />}
          {dimension === "geographyOverlap" && <GeographyDetail d={d} />}
          {dimension === "symbioticBonus" && <SymbioticDetail d={d} />}
          {dimension === "dealBreakerPenalty" && <DealBreakerDetail d={d} />}
          {dimension === "industryOverlap" && <IndustryDetail d={d} g={g} lineage={lineage} />}
          {dimension === "dataRichness" && <DataRichnessDetail d={d} g={g} lineage={lineage} />}
          {dimension === "preferenceCompleteness" && <PreferenceDetail d={d} />}

          {/* KG Coverage Warning */}
          {lineage.warnings.length > 0 && (
            <div className="rounded-cos-lg border border-cos-ember/30 bg-cos-ember/5 p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cos-ember flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Knowledge Graph Gaps
              </h3>
              <ul className="space-y-1">
                {lineage.warnings.map((w, i) => (
                  <li key={i} className="text-[11px] text-cos-ember/80 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">&#x2022;</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full KG Data for this firm */}
          <GraphInventory g={g} lineage={lineage} />
        </div>
      </div>
    </div>
  );
}

// ─── Dimension Detail Components ────────────────────────────

function CapGapDetail({ d, lineage }: { d: EvidenceTrace["dimensions"]["capabilityGapMatch"]; lineage: EvidenceTrace["dataLineage"] }) {
  return (
    <div className="space-y-4">
      {d.userGaps.length === 0 ? (
        <p className="text-xs text-cos-slate-light italic">No capability gaps specified. Default score of 10 applied.</p>
      ) : (
        <>
          <div>
            <h4 className="text-xs font-bold text-cos-midnight mb-2">Your Capability Gaps</h4>
            <div className="flex flex-wrap gap-1">{d.userGaps.map((g: string, i: number) => <Tag key={i} variant="warm">{g}</Tag>)}</div>
          </div>

          {/* Matched gaps */}
          {d.matches.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-cos-signal">Matched ({d.matches.length}/{d.userGaps.length})</h4>
              {d.matches.map((m: any, i: number) => (
                <div key={i} className="rounded-cos-lg border border-cos-signal/20 bg-cos-signal/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-cos-signal shrink-0" />
                    <span className="font-bold text-cos-midnight">&quot;{m.gap}&quot;</span>
                    <span className="text-cos-slate">&rarr; matched by</span>
                    <Tag variant="signal">{m.matchedBy}</Tag>
                    <span className="font-medium text-cos-midnight">{m.matchedValue}</span>
                    <SourceLabel source="pg" />
                  </div>

                  {/* Evidence chain from Neo4j */}
                  {(m.evidence.caseStudies.length > 0 || m.evidence.experts.length > 0 || m.evidence.graphSkill) && (
                    <div className="ml-6 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cos-slate-dim flex items-center gap-1">
                        <SourceLabel source="neo4j" /> Evidence chain
                      </p>
                      {m.evidence.graphSkill && (
                        <div className="text-[11px] text-cos-slate flex items-center gap-2">
                          <Zap className="h-3 w-3 text-cos-electric shrink-0" />
                          <span>
                            HAS_SKILL &rarr; <strong>{m.evidence.graphSkill.name}</strong>
                            {m.evidence.graphSkill.level && <span className="text-cos-slate-light"> ({m.evidence.graphSkill.level})</span>}
                            {m.evidence.graphSkill.parentSkill && <span className="text-cos-slate-light"> &rarr; parent: {m.evidence.graphSkill.parentSkill}</span>}
                            {" "}&mdash; {m.evidence.graphSkill.caseStudyCount} case studies, {m.evidence.graphSkill.expertCount} experts, confidence: {Math.round(m.evidence.graphSkill.confidence * 100)}%
                          </span>
                        </div>
                      )}
                      {m.evidence.caseStudies.map((cs: any) => (
                        <div key={cs.id} className="text-[11px] text-cos-slate flex items-center gap-2">
                          <FileText className="h-3 w-3 text-cos-slate-light shrink-0" />
                          <span>CaseStudy &rarr; DEMONSTRATES_SKILL: <strong>{cs.title}</strong></span>
                        </div>
                      ))}
                      {m.evidence.experts.map((e: any, ei: number) => (
                        <div key={ei} className="text-[11px] text-cos-slate flex items-center gap-2">
                          <User className="h-3 w-3 text-cos-slate-light shrink-0" />
                          <span>Expert &rarr; HAS_EXPERTISE: <strong>{e.name}</strong> {e.headline && <span className="text-cos-slate-light">({e.headline})</span>}</span>
                        </div>
                      ))}
                      {m.evidence.caseStudies.length === 0 && m.evidence.experts.length === 0 && !m.evidence.graphSkill && (
                        <p className="text-[10px] text-cos-ember italic">No Neo4j evidence found &mdash; match was purely from PG enrichmentData</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Unmatched gaps */}
          {d.unmatched.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-cos-ember mb-1">Unmatched ({d.unmatched.length})</h4>
              <div className="flex flex-wrap gap-1">{d.unmatched.map((gap: string, i: number) => <Tag key={i} variant="ember">{gap}</Tag>)}</div>
            </div>
          )}
        </>
      )}

      {/* Services/skills comparison */}
      <div className="rounded-cos-lg bg-cos-cloud-dim p-3 space-y-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-cos-midnight">What the scorer actually compared against</h4>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="font-medium text-cos-midnight flex items-center gap-1"><SourceLabel source="pg" /> Services ({lineage.scorerUsed.services.length})</p>
            <div className="flex flex-wrap gap-0.5 mt-1">{lineage.scorerUsed.services.map((s, i) => <Tag key={i}>{s}</Tag>)}</div>
            {lineage.scorerUsed.services.length === 0 && <p className="text-cos-slate-light italic mt-1">None</p>}
          </div>
          <div>
            <p className="font-medium text-cos-midnight flex items-center gap-1"><SourceLabel source="pg" /> Skills ({lineage.scorerUsed.skills.length})</p>
            <div className="flex flex-wrap gap-0.5 mt-1">{lineage.scorerUsed.skills.map((s, i) => <Tag key={i}>{s}</Tag>)}</div>
            {lineage.scorerUsed.skills.length === 0 && <p className="text-cos-slate-light italic mt-1">None</p>}
          </div>
        </div>
        {(lineage.notUsedByScorer.neo4jOnlySkills.length > 0 || lineage.notUsedByScorer.neo4jOnlyServices.length > 0) && (
          <div className="mt-2 pt-2 border-t border-cos-border/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cos-ember mb-1">In Neo4j but NOT used by scorer</p>
            <div className="grid grid-cols-2 gap-3">
              {lineage.notUsedByScorer.neo4jOnlyServices.length > 0 && (
                <div>
                  <p className="text-cos-slate-light flex items-center gap-1"><SourceLabel source="neo4j" /> Services ({lineage.notUsedByScorer.neo4jOnlyServices.length})</p>
                  <div className="flex flex-wrap gap-0.5 mt-1">{lineage.notUsedByScorer.neo4jOnlyServices.map((s, i) => <Tag key={i} variant="ember">{s}</Tag>)}</div>
                </div>
              )}
              {lineage.notUsedByScorer.neo4jOnlySkills.length > 0 && (
                <div>
                  <p className="text-cos-slate-light flex items-center gap-1"><SourceLabel source="neo4j" /> Skills ({lineage.notUsedByScorer.neo4jOnlySkills.length})</p>
                  <div className="flex flex-wrap gap-0.5 mt-1">{lineage.notUsedByScorer.neo4jOnlySkills.map((s, i) => <Tag key={i} variant="ember">{s}</Tag>)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReverseMatchDetail({ d }: { d: EvidenceTrace["dimensions"]["reverseMatch"] }) {
  return (
    <div className="space-y-3">
      {d.candidateGaps.length === 0 ? (
        <p className="text-xs text-cos-slate-light italic">Candidate has no stated capability gaps (default score: 5). They need to complete onboarding preferences for bidirectional matching.</p>
      ) : (
        <>
          <div>
            <h4 className="text-xs font-bold text-cos-midnight mb-2">Their Capability Gaps</h4>
            <div className="flex flex-wrap gap-1">{d.candidateGaps.map((g: string, i: number) => <Tag key={i} variant="warm">{g}</Tag>)}</div>
            <p className="text-[10px] text-cos-slate-light mt-1">Source: <SourceLabel source="pg" /> partnerPreferences.rawOnboardingData</p>
          </div>
          {d.matches.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-cos-signal">You Fill ({d.matches.length}/{d.candidateGaps.length})</h4>
              {d.matches.map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-cos-md bg-cos-signal/5 p-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-cos-signal shrink-0" />
                  <span>&quot;{m.gap}&quot;</span>
                  <span className="text-cos-slate">&rarr;</span>
                  <Tag variant="signal">Your {m.matchedBy}: {m.matchedValue}</Tag>
                  <SourceLabel source="pg" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FirmTypeDetail({ d }: { d: EvidenceTrace["dimensions"]["firmTypePreference"] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-2">
          <h4 className="text-xs font-bold text-cos-midnight">Forward Match (+15)</h4>
          <p className="text-[11px] text-cos-slate">Your preferred types include their category?</p>
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-cos-slate-light">Your prefs:</span>
              {d.userPreferredTypes.length > 0 ? d.userPreferredTypes.map((t: string, i: number) => <Tag key={i}>{t}</Tag>) : <span className="text-cos-slate-light italic">None set</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-cos-slate-light">Their category:</span>
              <Tag variant={d.forwardMatch ? "signal" : "default"}>{d.candidateCategory || "Unknown"}</Tag>
              <SourceLabel source="pg" />
            </div>
            {d.neo4jCategories?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-cos-slate-light">Neo4j IN_CATEGORY:</span>
                {d.neo4jCategories.map((c: string, i: number) => <Tag key={i} variant="electric">{c}</Tag>)}
                <SourceLabel source="neo4j" />
              </div>
            )}
          </div>
          <div className={cn("text-xs font-bold", d.forwardMatch ? "text-cos-signal" : "text-cos-slate-light")}>
            {d.forwardMatch ? "MATCH +15" : "No match +0"}
          </div>
        </div>
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-2">
          <h4 className="text-xs font-bold text-cos-midnight">Reverse Match (+5)</h4>
          <p className="text-[11px] text-cos-slate">Their preferred types include your category?</p>
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-cos-slate-light">Their prefs:</span>
              {d.candidatePreferredTypes.length > 0 ? d.candidatePreferredTypes.map((t: string, i: number) => <Tag key={i}>{t}</Tag>) : <span className="text-cos-slate-light italic">None set</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-cos-slate-light">Your category:</span>
              <Tag variant={d.reverseMatch ? "signal" : "default"}>{d.sourceCategory || "Unknown"}</Tag>
            </div>
          </div>
          <div className={cn("text-xs font-bold", d.reverseMatch ? "text-cos-signal" : "text-cos-slate-light")}>
            {d.reverseMatch ? "MATCH +5" : "No match +0"}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-cos-slate-light">Source: category comes from <SourceLabel source="pg" /> enrichmentData.confirmed.firmCategory or classification.categories[0]. Neo4j IN_CATEGORY edges are NOT used by the scorer.</p>
    </div>
  );
}

function GeographyDetail({ d }: { d: EvidenceTrace["dimensions"]["geographyOverlap"] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-1">
          <h4 className="font-bold text-cos-midnight">Your Preference</h4>
          <Tag variant={d.userPreference ? "warm" : "default"}>{d.userPreference || "None set (default +3)"}</Tag>
          <SourceLabel source="pg" />
        </div>
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-1">
          <h4 className="font-bold text-cos-midnight">Their Markets <SourceLabel source="pg" /></h4>
          <div className="flex flex-wrap gap-1">
            {d.candidateMarkets.length > 0 ? d.candidateMarkets.map((m: string, i: number) => <Tag key={i} variant={d.matched ? "signal" : "default"}>{m}</Tag>) : <span className="text-cos-slate-light italic">None in PG</span>}
          </div>
          {d.neo4jMarkets?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-cos-border/50">
              <p className="text-[10px] font-bold text-cos-slate-dim mb-1">Neo4j OPERATES_IN <SourceLabel source="neo4j" /></p>
              <div className="flex flex-wrap gap-1">{d.neo4jMarkets.map((m: string, i: number) => <Tag key={i} variant="electric">{m}</Tag>)}</div>
            </div>
          )}
        </div>
      </div>
      <div className={cn("text-xs font-bold text-center py-2 rounded-cos-lg", d.matched ? "bg-cos-signal/10 text-cos-signal" : "bg-gray-50 text-cos-slate-light")}>
        {d.matched ? `MATCH +10` : d.userPreference ? "No match +0" : "No preference +3 (default)"}
      </div>
    </div>
  );
}

function SymbioticDetail({ d }: { d: EvidenceTrace["dimensions"]["symbioticBonus"] }) {
  return (
    <div className="space-y-3">
      {d.relationship ? (
        <div className="rounded-cos-lg border border-cos-signal/30 bg-cos-signal/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-cos-midnight">
            <Tag variant="signal">{d.relationship.typeA}</Tag>
            <span>&harr;</span>
            <Tag variant="signal">{d.relationship.typeB}</Tag>
          </div>
          <p className="text-xs text-cos-slate">{d.relationship.nature}</p>
          <SourceLabel source="csv" />
          <p className="text-[10px] text-cos-slate-light">Source: data/firm-relationships.csv (346 rows). Also exists as PARTNERS_WITH edges in Neo4j but scorer reads CSV directly.</p>
        </div>
      ) : (
        <p className="text-xs text-cos-slate-light italic">No symbiotic relationship found between your firm type and theirs in firm-relationships.csv.</p>
      )}
    </div>
  );
}

function DealBreakerDetail({ d }: { d: EvidenceTrace["dimensions"]["dealBreakerPenalty"] }) {
  return (
    <div className="space-y-3">
      {d.triggered ? (
        <div className="rounded-cos-lg border border-cos-ember/30 bg-cos-ember/5 p-4 space-y-2">
          <p className="text-sm font-bold text-cos-ember">TRIGGERED: -40 penalty</p>
          <p className="text-xs text-cos-slate">
            Deal breaker &quot;{d.userDealBreaker}&quot; was found in the candidate&apos;s <strong>{d.matchedIn}</strong>.
          </p>
          <p className="text-[10px] text-cos-slate-light">Source: substring match against <SourceLabel source="pg" /> enrichmentData category, services, and description fields.</p>
        </div>
      ) : (
        <div className="text-xs text-cos-slate space-y-1">
          <p>Deal breaker: &quot;{d.userDealBreaker || "None set"}&quot;</p>
          {d.userDealBreaker && <p className="text-cos-signal font-medium">Not triggered &mdash; no penalty applied.</p>}
        </div>
      )}
    </div>
  );
}

function IndustryDetail({ d, g, lineage }: { d: EvidenceTrace["dimensions"]["industryOverlap"]; g: EvidenceTrace["candidateGraph"]; lineage: EvidenceTrace["dataLineage"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-2">
          <h4 className="text-xs font-bold text-cos-midnight">Your Industries</h4>
          <div className="flex flex-wrap gap-1">
            {d.userIndustries.length > 0 ? d.userIndustries.map((ind: string, i: number) => (
              <Tag key={i} variant={d.matched.includes(ind) ? "signal" : "default"}>{ind}</Tag>
            )) : <span className="text-xs text-cos-slate-light italic">None</span>}
          </div>
          <SourceLabel source="pg" />
        </div>
        <div className="rounded-cos-lg border border-cos-border p-3 space-y-2">
          <h4 className="text-xs font-bold text-cos-midnight">Their Industries (Scorer Used)</h4>
          <div className="flex flex-wrap gap-1">
            {d.scorerUsedIndustries?.length > 0 ? d.scorerUsedIndustries.map((ind: string, i: number) => (
              <Tag key={i} variant={d.matched.some((m: string) => m.toLowerCase().includes(ind.toLowerCase()) || ind.toLowerCase().includes(m.toLowerCase())) ? "signal" : "default"}>{ind}</Tag>
            )) : <span className="text-xs text-cos-slate-light italic">None in PG</span>}
          </div>
          <SourceLabel source="pg" />
        </div>
      </div>

      {/* Neo4j industry evidence */}
      {g.industries.length > 0 && (
        <div className="rounded-cos-lg bg-cos-cloud-dim p-3 space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-cos-midnight flex items-center gap-1">
            <SourceLabel source="neo4j" /> Full Industry Graph ({g.industries.length} nodes)
          </h4>
          <div className="space-y-1.5">
            {g.industries.map((ind, i) => (
              <div key={i} className="text-[11px] text-cos-slate flex items-start gap-2">
                <Factory className="h-3 w-3 text-cos-slate-light mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-cos-midnight">{ind.name}</span>
                  {ind.level && <span className="text-cos-slate-light"> ({ind.level})</span>}
                  <span className="ml-1 text-[10px] text-cos-slate-light">
                    via {ind.source === "serves_industry" ? "SERVES_INDUSTRY edge" : ind.source === "case_study" ? `IN_INDUSTRY (${ind.fromCaseStudies.length} case studies)` : "PG classification"}
                    {ind.confidence != null && ` · confidence: ${Math.round(ind.confidence * 100)}%`}
                  </span>
                  {ind.fromCaseStudies.length > 0 && (
                    <div className="ml-4 mt-0.5 text-[10px] text-cos-slate-light">
                      Case studies: {ind.fromCaseStudies.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {lineage.notUsedByScorer.neo4jOnlyIndustries.length > 0 && (
            <div className="mt-2 pt-2 border-t border-cos-border/50">
              <p className="text-[10px] font-bold text-cos-ember">Industries in Neo4j but NOT in PG enrichmentData:</p>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {lineage.notUsedByScorer.neo4jOnlyIndustries.map((ind, i) => <Tag key={i} variant="ember">{ind}</Tag>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataRichnessDetail({ d, g, lineage }: { d: EvidenceTrace["dimensions"]["dataRichness"]; g: EvidenceTrace["candidateGraph"]; lineage: EvidenceTrace["dataLineage"] }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-cos-slate">Score = min(services + skills + industries, 5). Only counts data from <SourceLabel source="pg" /> enrichmentData.</p>

      <div className="rounded-cos-lg border border-cos-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-cos-cloud-dim">
              <th className="text-left px-3 py-2 font-bold text-cos-midnight">Data Type</th>
              <th className="text-center px-3 py-2 font-bold text-cos-midnight"><SourceLabel source="pg" /> Scorer Sees</th>
              <th className="text-center px-3 py-2 font-bold text-cos-midnight"><SourceLabel source="neo4j" /> Graph Has</th>
              <th className="text-center px-3 py-2 font-bold text-cos-ember">Delta</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["Services", d.serviceCount, d.neo4jServiceCount],
              ["Skills", d.skillCount, d.neo4jSkillCount],
              ["Industries", d.industryCount, d.neo4jIndustryCount],
              ["Case Studies", "—", d.neo4jCaseStudyCount],
              ["Experts", "—", d.neo4jExpertCount],
              ["Markets", lineage.scorerUsed.markets.length, g.markets.length],
              ["Clients", "—", g.clients.length],
              ["PREFERS edges", "—", lineage.neo4jHas.prefEdges],
            ] as [string, string | number, number][]).map(([label, pg, neo4j]) => {
              const delta = typeof pg === "number" ? neo4j - pg : null;
              return (
                <tr key={label} className="border-t border-cos-border/50">
                  <td className="px-3 py-1.5 text-cos-midnight">{label}</td>
                  <td className="px-3 py-1.5 text-center">{pg}</td>
                  <td className="px-3 py-1.5 text-center font-medium">{neo4j}</td>
                  <td className={cn("px-3 py-1.5 text-center font-bold", delta && delta > 0 ? "text-cos-ember" : "text-cos-slate-light")}>
                    {delta != null ? (delta > 0 ? `+${delta} unused` : delta === 0 ? "=" : delta) : "N/A"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-cos-slate-light">
        &quot;Delta&quot; shows data in Neo4j that the scorer cannot see. Case studies, experts, clients, and PREFERS edges
        are entirely invisible to partner-scoring.ts &mdash; it only reads the enrichmentData JSONB blob.
      </p>
    </div>
  );
}

function PreferenceDetail({ d }: { d: EvidenceTrace["dimensions"]["preferenceCompleteness"] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className={cn("rounded-cos-lg border p-3", d.hasCapGaps ? "border-cos-signal/30 bg-cos-signal/5" : "border-cos-border")}>
          <p className={cn("font-bold", d.hasCapGaps ? "text-cos-signal" : "text-cos-slate-light")}>
            {d.hasCapGaps ? "Has capability gaps" : "No capability gaps set"}
          </p>
          <SourceLabel source="pg" />
        </div>
        <div className={cn("rounded-cos-lg border p-3", d.hasPrefTypes ? "border-cos-signal/30 bg-cos-signal/5" : "border-cos-border")}>
          <p className={cn("font-bold", d.hasPrefTypes ? "text-cos-signal" : "text-cos-slate-light")}>
            {d.hasPrefTypes ? "Has partner types" : "No partner types set"}
          </p>
          <SourceLabel source="pg" />
        </div>
      </div>

      {d.prefEdges.length > 0 && (
        <div className="rounded-cos-lg bg-cos-cloud-dim p-3 space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-cos-midnight flex items-center gap-1">
            <SourceLabel source="neo4j" /> PREFERS Edges ({d.prefEdges.length})
          </h4>
          <div className="space-y-1">
            {d.prefEdges.map((pe: any, i: number) => (
              <div key={i} className="text-[11px] flex items-center gap-2">
                <Tag variant="electric">{pe.dimension}</Tag>
                <span className="text-cos-slate">&rarr;</span>
                <Tag variant="warm">{pe.target}</Tag>
                <span className="text-[10px] text-cos-slate-light">(weight: {pe.weight})</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-cos-slate-light">Note: PREFERS edges are NOT used by partner-scoring.ts. They are only used by structured-filter.ts for bidirectional matching.</p>
        </div>
      )}
    </div>
  );
}

// ─── Graph Inventory ────────────────────────────────────────

function GraphInventory({ g, lineage }: { g: EvidenceTrace["candidateGraph"]; lineage: EvidenceTrace["dataLineage"] }) {
  const [open, setOpen] = useState(false);
  const totalNodes = g.skills.length + g.services.length + g.caseStudies.length + g.experts.length + g.industries.length + g.markets.length + g.clients.length + g.categories.length;

  return (
    <div className="rounded-cos-lg border border-cos-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-cos-cloud-dim/50 transition-colors">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-cos-slate-light" /> : <ChevronRight className="h-3.5 w-3.5 text-cos-slate-light" />}
        <Database className="h-4 w-4 text-cos-electric" />
        <span className="flex-1 text-xs font-bold text-cos-midnight">Full Knowledge Graph Inventory</span>
        <span className="text-[10px] text-cos-slate-light">{totalNodes} nodes</span>
        <SourceLabel source="neo4j" />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 text-[11px] border-t border-cos-border/50">
          {/* Skills */}
          {g.skills.length > 0 && (
            <div>
              <p className="font-bold text-cos-midnight mb-1.5">HAS_SKILL edges ({g.skills.length})</p>
              <div className="space-y-1">
                {g.skills.map((sk, i) => {
                  const inPg = lineage.scorerUsed.skills.some((ps) => ps.toLowerCase().includes(sk.name.toLowerCase()) || sk.name.toLowerCase().includes(ps.toLowerCase()));
                  return (
                    <div key={i} className="flex items-center gap-2 text-cos-slate">
                      <Zap className="h-3 w-3 shrink-0 text-cos-electric" />
                      <span className="font-medium text-cos-midnight">{sk.name}</span>
                      {sk.level && <span className="text-cos-slate-light">({sk.level})</span>}
                      {sk.parentSkill && <span className="text-cos-slate-light">&rarr; {sk.parentSkill}</span>}
                      <span className="text-cos-slate-light">
                        {sk.caseStudyCount} CS, {sk.expertCount} exp, conf: {Math.round(sk.confidence * 100)}%
                      </span>
                      {inPg ? <Tag variant="signal">in PG</Tag> : <Tag variant="ember">neo4j only</Tag>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Services */}
          {g.services.length > 0 && (
            <div>
              <p className="font-bold text-cos-midnight mb-1.5">OFFERS_SERVICE edges ({g.services.length})</p>
              <div className="space-y-1">
                {g.services.map((svc, i) => {
                  const inPg = lineage.scorerUsed.services.some((ps) => ps.toLowerCase().includes(svc.name.toLowerCase()) || svc.name.toLowerCase().includes(ps.toLowerCase()));
                  return (
                    <div key={i} className="flex items-center gap-2 text-cos-slate">
                      <Settings className="h-3 w-3 shrink-0 text-cos-warm" />
                      <span className="font-medium text-cos-midnight">{svc.name}</span>
                      <span className="text-cos-slate-light">
                        evidence: {svc.evidenceCount}, {svc.caseStudyCount} CS, {svc.expertCount} exp, {svc.websiteMentionCount} web
                      </span>
                      {inPg ? <Tag variant="signal">in PG</Tag> : <Tag variant="ember">neo4j only</Tag>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Case Studies */}
          {g.caseStudies.length > 0 && (
            <div>
              <p className="font-bold text-cos-midnight mb-1.5">Case Studies ({g.caseStudies.length}) <Tag variant="ember">not used by scorer</Tag></p>
              <div className="space-y-2">
                {g.caseStudies.map((cs, i) => (
                  <div key={i} className="rounded-cos-md bg-cos-cloud-dim/50 p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-cos-slate-light shrink-0" />
                      <span className="font-medium text-cos-midnight">{cs.title}</span>
                    </div>
                    {cs.skills.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">DEMONSTRATES_SKILL:</span>
                        {cs.skills.map((sk, si) => <Tag key={si}>{sk}</Tag>)}
                      </div>
                    )}
                    {cs.industries.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">IN_INDUSTRY:</span>
                        {cs.industries.map((ind, ii) => <Tag key={ii}>{ind}</Tag>)}
                      </div>
                    )}
                    {cs.clients.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">FOR_CLIENT:</span>
                        {cs.clients.map((cl, ci) => <Tag key={ci}>{cl}</Tag>)}
                      </div>
                    )}
                    {cs.outcomes.length > 0 && (
                      <div className="ml-5 text-cos-slate-light">
                        Outcomes: {cs.outcomes.join("; ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Experts */}
          {g.experts.length > 0 && (
            <div>
              <p className="font-bold text-cos-midnight mb-1.5">Experts ({g.experts.length}) <Tag variant="ember">not used by scorer</Tag></p>
              <div className="space-y-2">
                {g.experts.map((exp, i) => (
                  <div key={i} className="rounded-cos-md bg-cos-cloud-dim/50 p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-cos-slate-light shrink-0" />
                      <span className="font-medium text-cos-midnight">{exp.name}</span>
                      {exp.headline && <span className="text-cos-slate-light">— {exp.headline}</span>}
                    </div>
                    {exp.skills.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">HAS_SKILL:</span>
                        {exp.skills.map((sk, si) => <Tag key={si}>{sk}</Tag>)}
                      </div>
                    )}
                    {exp.industries.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">SERVES_INDUSTRY:</span>
                        {exp.industries.map((ind, ii) => <Tag key={ii}>{ind}</Tag>)}
                      </div>
                    )}
                    {exp.previousCompanies.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-0.5">
                        <span className="text-cos-slate-light">WORKED_AT:</span>
                        {exp.previousCompanies.map((c, ci) => <Tag key={ci}>{c}</Tag>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other nodes */}
          <div className="grid grid-cols-3 gap-3">
            {g.categories.length > 0 && (
              <div>
                <p className="font-bold text-cos-midnight mb-1">IN_CATEGORY ({g.categories.length})</p>
                <div className="flex flex-wrap gap-0.5">{g.categories.map((c, i) => <Tag key={i}>{c}</Tag>)}</div>
              </div>
            )}
            {g.markets.length > 0 && (
              <div>
                <p className="font-bold text-cos-midnight mb-1">OPERATES_IN ({g.markets.length})</p>
                <div className="flex flex-wrap gap-0.5">{g.markets.map((m, i) => <Tag key={i}>{m}</Tag>)}</div>
              </div>
            )}
            {g.clients.length > 0 && (
              <div>
                <p className="font-bold text-cos-midnight mb-1">HAS_CLIENT ({g.clients.length})</p>
                <div className="flex flex-wrap gap-0.5">{g.clients.map((c, i) => <Tag key={i}>{c}</Tag>)}</div>
              </div>
            )}
          </div>

          {totalNodes === 0 && (
            <div className="rounded-cos-lg bg-cos-ember/5 border border-cos-ember/20 p-3">
              <p className="text-xs text-cos-ember font-bold">ZERO data in Neo4j for this firm.</p>
              <p className="text-[10px] text-cos-ember/80 mt-1">All scoring is from PG enrichmentData JSONB blob. The knowledge graph is not being leveraged at all.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Match Card ─────────────────────────────────────────────

function MatchCard({
  match,
  sourceFirmId,
  preferences,
}: {
  match: PartnerMatch;
  sourceFirmId: string;
  preferences: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceTrace | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [modalDimension, setModalDimension] = useState<DimensionKey | null>(null);

  const fetchEvidence = useCallback(async () => {
    if (evidence || evidenceLoading) return evidence;
    setEvidenceLoading(true);
    try {
      const res = await fetch("/api/admin/partner-matching/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFirmId,
          candidateFirmId: match.firmId,
          preferences,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvidence(data);
        return data;
      }
    } catch { /* ignore */ }
    finally { setEvidenceLoading(false); }
    return null;
  }, [evidence, evidenceLoading, sourceFirmId, match.firmId, preferences]);

  const openDimensionModal = async (dim: DimensionKey) => {
    const ev = evidence ?? await fetchEvidence();
    if (ev) setModalDimension(dim);
  };

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

      {/* Score Breakdown — click any bar to open deep evidence modal */}
      {match.scoreBreakdown && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim hover:text-cos-electric"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Score Breakdown
            {expanded && <span className="font-normal normal-case tracking-normal text-cos-slate-light ml-1">— click any row for deep evidence</span>}
          </button>
          {expanded && (
            <div className="mt-2 space-y-0.5 rounded-cos-lg bg-cos-cloud-dim p-3">
              {evidenceLoading && (
                <div className="flex items-center gap-1.5 text-[10px] text-cos-electric pb-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading evidence...
                </div>
              )}
              <ScoreBar label="Gap Match" value={match.scoreBreakdown.capabilityGapMatch} max={30} onClick={() => openDimensionModal("capabilityGapMatch")} />
              <ScoreBar label="Reverse Match" value={match.scoreBreakdown.reverseMatch} max={20} onClick={() => openDimensionModal("reverseMatch")} />
              <ScoreBar label="Firm Type" value={match.scoreBreakdown.firmTypePreference} max={20} onClick={() => openDimensionModal("firmTypePreference")} />
              <ScoreBar label="Geography" value={match.scoreBreakdown.geographyOverlap} max={10} onClick={() => openDimensionModal("geographyOverlap")} />
              <ScoreBar label="Symbiotic" value={match.scoreBreakdown.symbioticBonus} max={10} onClick={() => openDimensionModal("symbioticBonus")} />
              {match.scoreBreakdown.dealBreakerPenalty < 0 && (
                <ScoreBar label="Deal Breaker" value={match.scoreBreakdown.dealBreakerPenalty} max={40} onClick={() => openDimensionModal("dealBreakerPenalty")} />
              )}
              <ScoreBar label="Industry" value={match.scoreBreakdown.industryOverlap} max={5} onClick={() => openDimensionModal("industryOverlap")} />
              <ScoreBar label="Data Richness" value={match.scoreBreakdown.dataRichness} max={5} onClick={() => openDimensionModal("dataRichness")} />
              <ScoreBar label="Has Prefs" value={match.scoreBreakdown.preferenceCompleteness} max={10} onClick={() => openDimensionModal("preferenceCompleteness")} />
              {match.scoreBreakdown.evidenceDepth > 0 && (
                <ScoreBar label="Evidence" value={match.scoreBreakdown.evidenceDepth} max={5} onClick={() => openDimensionModal("dataRichness")} />
              )}
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

      {/* Deep Evidence Modal */}
      {modalDimension && evidence && (
        <DeepEvidenceModal
          evidence={evidence}
          firmName={match.firmName}
          dimension={modalDimension}
          onClose={() => setModalDimension(null)}
        />
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

  // Load firms list from admin firms API (platform source = PostgreSQL service_firms)
  useEffect(() => {
    // Load all pages of platform firms (API caps at 100/page)
    async function loadAllFirms() {
      const all: FirmOption[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`/api/admin/firms?source=platform&limit=100&page=${page}`);
        const data = await res.json();
        const rawFirms = data.firms ?? [];
        for (const f of rawFirms) {
          if (f.id && f.name) {
            all.push({ id: f.id as string, name: f.name as string, firmType: (f.firmType as string) ?? null });
          }
        }
        const total = data.total ?? 0;
        hasMore = page * 100 < total;
        page++;
        if (page > 20) break; // Safety cap
      }
      all.sort((a, b) => a.name.localeCompare(b.name));
      setFirms(all);
    }
    loadAllFirms().catch(console.error);
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPhilosophy(PHILOSOPHY_OPTIONS[Math.floor(Math.random() * PHILOSOPHY_OPTIONS.length)]);
                        setCapGaps(pickRandom(FIRM_CATEGORIES, 2 + Math.floor(Math.random() * 2)));
                        setPartnerTypes(pickRandom(FIRM_CATEGORIES, 2 + Math.floor(Math.random() * 2)));
                        setDealBreaker(DEAL_BREAKER_OPTIONS[Math.floor(Math.random() * DEAL_BREAKER_OPTIONS.length)]);
                        setGeoPreference(GEOGRAPHY_OPTIONS[Math.floor(Math.random() * GEOGRAPHY_OPTIONS.length)]);
                      }}
                      className="text-[10px] text-cos-warm hover:underline flex items-center gap-1"
                      title="Randomize all preferences"
                    >
                      <Shuffle className="h-2.5 w-2.5" /> Randomize
                    </button>
                    {result?.preferencesUsed && (
                      <button onClick={() => resetPrefsToActual(result.preferencesUsed)} className="text-[10px] text-cos-electric hover:underline flex items-center gap-1">
                        <RotateCcw className="h-2.5 w-2.5" /> Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Philosophy</label>
                  <select
                    value={philosophy}
                    onChange={(e) => setPhilosophy(e.target.value)}
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {PHILOSOPHY_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)} — {o === "breadth" ? "wider services" : o === "depth" ? "deeper expertise" : "new referrals"}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Capability Gaps</label>
                  <MultiSelect
                    selected={capGaps}
                    options={FIRM_CATEGORIES}
                    onChange={setCapGaps}
                    placeholder="Search categories..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Partner Types</label>
                  <MultiSelect
                    selected={partnerTypes}
                    options={FIRM_CATEGORIES}
                    onChange={setPartnerTypes}
                    placeholder="Search firm types..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Deal Breaker</label>
                  <select
                    value={dealBreaker}
                    onChange={(e) => setDealBreaker(e.target.value)}
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
                  >
                    {DEAL_BREAKER_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">Geography</label>
                  <select
                    value={geoPreference}
                    onChange={(e) => setGeoPreference(e.target.value)}
                    className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
                  >
                    {GEOGRAPHY_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
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
                      <MatchCard key={m.firmId} match={m} sourceFirmId={result.sourceFirm.id} preferences={result.preferencesUsed} />
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
