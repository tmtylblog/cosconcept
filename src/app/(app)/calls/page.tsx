"use client";

import { useState } from "react";
import {
  Phone,
  Upload,
  Mic,
  Clock,
  TrendingUp,
  Target,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";

export default function CallsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const [uploading, setUploading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Call Intelligence
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Record calls, get AI coaching, and auto-detect partnership opportunities.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <QuickAction
          icon={<Mic className="h-5 w-5 text-cos-electric" />}
          title="Chrome Extension"
          description="Install to auto-record Google Meet, Zoom, and Teams calls"
          action="Install Extension"
          disabled
        />
        <QuickAction
          icon={<Upload className="h-5 w-5 text-green-600" />}
          title="Upload Transcript"
          description="Paste a call transcript for AI analysis"
          action="Upload"
          onClick={() => document.getElementById("transcript-input")?.focus()}
        />
        <QuickAction
          icon={<Phone className="h-5 w-5 text-blue-600" />}
          title="Live Recording"
          description="Record a call directly in the browser"
          action="Coming Soon"
          disabled
        />
      </div>

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
        {error && (
          <p className="mt-2 text-xs text-cos-ember">{error}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-cos-slate">
            {transcript.length > 0
              ? `${transcript.split(/\s+/).length} words`
              : "Paste or type a transcript"}
          </span>
          <Button
            size="sm"
            disabled={!transcript.trim() || uploading}
            onClick={handleSubmitTranscript}
          >
            {uploading ? "Analyzing..." : "Analyze Call"}
          </Button>
        </div>
      </div>

      {/* Feature Preview */}
      <div className="rounded-cos-xl border border-dashed border-cos-border p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Target className="h-6 w-6 text-cos-electric" />
          </div>
          <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
            What Call Intelligence Does
          </h3>
          <div className="mt-6 grid max-w-2xl grid-cols-2 gap-6 text-left">
            <FeatureItem
              icon={<AlertCircle className="h-4 w-4 text-cos-accent-warm" />}
              title="Opportunity Detection"
              description="Auto-detects when prospects mention needs you can't fulfill — creates shareable opportunities"
            />
            <FeatureItem
              icon={<TrendingUp className="h-4 w-4 text-green-600" />}
              title="Call Coaching"
              description="Get scored on talking time, question quality, value prop clarity, and next steps"
            />
            <FeatureItem
              icon={<MessageSquare className="h-4 w-4 text-blue-600" />}
              title="Action Items"
              description="Extracts commitments and follow-ups automatically from conversation"
            />
            <FeatureItem
              icon={<Clock className="h-4 w-4 text-purple-600" />}
              title="Partner Matching"
              description="Recommends partners based on call topics — share opportunities instantly"
            />
          </div>
        </div>
      </div>
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
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-medium text-cos-midnight">{title}</h4>
      </div>
      <p className="mt-1 text-xs text-cos-slate">{description}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-3 w-full"
        disabled={disabled}
        onClick={onClick}
      >
        {action}
      </Button>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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
