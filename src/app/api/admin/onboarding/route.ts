import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { onboardingEvents } from "@/lib/db/schema";
import { sql, gte, and, eq, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getPeriodDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null; // "all"
  }
}

export async function GET(req: Request) {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "30d";
  const periodDate = getPeriodDate(period);

  // Base condition for all queries
  const periodCondition = periodDate
    ? gte(onboardingEvents.createdAt, periodDate)
    : undefined;

  try {
    // ─── 1. Funnel counts ───────────────────────────────
    const allEvents = await db
      .select({
        stage: onboardingEvents.stage,
        event: onboardingEvents.event,
        cnt: count(),
      })
      .from(onboardingEvents)
      .where(periodCondition)
      .groupBy(onboardingEvents.stage, onboardingEvents.event);

    const eventCounts: Record<string, number> = {};
    for (const row of allEvents) {
      eventCounts[`${row.stage}:${row.event}`] = Number(row.cnt);
    }

    const domainSubmitted = eventCounts["domain_submitted:domain_entered"] ?? 0;
    const cacheHitFull = eventCounts["cache_lookup:cache_hit_full"] ?? 0;
    const cacheHitPartial = eventCounts["cache_lookup:cache_hit_partial"] ?? 0;
    const cacheMiss = eventCounts["cache_lookup:cache_miss"] ?? 0;
    const enrichmentSucceeded = eventCounts["enrichment_complete:enrichment_succeeded"] ?? 0;
    const enrichmentFailed = eventCounts["enrichment_complete:enrichment_failed"] ?? 0;
    const onboardingComplete = eventCounts["onboarding_complete:all_questions_done"] ?? 0;

    // Count interview questions answered
    const interviewEvents = allEvents.filter((e) => e.stage === "interview_answer");
    const totalInterviewAnswers = interviewEvents.reduce((sum, e) => sum + Number(e.cnt), 0);

    // ─── 2. Unique domains that started interview (at least 1 question) ──
    const interviewStartedResult = await db
      .selectDistinct({ domain: onboardingEvents.domain })
      .from(onboardingEvents)
      .where(
        periodCondition
          ? and(periodCondition, eq(onboardingEvents.stage, "interview_answer"))
          : eq(onboardingEvents.stage, "interview_answer")
      );
    const interviewStarted = interviewStartedResult.length;

    // ─── 3. Per-question completion rates ──────────────
    const questionFields = [
      "desiredPartnerServices",
      "requiredPartnerIndustries",
      "idealPartnerClientSize",
      "preferredPartnerLocations",
      "preferredPartnerTypes",
      "preferredPartnerSize",
      "idealProjectSize",
      "typicalHourlyRates",
    ];

    const questionCompletion: Record<string, { answered: number; rate: number }> = {};
    for (const field of questionFields) {
      const answered = eventCounts[`interview_answer:${field}`] ?? 0;
      questionCompletion[field] = {
        answered,
        rate: domainSubmitted > 0 ? answered / domainSubmitted : 0,
      };
    }

    // ─── 4. Stage success rates ─────────────────────────
    const pdlDone = eventCounts["enrichment_stage_done:pdl_done"] ?? 0;
    const pdlFailed = eventCounts["enrichment_stage_done:pdl_failed"] ?? 0;
    const scrapeDone = eventCounts["enrichment_stage_done:scrape_done"] ?? 0;
    const scrapeFailed = eventCounts["enrichment_stage_done:scrape_failed"] ?? 0;
    const classifyDone = eventCounts["enrichment_stage_done:classify_done"] ?? 0;
    const classifyFailed = eventCounts["enrichment_stage_done:classify_failed"] ?? 0;

    const safeRate = (done: number, failed: number) =>
      done + failed > 0 ? done / (done + failed) : 0;

    // ─── 5. Drop-off analysis ─────────────────────────────
    // Sessions where last event is >24h old and no onboarding_complete
    const dropOffQuery = await db.execute(sql`
      WITH session_last AS (
        SELECT DISTINCT ON (domain)
          domain,
          stage AS last_stage,
          created_at AS last_event_at
        FROM onboarding_events
        WHERE domain IS NOT NULL
        ${periodDate ? sql`AND created_at >= ${periodDate}` : sql``}
        ORDER BY domain, created_at DESC
      )
      SELECT last_stage, COUNT(*)::int AS drop_count
      FROM session_last
      WHERE last_event_at < NOW() - INTERVAL '24 hours'
        AND domain NOT IN (
          SELECT DISTINCT domain FROM onboarding_events
          WHERE event = 'all_questions_done'
          AND domain IS NOT NULL
          ${periodDate ? sql`AND created_at >= ${periodDate}` : sql``}
        )
      GROUP BY last_stage
      ORDER BY drop_count DESC
    `);

    const dropOffs: Record<string, number> = {};
    for (const row of dropOffQuery.rows as Array<{ last_stage: string; drop_count: number }>) {
      dropOffs[row.last_stage] = row.drop_count;
    }

    // ─── 6. Recent sessions ─────────────────────────────
    const recentQuery = await db.execute(sql`
      WITH session_summary AS (
        SELECT
          domain,
          MIN(user_id) AS user_id,
          MIN(organization_id) AS organization_id,
          MIN(created_at) AS first_event_at,
          MAX(created_at) AS last_event_at,
          (SELECT event FROM onboarding_events oe2
           WHERE oe2.domain = oe.domain AND oe2.stage = 'cache_lookup'
           ${periodDate ? sql`AND oe2.created_at >= ${periodDate}` : sql``}
           ORDER BY oe2.created_at DESC LIMIT 1
          ) AS cache_event,
          COUNT(*) FILTER (WHERE stage = 'interview_answer') AS questions_answered,
          BOOL_OR(event = 'all_questions_done') AS completed,
          BOOL_OR(event = 'enrichment_succeeded') AS enrichment_ok,
          BOOL_OR(event = 'enrichment_failed') AS enrichment_failed
        FROM onboarding_events oe
        WHERE domain IS NOT NULL
        ${periodDate ? sql`AND created_at >= ${periodDate}` : sql``}
        GROUP BY domain
      )
      SELECT *
      FROM session_summary
      ORDER BY last_event_at DESC
      LIMIT 50
    `);

    const recentSessions = (recentQuery.rows as Array<Record<string, unknown>>).map((row) => ({
      domain: row.domain as string,
      userId: row.user_id as string | null,
      organizationId: row.organization_id as string | null,
      firstEventAt: row.first_event_at as string,
      lastEventAt: row.last_event_at as string,
      cacheEvent: row.cache_event as string | null,
      questionsAnswered: Number(row.questions_answered),
      completed: row.completed as boolean,
      enrichmentOk: row.enrichment_ok as boolean,
      enrichmentFailed: row.enrichment_failed as boolean,
    }));

    // ─── 7. Daily trend ─────────────────────────────────
    const trendQuery = await db.execute(sql`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE event = 'domain_entered')::int AS submissions,
        COUNT(*) FILTER (WHERE event = 'all_questions_done')::int AS completions,
        COUNT(*) FILTER (WHERE event IN ('cache_hit_full', 'cache_hit_partial'))::int AS cache_hits,
        COUNT(*) FILTER (WHERE event = 'enrichment_succeeded')::int AS enrichment_ok
      FROM onboarding_events
      ${periodDate ? sql`WHERE created_at >= ${periodDate}` : sql``}
      GROUP BY DATE(created_at)
      ORDER BY day DESC
      LIMIT 90
    `);

    const dailyTrend = (trendQuery.rows as Array<Record<string, unknown>>).map((row) => ({
      date: row.day as string,
      submissions: Number(row.submissions),
      completions: Number(row.completions),
      cacheHits: Number(row.cache_hits),
      enrichmentOk: Number(row.enrichment_ok),
    }));

    // ─── Build response ─────────────────────────────────
    const totalCacheLookups = cacheHitFull + cacheHitPartial + cacheMiss;
    const cacheHitRate = totalCacheLookups > 0 ? (cacheHitFull + cacheHitPartial) / totalCacheLookups : 0;
    const enrichmentTotal = enrichmentSucceeded + enrichmentFailed;
    const enrichmentSuccessRate = enrichmentTotal > 0 ? enrichmentSucceeded / enrichmentTotal : 0;
    const interviewCompletionRate = interviewStarted > 0 ? onboardingComplete / interviewStarted : 0;

    return NextResponse.json({
      funnel: {
        domainSubmitted,
        cacheHitFull,
        cacheHitPartial,
        cacheMiss,
        enrichmentSucceeded,
        enrichmentFailed,
        interviewStarted,
        onboardingComplete,
        totalInterviewAnswers,
      },
      enrichmentMetrics: {
        cacheHitRate,
        enrichmentSuccessRate,
        apiCallsSaved: cacheHitFull,
        stageSuccessRates: {
          pdl: safeRate(pdlDone, pdlFailed),
          scrape: safeRate(scrapeDone, scrapeFailed),
          classify: safeRate(classifyDone, classifyFailed),
        },
      },
      interviewCompletionRate,
      questionCompletion,
      dropOffs,
      recentSessions,
      dailyTrend: dailyTrend.reverse(),
      period,
    });
  } catch (error) {
    console.error("[Admin/Onboarding] Query error:", error);
    return NextResponse.json(
      { error: "Failed to query onboarding data" },
      { status: 500 }
    );
  }
}
