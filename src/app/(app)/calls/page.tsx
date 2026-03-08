"use client";

import { useEffect, useState } from "react";
import {
  Phone,
  Upload,
  Mic,
  Clock,
  TrendingUp,
  Target,
  MessageSquare,
  AlertCircle,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import Link from "next/link";

interface ScheduledCall {
  id: string;
  meetingTitle: string | null;
  meetingTime: string | null;
  callType: string | null;
  platform: string | null;
  status: string;
  coaching: {
    overallScore: number | null;
    topRecommendation: string | null;
  } | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: "bg-cos-slate/8", text: "text-cos-slate", dot: "bg-cos-slate" },
  recording: { bg: "bg-cos-warm/8", text: "text-cos-warm", dot: "bg-cos-warm animate-pulse" },
  done: { bg: "bg-cos-signal/8", text: "text-cos-signal", dot: "bg-cos-signal" },
  failed: { bg: "bg-cos-ember/8", text: "text-cos-ember", dot: "bg-cos-ember" },
  cancelled: { bg: "bg-cos-slate/8", text: "text-cos-slate-dim", dot: "bg-cos-slate-dim" },
};

export default function CallsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const [uploading, setUploading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<ScheduledCall[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    if (!activeOrg?.id) return;
    setLoadingCalls(true);
    fetch(`/api/calls/history?firmId=${activeOrg.id}`)
      .then((r) => r.json())
      .then((d) => setCalls(d.calls ?? []))
      .catch(console.error)
      .finally(() => setLoadingCalls(false));
  }, [activeOrg?.id]);

  const handleSubmitTranscript = async () => {
    if (!transcript.trim()) return;
    if (!activeOrg?.id) {
      setError("No active organization. Please select a workspace first.");
      return;
    }
    setUploading(true);
    setError(null);

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: activeOrg.id,
          transcript: transcript.trim(),
          callType: "sales",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setTranscript("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit transcript");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Call Intelligence
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Ossy joins your calls automatically via calendar invite, records, and sends coaching afterwards.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 shrink-0 text-cos-electric mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-cos-midnight">Add Ossy to your calendar</p>
            <p className="mt-0.5 text-cos-slate text-xs">
              Add <code className="font-mono bg-white px-1 rounded">ossy@joincollectiveos.com</code> as a guest to any Google Calendar event with a Meet or Zoom link. Ossy will join automatically 2 minutes before start time.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <QuickAction
          icon={<Mic className="h-5 w-5 text-cos-electric" />}
          title="Auto-Join via Calendar"
          description="Add ossy@ to your calendar invite — Ossy joins automatically"
          action="Active"
          disabled={false}
          highlight
        />
        <QuickAction
          icon={<Upload className="h-5 w-5 text-cos-signal" />}
          title="Paste Transcript"
          description="Manually paste a call transcript for analysis"
          action="Paste Below"
          onClick={() => document.getElementById("transcript-input")?.focus()}
        />
      </div>

      {/* Call History */}
      {calls.length > 0 || loadingCalls ? (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-cos-midnight">Your Calls</h3>
          {loadingCalls ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-cos-xl bg-cos-border/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => {
                const style = STATUS_STYLES[call.status] ?? STATUS_STYLES.pending;
                const scoreColor =
                  call.coaching?.overallScore
                    ? call.coaching.overallScore >= 80
                      ? "text-cos-signal"
                      : call.coaching.overallScore >= 60
                        ? "text-cos-warm"
                        : "text-cos-ember"
                    : "text-cos-slate-light";

                return (
                  <Link
                    key={call.id}
                    href={`/calls/${call.id}`}
                    className="group flex items-center gap-4 rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4 transition-all hover:border-cos-electric/30 hover:shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-cos-midnight">
                          {call.meetingTitle ?? "Untitled Call"}
                        </span>
                        <span
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {call.status}
                        </span>
                        {call.callType && call.callType !== "unknown" && (
                          <span className="rounded-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">
                            {call.callType}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-cos-slate">
                        {call.meetingTime
                          ? new Date(call.meetingTime).toLocaleString()
                          : new Date(call.createdAt).toLocaleDateString()}
                        {call.platform && call.platform !== "other"
                          ? ` · ${call.platform.replace("_", " ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {call.coaching?.overallScore != null && (
                        <div className="text-right">
                          <p className={`font-mono text-xl font-bold ${scoreColor}`}>
                            {call.coaching.overallScore}
                          </p>
                          <p className="text-xs text-cos-slate-light">score</p>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-cos-slate-light transition-colors group-hover:text-cos-electric" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Transcript Upload */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5">
        <h3 className="font-heading text-sm font-semibold text-cos-midnight">
          Paste Call Transcript
        </h3>
        <p className="mt-1 text-xs text-cos-slate">
          Paste any call transcript and Ossy will analyze it for opportunities, coaching insights, and action items.
        </p>
        <textarea
          id="transcript-input"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste your call transcript here..."
          className="mt-3 w-full rounded-cos-lg border border-cos-border bg-cos-cloud px-4 py-3 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          rows={6}
        />
        {error && <p className="mt-2 text-xs text-cos-ember">{error}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-cos-slate">
            {transcript.length > 0
              ? `${transcript.split(/\s+/).length} words`
              : "Paste or type a transcript"}
          </span>
          <Button size="sm" disabled={!transcript.trim() || uploading} onClick={handleSubmitTranscript}>
            {uploading ? "Analyzing..." : "Analyze Call"}
          </Button>
        </div>
      </div>

      {/* Feature Preview (only if no calls yet) */}
      {calls.length === 0 && !loadingCalls && (
        <div className="rounded-cos-xl border border-dashed border-cos-border p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
              <Target className="h-6 w-6 text-cos-electric" />
            </div>
            <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
              What Happens After a Call
            </h3>
            <div className="mt-6 grid max-w-2xl grid-cols-2 gap-6 text-left">
              <FeatureItem
                icon={<AlertCircle className="h-4 w-4 text-cos-warm" />}
                title="Opportunity Detection"
                description="Auto-detects when prospects mention needs you can't fulfill"
              />
              <FeatureItem
                icon={<TrendingUp className="h-4 w-4 text-cos-signal" />}
                title="Call Coaching"
                description="Scored on talking time, question quality, value prop clarity"
              />
              <FeatureItem
                icon={<MessageSquare className="h-4 w-4 text-cos-electric" />}
                title="Action Items"
                description="Extracts commitments and follow-ups automatically"
              />
              <FeatureItem
                icon={<Clock className="h-4 w-4 text-cos-midnight" />}
                title="Partner Matching"
                description="Recommends experts from the platform based on call topics"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  action,
  disabled,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-cos-xl border p-4 ${highlight ? "border-cos-electric/30 bg-cos-electric/5" : "border-cos-border bg-cos-surface-raised"}`}>
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-medium text-cos-midnight">{title}</h4>
      </div>
      <p className="mt-1 text-xs text-cos-slate">{description}</p>
      <Button size="sm" variant="outline" className="mt-3 w-full" disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h4 className="text-sm font-medium text-cos-midnight">{title}</h4>
        <p className="mt-0.5 text-xs text-cos-slate">{description}</p>
      </div>
    </div>
  );
}
