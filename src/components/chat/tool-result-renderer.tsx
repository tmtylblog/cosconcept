"use client";

import { useState, useEffect } from "react";
import { Loader2, Search, UserCheck, FileText, Building2, User, Check, AlertCircle, Globe, TrendingUp, Users, Target, Handshake } from "lucide-react";
import { FirmResultList, FirmDetailCard } from "./firm-result-card";
import { ExpertResultList } from "./expert-result-card";
import { CaseStudyResultList } from "./case-study-card";

// ─── Tool Invocation Types ──────────────────────────────────
// The Vercel AI SDK UIMessage parts include tool-invocation parts
// with state: "call" | "partial-call" | "result"

interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocationId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "call" | "partial-call" | "result";
  result?: unknown;
}

// ─── Loading Indicator ──────────────────────────────────────

const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  search_partners: {
    label: "Searching for partner firms...",
    icon: <Search className="h-3.5 w-3.5" />,
  },
  search_experts: {
    label: "Looking for experts...",
    icon: <UserCheck className="h-3.5 w-3.5" />,
  },
  search_case_studies: {
    label: "Searching case studies...",
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  lookup_firm: {
    label: "Looking up firm details...",
    icon: <Building2 className="h-3.5 w-3.5" />,
  },
  get_my_profile: {
    label: "Loading your profile...",
    icon: <User className="h-3.5 w-3.5" />,
  },
  update_profile: {
    label: "Saving to your profile...",
    icon: <UserCheck className="h-3.5 w-3.5" />,
  },
  research_client: {
    label: "Researching company...",
    icon: <Globe className="h-3.5 w-3.5" />,
  },
  analyze_client_overlap: {
    label: "Analyzing client overlap...",
    icon: <Handshake className="h-3.5 w-3.5" />,
  },
};

function ToolLoadingIndicator({ toolName }: { toolName: string }) {
  const info = TOOL_LABELS[toolName] ?? {
    label: "Working on it...",
    icon: <Search className="h-3.5 w-3.5" />,
  };

  return (
    <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/5 px-3 py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
      <span className="flex items-center gap-1.5 text-xs font-medium text-cos-electric">
        {info.icon}
        {info.label}
      </span>
    </div>
  );
}

// ─── Research Progress Indicator ──────────────────────────

const RESEARCH_PHASES = [
  { label: "Checking existing research...", icon: <Search className="h-3.5 w-3.5" />, duration: 2000 },
  { label: "Gathering company data...", icon: <Globe className="h-3.5 w-3.5" />, duration: 8000 },
  { label: "Scraping website for insights...", icon: <FileText className="h-3.5 w-3.5" />, duration: 15000 },
  { label: "Generating strategic intelligence...", icon: <TrendingUp className="h-3.5 w-3.5" />, duration: 10000 },
  { label: "Assessing your fit...", icon: <Target className="h-3.5 w-3.5" />, duration: 8000 },
  { label: "Finding gap-filling partners...", icon: <Users className="h-3.5 w-3.5" />, duration: 5000 },
];

function ResearchProgressIndicator({ companyName }: { companyName: string }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let totalDuration = 0;
    for (let i = 0; i < RESEARCH_PHASES.length; i++) {
      totalDuration += RESEARCH_PHASES[i].duration;
      if (elapsed < totalDuration) {
        setPhaseIndex(i);
        return;
      }
    }
    setPhaseIndex(RESEARCH_PHASES.length - 1);
  }, [elapsed]);

  const phase = RESEARCH_PHASES[phaseIndex];
  const totalEstimate = RESEARCH_PHASES.reduce((sum, p) => sum + p.duration, 0);
  const progress = Math.min(95, Math.round((elapsed / totalEstimate) * 100));

  return (
    <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-cos-electric" />
        <span className="text-sm font-semibold text-cos-electric">
          Researching {companyName || "company"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-cos-full bg-cos-cloud-dim">
        <div
          className="h-full rounded-cos-full bg-cos-electric transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current phase */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-electric" />
          <span className="flex items-center gap-1.5 text-xs font-medium text-cos-electric">
            {phase.icon}
            {phase.label}
          </span>
        </div>
        <span className="text-[10px] text-cos-slate-dim">
          {Math.floor(elapsed / 1000)}s
        </span>
      </div>

      {/* Phase checklist */}
      <div className="space-y-1">
        {RESEARCH_PHASES.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i < phaseIndex ? (
              <Check className="h-3 w-3 text-cos-signal" />
            ) : i === phaseIndex ? (
              <Loader2 className="h-3 w-3 animate-spin text-cos-electric" />
            ) : (
              <div className="h-3 w-3 rounded-full border border-cos-border" />
            )}
            <span className={`text-[10px] ${i < phaseIndex ? "text-cos-signal" : i === phaseIndex ? "text-cos-electric font-medium" : "text-cos-slate-light"}`}>
              {p.label.replace("...", "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Client Research Result Card ──────────────────────────

function ClientResearchResultCard({ result }: { result: Record<string, unknown> }) {
  // Domain confirmation needed
  if (result.needsDomain) {
    const name = (result.companyName as string) ?? "that company";
    return (
      <div className="flex items-center gap-2 rounded-cos-lg border border-cos-warm/20 bg-cos-warm/5 px-3 py-2">
        <Globe className="h-3.5 w-3.5 text-cos-warm" />
        <span className="text-xs font-medium text-cos-warm">
          I need a website domain to research {name} — e.g., {name.toLowerCase().replace(/\s+/g, "")}.com
        </span>
      </div>
    );
  }

  if (!result.success) return null;

  const client = result.client as Record<string, unknown> | undefined;
  const fit = result.fitAssessment as Record<string, unknown> | undefined;
  if (!client) return null;

  const score = (fit?.overallScore as number) ?? 0;
  const scoreColor = score >= 70 ? "text-cos-signal" : score >= 40 ? "text-cos-warm" : "text-cos-ember";
  const scoreBg = score >= 70 ? "bg-cos-signal" : score >= 40 ? "bg-cos-warm" : "bg-cos-ember";

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <Building2 className="h-4.5 w-4.5 text-cos-electric" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-cos-midnight">{client.name as string}</h4>
            <p className="text-[10px] text-cos-slate-dim">
              {client.industry as string}{(client.location as string) ? ` · ${client.location as string}` : ""}
              {(client.employeeCount as number) ? ` · ${(client.employeeCount as number).toLocaleString()} employees` : ""}
            </p>
          </div>
        </div>
        {fit && (
          <div className="text-right">
            <div className={`text-lg font-bold ${scoreColor}`}>{score}</div>
            <div className="text-[9px] uppercase tracking-wider text-cos-slate-dim">Fit Score</div>
          </div>
        )}
      </div>

      {/* Fit score bar */}
      {fit && (
        <div className="h-1.5 overflow-hidden rounded-cos-full bg-cos-cloud-dim">
          <div className={`h-full rounded-cos-full ${scoreBg} transition-all duration-700`} style={{ width: `${score}%` }} />
        </div>
      )}

      {/* Executive summary */}
      {client.executiveSummary && (
        <p className="text-xs leading-relaxed text-cos-slate">
          {(client.executiveSummary as string).slice(0, 200)}
          {(client.executiveSummary as string).length > 200 ? "..." : ""}
        </p>
      )}

      {/* Highlights */}
      {client.interestingHighlights && (client.interestingHighlights as { title: string; description: string }[]).length > 0 && (
        <div className="space-y-1">
          {(client.interestingHighlights as { title: string; description: string }[]).slice(0, 3).map((h, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <TrendingUp className="h-3 w-3 mt-0.5 text-cos-electric shrink-0" />
              <span className="text-[10px] text-cos-slate"><strong className="text-cos-midnight">{h.title}:</strong> {h.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Overlap Result Card ───────────────────────────

function ClientOverlapResultCard({ result }: { result: Record<string, unknown> }) {
  if (!result.success) return null;

  const partner = result.partner as Record<string, unknown> | undefined;
  const analysis = result.clientAnalysis as Record<string, unknown> | undefined;
  if (!partner || !analysis) return null;

  const relevantClients = (analysis.relevantClients as { clientName: string; relevanceScore: number; collaborationIdea: string }[]) ?? [];

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-cos-electric" />
        <h4 className="text-sm font-semibold text-cos-midnight">
          Client Overlap with {partner.name as string}
        </h4>
        <span className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
          {analysis.totalClients as number} clients analyzed
        </span>
      </div>

      {relevantClients.length > 0 && (
        <div className="space-y-2">
          {relevantClients.slice(0, 5).map((client, i) => (
            <div key={i} className="flex items-start gap-2 rounded-cos-lg border border-cos-border/50 bg-white/60 p-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/5 text-[9px] font-bold text-cos-slate">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-cos-midnight">{client.clientName}</p>
                <p className="text-[10px] text-cos-slate">{client.collaborationIdea}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile Save Confirmation ─────────────────────────────

function ProfileSaveConfirmation({ success }: { success: boolean }) {
  if (success) {
    return (
      <div className="flex items-center gap-1.5 rounded-cos-lg border border-cos-signal/20 bg-cos-signal/5 px-3 py-1.5">
        <Check className="h-3.5 w-3.5 text-cos-signal" />
        <span className="text-xs font-medium text-cos-signal">
          Saved to your partner profile
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-cos-lg border border-cos-ember/20 bg-cos-ember/5 px-3 py-1.5">
      <AlertCircle className="h-3.5 w-3.5 text-cos-ember" />
      <span className="text-xs font-medium text-cos-ember">
        Failed to save — please try again
      </span>
    </div>
  );
}

// ─── Main Dispatcher ────────────────────────────────────────

export function ToolResultRenderer({
  toolInvocation,
}: {
  toolInvocation: ToolInvocationPart;
}) {
  // Show loading state while tool is executing
  if (toolInvocation.state !== "result") {
    // Special phased progress for research_client
    if (toolInvocation.toolName === "research_client") {
      const companyName = (toolInvocation.args?.clientDomainOrName as string) ?? "";
      return <ResearchProgressIndicator companyName={companyName} />;
    }
    return <ToolLoadingIndicator toolName={toolInvocation.toolName} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = toolInvocation.result as any;
  if (!result) return null;

  switch (toolInvocation.toolName) {
    case "search_partners":
      return <FirmResultList results={result.candidates ?? []} />;

    case "search_experts":
      return <ExpertResultList results={result} />;

    case "search_case_studies":
      return <CaseStudyResultList results={result} />;

    case "lookup_firm":
      return <FirmDetailCard firm={result} />;

    case "get_my_profile":
      // For the user's own profile, reuse the firm detail card
      return <FirmDetailCard firm={result} />;

    case "update_profile":
      return <ProfileSaveConfirmation success={result.success} />;

    case "research_client":
      return <ClientResearchResultCard result={result} />;

    case "analyze_client_overlap":
      return <ClientOverlapResultCard result={result} />;

    case "request_login":
      // Login modal is handled by the ChatPanel — don't render anything here
      return null;

    default:
      // Unknown tool — don't render anything, let the text handle it
      return null;
  }
}
