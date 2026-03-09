"use client";

import { Loader2, Search, UserCheck, FileText, Building2, User, Check, AlertCircle } from "lucide-react";
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

    case "request_login":
      // Login modal is handled by the ChatPanel — don't render anything here
      return null;

    default:
      // Unknown tool — don't render anything, let the text handle it
      return null;
  }
}
