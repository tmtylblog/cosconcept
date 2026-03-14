"use client";

import {
  Loader2,
  User,
  Building2,
  Mail,
  Linkedin,
  Globe,
  Clock,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { DealCard } from "./deal-card";
import type {
  ConversationContext,
  Stage,
  Activity,
} from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ContextPanelProps {
  context: ConversationContext | null;
  loading: boolean;
  stages: Stage[];
  onStageChange: (stageId: string) => void;
  onTagsChange: (tags: string[]) => void;
  onCreateDeal: () => void;
  participantName: string;
  participantUrl: string | null;
}

// ── Activity type labels + icons ─────────────────────────────────────────────

function activityIcon(type: string) {
  switch (type) {
    case "email_sent":
    case "email_received":
      return <Mail className="h-3 w-3" />;
    case "linkedin_message":
    case "linkedin_connection":
      return <Linkedin className="h-3 w-3" />;
    case "stage_change":
      return <Clock className="h-3 w-3" />;
    case "note":
      return <MessageSquare className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContextPanel({
  context,
  loading,
  stages,
  onStageChange,
  onTagsChange,
  onCreateDeal,
  participantName,
  participantUrl,
}: ContextPanelProps) {
  if (loading) {
    return (
      <div className="w-80 shrink-0 border-l border-cos-border bg-cos-surface-raised flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="w-80 shrink-0 border-l border-cos-border bg-cos-surface-raised flex items-center justify-center p-6">
        <div className="text-center">
          <User className="h-6 w-6 mx-auto mb-2 text-cos-slate opacity-30" />
          <p className="text-xs text-cos-slate">
            Select a conversation to see context
          </p>
        </div>
      </div>
    );
  }

  const { contact, deal, company, outreach } = context;
  const activities: Activity[] = context.activities ?? [];

  return (
    <div className="w-80 shrink-0 border-l border-cos-border bg-cos-surface-raised overflow-y-auto cos-scrollbar">
      <div className="p-4 space-y-4">
        {/* ── Deal Card ──────────────────────────────────────────────── */}
        <DealCard
          deal={deal}
          stages={stages}
          onStageChange={onStageChange}
          onTagsChange={onTagsChange}
          onCreateDeal={onCreateDeal}
        />

        {/* ── Contact Card ───────────────────────────────────────────── */}
        <div className="rounded-cos-xl border border-cos-border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-3.5 w-3.5 text-cos-slate" />
            <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider">
              Contact
            </p>
          </div>
          {contact ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-cos-midnight">
                {contact.firstName} {contact.lastName}
              </p>
              {contact.email && (
                <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="hover:text-cos-electric truncate"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.linkedinUrl && (
                <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                  <Linkedin className="h-3 w-3 shrink-0" />
                  <a
                    href={contact.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cos-electric truncate"
                  >
                    LinkedIn Profile
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-cos-midnight">
                {participantName}
              </p>
              {participantUrl && (
                <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <a
                    href={participantUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cos-electric truncate"
                  >
                    View Profile
                  </a>
                </div>
              )}
              <p className="text-[10px] text-cos-slate-dim italic">
                Not yet linked to a COS contact
              </p>
            </div>
          )}
        </div>

        {/* ── Company Card ───────────────────────────────────────────── */}
        {company && (
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-3.5 w-3.5 text-cos-slate" />
              <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider">
                Company
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-cos-midnight">
                {company.name}
              </p>
              {company.domain && (
                <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                  <Globe className="h-3 w-3 shrink-0" />
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cos-electric truncate"
                  >
                    {company.domain}
                  </a>
                </div>
              )}
              {company.industry && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">Industry:</span>{" "}
                  {company.industry}
                </p>
              )}
              {company.sizeEstimate && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">Size:</span>{" "}
                  {company.sizeEstimate}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Outreach Context ───────────────────────────────────────── */}
        {outreach && (
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-cos-slate" />
              <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider">
                Outreach
              </p>
            </div>
            <div className="space-y-1.5">
              {outreach.channel && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">Channel:</span>{" "}
                  <span className="font-medium text-cos-midnight">
                    {outreach.channel}
                  </span>
                </p>
              )}
              {outreach.campaignName && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">Campaign:</span>{" "}
                  {outreach.campaignName}
                </p>
              )}
              {outreach.firstTouchAt && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">First touch:</span>{" "}
                  {formatDate(outreach.firstTouchAt)}
                </p>
              )}
              {outreach.responseAt && (
                <p className="text-xs text-cos-slate">
                  <span className="text-cos-slate-dim">Responded:</span>{" "}
                  {formatDate(outreach.responseAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Activity Timeline ──────────────────────────────────────── */}
        {activities.length > 0 && (
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-cos-slate" />
              <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wider">
                Activity
              </p>
            </div>
            <div className="space-y-0">
              {activities.map((activity: Activity, idx: number) => (
                <div
                  key={activity.id}
                  className="relative flex items-start gap-2.5 pb-3"
                >
                  {/* Timeline line */}
                  {idx < activities.length - 1 && (
                    <div className="absolute left-[7px] top-4 h-full w-px bg-cos-border" />
                  )}
                  {/* Icon */}
                  <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cos-cloud text-cos-slate">
                    {activityIcon(activity.activityType)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cos-midnight leading-tight">
                      {activity.description ??
                        activity.activityType.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-cos-slate-dim mt-0.5">
                      {formatDate(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
