"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  RefreshCw,
  Database,
  Zap,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowDown,
  Globe,
  MessageSquare,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────

interface FunnelData {
  domainSubmitted: number;
  cacheHitFull: number;
  cacheHitPartial: number;
  cacheMiss: number;
  enrichmentSucceeded: number;
  enrichmentFailed: number;
  interviewStarted: number;
  onboardingComplete: number;
  totalInterviewAnswers: number;
}

interface EnrichmentMetrics {
  cacheHitRate: number;
  enrichmentSuccessRate: number;
  apiCallsSaved: number;
  stageSuccessRates: { pdl: number; scrape: number; classify: number };
}

interface QuestionStat {
  answered: number;
  rate: number;
}

interface RecentSession {
  domain: string;
  userId: string | null;
  organizationId: string | null;
  firstEventAt: string;
  lastEventAt: string;
  cacheEvent: string | null;
  questionsAnswered: number;
  completed: boolean;
  enrichmentOk: boolean;
  enrichmentFailed: boolean;
}

interface DailyTrend {
  date: string;
  submissions: number;
  completions: number;
  cacheHits: number;
  enrichmentOk: number;
}

interface OnboardingData {
  funnel: FunnelData;
  enrichmentMetrics: EnrichmentMetrics;
  interviewCompletionRate: number;
  questionCompletion: Record<string, QuestionStat>;
  dropOffs: Record<string, number>;
  recentSessions: RecentSession[];
  dailyTrend: DailyTrend[];
  period: string;
}

type Period = "7d" | "30d" | "90d" | "all";

const QUESTION_LABELS: Record<string, string> = {
  desiredPartnerServices: "Services Wanted",
  requiredPartnerIndustries: "Required Industries",
  idealPartnerClientSize: "Client Size",
  preferredPartnerLocations: "Locations",
  preferredPartnerTypes: "Partner Types",
  preferredPartnerSize: "Partner Size",
  idealProjectSize: "Project Size",
  typicalHourlyRates: "Hourly Rates",
};

const QUESTION_ORDER = [
  "desiredPartnerServices",
  "requiredPartnerIndustries",
  "idealPartnerClientSize",
  "preferredPartnerLocations",
  "preferredPartnerTypes",
  "preferredPartnerSize",
  "idealProjectSize",
  "typicalHourlyRates",
];

// ─── Components ───────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color = "cos-electric",
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-cos-slate">
        <Icon className={cn("h-3.5 w-3.5", `text-${color}`)} />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-cos-midnight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cos-slate">{sub}</p>}
    </div>
  );
}

function PercentBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cos-cloud">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${Math.min(value * 100, 100)}%` }}
      />
    </div>
  );
}

function FunnelStep({
  label,
  count,
  total,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  total: number;
  icon: React.ElementType;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-cos-midnight">
          <Icon className={cn("h-4 w-4", `text-${color}`)} />
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-cos-midnight">{count}</span>
          {total > 0 && total !== count && (
            <span className="text-xs text-cos-slate">
              {pct.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-cos-cloud">
        <div
          className={cn("h-full rounded-full transition-all", `bg-${color}`)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function CacheEventBadge({ event }: { event: string | null }) {
  if (!event) return <span className="text-cos-slate">—</span>;
  const config = {
    cache_hit_full: { label: "Full Hit", cls: "bg-cos-signal/10 text-cos-signal" },
    cache_hit_partial: { label: "Partial", cls: "bg-cos-warm/10 text-cos-warm" },
    cache_miss: { label: "Miss", cls: "bg-cos-slate/10 text-cos-slate" },
  }[event] || { label: event, cls: "bg-cos-cloud text-cos-slate" };

  return (
    <span className={cn("rounded-cos-pill px-2 py-0.5 text-[10px] font-medium", config.cls)}>
      {config.label}
    </span>
  );
}

function SessionStatusBadge({ session }: { session: RecentSession }) {
  if (session.completed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
        <CheckCircle2 className="h-2.5 w-2.5" /> Complete
      </span>
    );
  }
  if (session.enrichmentFailed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-ember/10 px-2 py-0.5 text-[10px] font-medium text-cos-ember">
        <XCircle className="h-2.5 w-2.5" /> Failed
      </span>
    );
  }
  if (session.questionsAnswered > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
        <MessageSquare className="h-2.5 w-2.5" /> In Progress
      </span>
    );
  }
  if (session.enrichmentOk) {
    return (
      <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
        <AlertTriangle className="h-2.5 w-2.5" /> Awaiting Interview
      </span>
    );
  }
  return (
    <span className="rounded-cos-pill bg-cos-slate/10 px-2 py-0.5 text-[10px] font-medium text-cos-slate">
      Started
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────

export default function AdminOnboardingPage() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/onboarding?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch {
      console.error("Failed to fetch onboarding data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
        <div className="h-64 rounded-cos-xl bg-cos-border/50" />
      </div>
    );
  }

  const f = data?.funnel;
  const em = data?.enrichmentMetrics;
  const total = f?.domainSubmitted ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Onboarding Funnel
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Track firm onboarding from domain entry to profile completion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-cos-lg border border-cos-border bg-cos-surface">
            {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  period === p
                    ? "bg-cos-electric text-white rounded-cos-lg"
                    : "text-cos-slate hover:text-cos-electric"
                )}
              >
                {p === "all" ? "All" : p.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-cos-lg border border-cos-border bg-cos-surface text-cos-slate transition-all hover:border-cos-electric/30 hover:text-cos-electric disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Submissions"
          value={total}
          icon={Globe}
          sub={`${data?.dailyTrend.length ?? 0} days with activity`}
        />
        <StatCard
          label="Cache Hit Rate"
          value={em ? `${(em.cacheHitRate * 100).toFixed(0)}%` : "—"}
          icon={Database}
          color={
            em && em.cacheHitRate >= 0.7
              ? "cos-signal"
              : em && em.cacheHitRate >= 0.4
                ? "cos-warm"
                : "cos-ember"
          }
          sub={`${em?.apiCallsSaved ?? 0} full cache hits`}
        />
        <StatCard
          label="Enrichment Success"
          value={em ? `${(em.enrichmentSuccessRate * 100).toFixed(0)}%` : "—"}
          icon={Zap}
          color={
            em && em.enrichmentSuccessRate >= 0.8
              ? "cos-signal"
              : em && em.enrichmentSuccessRate >= 0.5
                ? "cos-warm"
                : "cos-ember"
          }
          sub={`${f?.enrichmentSucceeded ?? 0} succeeded`}
        />
        <StatCard
          label="Interview Completion"
          value={
            data
              ? `${(data.interviewCompletionRate * 100).toFixed(0)}%`
              : "—"
          }
          icon={MessageSquare}
          sub={`${f?.onboardingComplete ?? 0} of ${f?.interviewStarted ?? 0} who started`}
        />
        <StatCard
          label="Fully Onboarded"
          value={f?.onboardingComplete ?? 0}
          icon={CheckCircle2}
          color="cos-signal"
          sub={total > 0 ? `${((f?.onboardingComplete ?? 0) / total * 100).toFixed(0)}% of submissions` : ""}
        />
      </div>

      {/* Funnel visualization + Enrichment breakdown side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-cos-midnight">Conversion Funnel</h2>
          <div className="space-y-3">
            <FunnelStep label="Domain Submitted" count={total} total={total} icon={Globe} color="cos-electric" />
            <div className="flex items-center justify-center">
              <ArrowDown className="h-3.5 w-3.5 text-cos-slate-light" />
            </div>
            <FunnelStep
              label="Enrichment Complete"
              count={f?.enrichmentSucceeded ?? 0}
              total={total}
              icon={Zap}
              color="cos-electric"
            />
            <div className="flex items-center justify-center">
              <ArrowDown className="h-3.5 w-3.5 text-cos-slate-light" />
            </div>
            <FunnelStep
              label="Interview Started"
              count={f?.interviewStarted ?? 0}
              total={total}
              icon={MessageSquare}
              color="cos-signal"
            />
            <div className="flex items-center justify-center">
              <ArrowDown className="h-3.5 w-3.5 text-cos-slate-light" />
            </div>
            <FunnelStep
              label="Interview Complete"
              count={f?.onboardingComplete ?? 0}
              total={total}
              icon={CheckCircle2}
              color="cos-signal"
            />
          </div>
        </div>

        {/* Enrichment breakdown */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-cos-midnight">Enrichment Breakdown</h2>

          {/* Cache distribution */}
          <div className="mb-5 space-y-2">
            <p className="text-xs font-medium text-cos-slate">Cache Distribution</p>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-cos-cloud">
              {total > 0 && (
                <>
                  <div
                    className="bg-cos-signal transition-all"
                    style={{ width: `${((f?.cacheHitFull ?? 0) / total) * 100}%` }}
                    title={`Full Hit: ${f?.cacheHitFull}`}
                  />
                  <div
                    className="bg-cos-warm transition-all"
                    style={{ width: `${((f?.cacheHitPartial ?? 0) / total) * 100}%` }}
                    title={`Partial Hit: ${f?.cacheHitPartial}`}
                  />
                  <div
                    className="bg-cos-slate/30 transition-all"
                    style={{ width: `${((f?.cacheMiss ?? 0) / total) * 100}%` }}
                    title={`Miss: ${f?.cacheMiss}`}
                  />
                </>
              )}
            </div>
            <div className="flex gap-4 text-xs text-cos-slate">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cos-signal" /> Full Hit: {f?.cacheHitFull ?? 0}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cos-warm" /> Partial: {f?.cacheHitPartial ?? 0}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cos-slate/40" /> Miss: {f?.cacheMiss ?? 0}
              </span>
            </div>
          </div>

          {/* Stage success rates */}
          <p className="mb-2 text-xs font-medium text-cos-slate">Stage Success Rates</p>
          <div className="space-y-2.5">
            {(["pdl", "scrape", "classify"] as const).map((stage) => {
              const rate = em?.stageSuccessRates[stage] ?? 0;
              return (
                <div key={stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-cos-midnight capitalize">{stage === "pdl" ? "PDL (Company)" : stage === "scrape" ? "Jina (Scrape)" : "AI Classify"}</span>
                    <span className="text-cos-slate">{(rate * 100).toFixed(0)}%</span>
                  </div>
                  <PercentBar
                    value={rate}
                    color={rate >= 0.8 ? "bg-cos-signal" : rate >= 0.5 ? "bg-cos-warm" : "bg-cos-ember"}
                  />
                </div>
              );
            })}
          </div>

          {/* Drop-offs */}
          {data?.dropOffs && Object.keys(data.dropOffs).length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-cos-slate">Drop-off Points (24h+)</p>
              <div className="space-y-1.5">
                {Object.entries(data.dropOffs)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, cnt]) => (
                    <div key={stage} className="flex items-center justify-between text-xs">
                      <span className="text-cos-midnight">{stage.replace(/_/g, " ")}</span>
                      <span className="font-semibold text-cos-ember">{cnt}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Question completion heatmap */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-cos-midnight">
          Interview Question Completion
          <span className="ml-2 text-xs font-normal text-cos-slate">
            Which questions get answered? Drop-off reveals friction points.
          </span>
        </h2>
        <div className="space-y-2.5">
          {QUESTION_ORDER.map((field, i) => {
            const stat = data?.questionCompletion[field];
            const answered = stat?.answered ?? 0;
            const rate = stat?.rate ?? 0;
            const prevAnswered = i > 0
              ? (data?.questionCompletion[QUESTION_ORDER[i - 1]]?.answered ?? 0)
              : total;
            const dropOff = prevAnswered > 0 && answered < prevAnswered
              ? prevAnswered - answered
              : 0;

            return (
              <div key={field} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs font-bold text-cos-slate">{i + 1}</span>
                <span className="w-36 shrink-0 text-xs font-medium text-cos-midnight">
                  {QUESTION_LABELS[field] || field}
                </span>
                <div className="flex-1">
                  <PercentBar
                    value={rate}
                    color={rate >= 0.6 ? "bg-cos-signal" : rate >= 0.3 ? "bg-cos-warm" : "bg-cos-ember"}
                  />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-cos-midnight">{answered}</span>
                {dropOff > 0 && (
                  <span className="w-16 text-right text-[10px] text-cos-ember">-{dropOff} drop</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily trend */}
      {data?.dailyTrend && data.dailyTrend.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-cos-midnight">Daily Trend</h2>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {data.dailyTrend.slice(-30).map((day) => {
              const maxVal = Math.max(...data.dailyTrend.map((d) => d.submissions), 1);
              const subH = (day.submissions / maxVal) * 100;
              const compH = (day.completions / maxVal) * 100;
              return (
                <div
                  key={day.date}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  style={{ height: "100%" }}
                >
                  {/* Tooltip */}
                  <div className="absolute -top-10 hidden rounded-cos-md bg-cos-midnight px-2 py-1 text-[10px] text-white shadow-sm group-hover:block z-10">
                    {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    : {day.submissions} sub / {day.completions} done
                  </div>
                  <div
                    className="w-full rounded-t-sm bg-cos-electric/20"
                    style={{ height: `${subH}%`, minHeight: day.submissions > 0 ? 4 : 0 }}
                  />
                  <div
                    className="w-full bg-cos-signal"
                    style={{ height: `${compH}%`, minHeight: day.completions > 0 ? 2 : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-cos-slate">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cos-electric/20" /> Submissions
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cos-signal" /> Completions
            </span>
          </div>
        </div>
      )}

      {/* Recent sessions table */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-cos-midnight">
          Recent Sessions
          <span className="ml-2 text-xs font-normal text-cos-slate">Last 50</span>
        </h2>
        {data?.recentSessions && data.recentSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cos-border text-left text-cos-slate">
                  <th className="pb-2 pr-4 font-medium">Domain</th>
                  <th className="pb-2 pr-4 font-medium">Cache</th>
                  <th className="pb-2 pr-4 font-medium">Enrichment</th>
                  <th className="pb-2 pr-4 font-medium">Questions</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-border/50">
                {data.recentSessions.map((s, i) => (
                  <tr key={`${s.domain}-${i}`} className="text-cos-midnight">
                    <td className="py-2 pr-4 font-medium">{s.domain}</td>
                    <td className="py-2 pr-4">
                      <CacheEventBadge event={s.cacheEvent} />
                    </td>
                    <td className="py-2 pr-4">
                      {s.enrichmentOk ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-cos-signal" />
                      ) : s.enrichmentFailed ? (
                        <XCircle className="h-3.5 w-3.5 text-cos-ember" />
                      ) : (
                        <span className="text-cos-slate">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={cn(
                        "font-semibold",
                        s.questionsAnswered >= 8 ? "text-cos-signal" :
                        s.questionsAnswered > 0 ? "text-cos-electric" : "text-cos-slate"
                      )}>
                        {s.questionsAnswered}/8
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <SessionStatusBadge session={s} />
                    </td>
                    <td className="py-2 text-cos-slate">
                      {new Date(s.lastEventAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-sm text-cos-slate py-8">
            No onboarding sessions recorded yet. Events will appear here as users start onboarding.
          </p>
        )}
      </div>
    </div>
  );
}
