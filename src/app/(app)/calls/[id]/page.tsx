"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  Lightbulb,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallDetail {
  call: {
    id: string;
    meetingTitle: string | null;
    meetingTime: string | null;
    callType: string | null;
    platform: string | null;
    status: string;
    participants: string[] | null;
  };
  transcript: {
    id: string;
    fullText: string | null;
    segments: { speaker: string; startMs: number; endMs: number; text: string }[] | null;
  } | null;
  report: {
    id: string;
    overallScore: number | null;
    topRecommendation: string | null;
    talkingTimeRatio: { userPercent: number; otherPercent: number; assessment: string } | null;
    valueProposition: { clarity: number; mentioned: boolean; feedback: string } | null;
    questionQuality: { discoveryQuestions: number; closedQuestions: number; score: number; feedback: string } | null;
    topicsCovered: string[] | null;
    nextSteps: { established: boolean; items: string[] } | null;
    actionItems: { description: string; assignee: string; deadline?: string }[] | null;
    recommendedExperts: { name: string; firm: string; reason: string; profileUrl?: string }[] | null;
    recommendedCaseStudies: { title: string; firm: string; relevance: string; url?: string }[] | null;
    sentToFirmAAt: string | null;
    sentToFirmBAt: string | null;
  } | null;
}

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"coaching" | "transcript" | "experts">("coaching");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/calls/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 animate-pulse">
        <div className="h-8 w-48 rounded-cos-md bg-cos-border" />
        <div className="h-32 rounded-cos-xl bg-cos-border/50" />
        <div className="h-64 rounded-cos-xl bg-cos-border/50" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-cos-ember">Call not found.</p>
      </div>
    );
  }

  const { call, transcript, report } = data;
  const scoreColor =
    report?.overallScore != null
      ? report.overallScore >= 80
        ? "#60b9bf"
        : report.overallScore >= 60
          ? "#f3af3d"
          : "#e44627"
      : "#94a3b8";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Back */}
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-sm text-cos-slate transition-colors hover:text-cos-electric"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Calls
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight text-cos-midnight">
          {call.meetingTitle ?? "Untitled Call"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cos-slate">
          {call.meetingTime && (
            <span>{new Date(call.meetingTime).toLocaleString()}</span>
          )}
          {call.platform && call.platform !== "other" && (
            <span className="rounded-full bg-cos-cloud px-2 py-0.5 capitalize">
              {call.platform.replace("_", " ")}
            </span>
          )}
          {call.callType && call.callType !== "unknown" && (
            <span className="rounded-full bg-cos-electric/10 px-2 py-0.5 text-cos-electric capitalize">
              {call.callType}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 capitalize ${
              call.status === "done"
                ? "bg-cos-signal/8 text-cos-signal"
                : "bg-cos-slate/8 text-cos-slate"
            }`}
          >
            {call.status}
          </span>
        </div>
      </div>

      {/* Score summary */}
      {report && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <div className="flex items-center gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4"
              style={{ borderColor: scoreColor, color: scoreColor }}
            >
              <span className="font-mono text-xl font-bold">{report.overallScore ?? "—"}</span>
            </div>
            <div className="flex-1 min-w-0">
              {report.topRecommendation && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                    Top Recommendation
                  </p>
                  <p className="mt-1 text-sm text-cos-midnight leading-snug">
                    {report.topRecommendation}
                  </p>
                </>
              )}
              {call.participants && call.participants.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-cos-slate">
                  <Users className="h-3.5 w-3.5" />
                  {call.participants.join(", ")}
                </p>
              )}
            </div>
            {(report.sentToFirmAAt || report.sentToFirmBAt) && (
              <div className="shrink-0 text-right text-xs text-cos-slate">
                <p className="flex items-center gap-1 text-cos-signal">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Coaching sent
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No coaching yet */}
      {!report && call.status === "done" && (
        <div className="rounded-cos-xl border border-cos-warm/20 bg-cos-warm/5 px-5 py-4 text-sm text-cos-warm">
          Coaching analysis is running — check back in a minute.
        </div>
      )}
      {!report && call.status !== "done" && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4 text-sm text-cos-slate">
          Coaching will be available after the call ends.
        </div>
      )}

      {/* Tabs */}
      {(report || transcript) && (
        <>
          <div className="flex gap-1 rounded-cos-lg border border-cos-border bg-cos-cloud p-1">
            {[
              { key: "coaching" as const, label: "Coaching", icon: <TrendingUp className="h-4 w-4" /> },
              { key: "transcript" as const, label: "Transcript", icon: <MessageSquare className="h-4 w-4" /> },
              { key: "experts" as const, label: "Experts", icon: <Lightbulb className="h-4 w-4" /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-cos-md px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === key
                    ? "bg-white text-cos-midnight shadow-sm"
                    : "text-cos-slate hover:text-cos-midnight"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Coaching Tab */}
          {activeTab === "coaching" && report && (
            <div className="space-y-4">
              {/* Talk time */}
              {report.talkingTimeRatio && (
                <CoachingCard title="Talk Time">
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1 rounded-cos-lg bg-cos-cloud p-3 text-center">
                      <p className="font-mono text-xl font-bold text-cos-midnight">
                        {report.talkingTimeRatio.userPercent}%
                      </p>
                      <p className="text-xs text-cos-slate">You</p>
                    </div>
                    <div className="flex-1 rounded-cos-lg bg-cos-cloud p-3 text-center">
                      <p className="font-mono text-xl font-bold text-cos-midnight">
                        {report.talkingTimeRatio.otherPercent}%
                      </p>
                      <p className="text-xs text-cos-slate">Other party</p>
                    </div>
                  </div>
                  <p className="text-sm text-cos-slate">{report.talkingTimeRatio.assessment}</p>
                </CoachingCard>
              )}

              {/* Value prop */}
              {report.valueProposition && (
                <CoachingCard title="Value Proposition">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-2 rounded-full bg-cos-cloud overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cos-electric"
                        style={{ width: `${Math.round(report.valueProposition.clarity * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm font-semibold text-cos-midnight">
                      {Math.round(report.valueProposition.clarity * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-cos-slate">{report.valueProposition.feedback}</p>
                </CoachingCard>
              )}

              {/* Question quality */}
              {report.questionQuality && (
                <CoachingCard title="Question Quality">
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1 rounded-cos-lg bg-cos-cloud p-3 text-center">
                      <p className="font-mono text-xl font-bold text-cos-signal">
                        {report.questionQuality.discoveryQuestions}
                      </p>
                      <p className="text-xs text-cos-slate">Discovery</p>
                    </div>
                    <div className="flex-1 rounded-cos-lg bg-cos-cloud p-3 text-center">
                      <p className="font-mono text-xl font-bold text-cos-slate">
                        {report.questionQuality.closedQuestions}
                      </p>
                      <p className="text-xs text-cos-slate">Closed</p>
                    </div>
                  </div>
                  <p className="text-sm text-cos-slate">{report.questionQuality.feedback}</p>
                </CoachingCard>
              )}

              {/* Topics */}
              {report.topicsCovered && report.topicsCovered.length > 0 && (
                <CoachingCard title="Topics Covered">
                  <div className="flex flex-wrap gap-2">
                    {report.topicsCovered.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-cos-pill bg-cos-cloud px-3 py-1 text-xs text-cos-midnight"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </CoachingCard>
              )}

              {/* Next Steps */}
              {report.nextSteps?.items && report.nextSteps.items.length > 0 && (
                <CoachingCard title="Next Steps">
                  <ul className="space-y-2">
                    {report.nextSteps.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-cos-midnight">
                        <CheckCircle className="h-4 w-4 shrink-0 text-cos-signal mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CoachingCard>
              )}

              {/* Action Items */}
              {report.actionItems && report.actionItems.length > 0 && (
                <CoachingCard title="Action Items">
                  <ul className="space-y-2">
                    {report.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Clock className="h-4 w-4 shrink-0 text-cos-electric mt-0.5" />
                        <span className="text-cos-midnight">{item.description}</span>
                        {item.assignee && (
                          <span className="ml-auto shrink-0 text-xs text-cos-slate">{item.assignee}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CoachingCard>
              )}
            </div>
          )}

          {/* Transcript Tab */}
          {activeTab === "transcript" && (
            <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
              {transcript?.segments && transcript.segments.length > 0 ? (
                <div className="space-y-4">
                  {transcript.segments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="w-24 shrink-0 text-xs font-semibold text-cos-slate pt-0.5">
                        {seg.speaker}
                      </span>
                      <p className="flex-1 text-sm text-cos-midnight leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              ) : transcript?.fullText ? (
                <pre className="whitespace-pre-wrap text-sm text-cos-midnight font-mono leading-relaxed">
                  {transcript.fullText}
                </pre>
              ) : (
                <p className="text-sm text-cos-slate">Transcript not available.</p>
              )}
            </div>
          )}

          {/* Experts Tab */}
          {activeTab === "experts" && (
            <div className="space-y-4">
              {report?.recommendedExperts && report.recommendedExperts.length > 0 && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 space-y-4">
                  <h3 className="font-heading text-sm font-semibold text-cos-midnight">
                    Recommended Experts
                  </h3>
                  {report.recommendedExperts.map((expert, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-4 py-3 border-b border-cos-border/60 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-cos-midnight">{expert.name}</p>
                        <p className="text-xs text-cos-slate">{expert.firm}</p>
                        <p className="mt-1 text-xs text-cos-midnight">{expert.reason}</p>
                      </div>
                      {expert.profileUrl && (
                        <a
                          href={expert.profileUrl}
                          className="shrink-0 text-xs text-cos-electric hover:underline"
                        >
                          View profile →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {report?.recommendedCaseStudies && report.recommendedCaseStudies.length > 0 && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 space-y-4">
                  <h3 className="font-heading text-sm font-semibold text-cos-midnight">
                    Relevant Case Studies
                  </h3>
                  {report.recommendedCaseStudies.map((cs, i) => (
                    <div
                      key={i}
                      className="py-3 border-b border-cos-border/60 last:border-0"
                    >
                      <p className="text-sm font-semibold text-cos-midnight">{cs.title}</p>
                      <p className="text-xs text-cos-slate">{cs.firm}</p>
                      <p className="mt-1 text-xs text-cos-midnight">{cs.relevance}</p>
                      {cs.url && (
                        <a href={cs.url} className="mt-1 block text-xs text-cos-electric hover:underline">
                          Read more →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(!report?.recommendedExperts?.length && !report?.recommendedCaseStudies?.length) && (
                <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-10 text-center">
                  <Lightbulb className="mx-auto h-8 w-8 text-cos-slate-light" />
                  <p className="mt-3 text-sm text-cos-slate">
                    Recommendations will appear after the coaching report is generated.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CoachingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cos-slate">{title}</p>
      {children}
    </div>
  );
}
