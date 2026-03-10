import { db } from "@/lib/db";
import { aiUsageLog, subscriptions } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { PLAN_LIMITS, type PlanId } from "./plan-limits";

/**
 * Get the current month's start date (UTC).
 */
function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Get the current week's start date (Monday, UTC).
 */
function weekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get the org's current plan.
 */
export async function getOrgPlan(organizationId: string): Promise<PlanId> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, organizationId),
    columns: { plan: true },
  });
  return (sub?.plan as PlanId) ?? "free";
}

/**
 * Count potential matches surfaced for an org this week.
 */
export async function getMatchesThisWeek(
  organizationId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, organizationId),
        eq(aiUsageLog.feature, "matching"),
        gte(aiUsageLog.createdAt, weekStart())
      )
    );
  return Number(result[0]?.count ?? 0);
}

/**
 * Count AI Perfect Matches used by an org this month.
 */
export async function getAiPerfectMatchesThisMonth(
  organizationId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, organizationId),
        eq(aiUsageLog.feature, "ai_perfect_match"),
        gte(aiUsageLog.createdAt, monthStart())
      )
    );
  return Number(result[0]?.count ?? 0);
}

/**
 * Count opportunity responses by an org this month.
 */
export async function getOpportunityResponsesThisMonth(
  organizationId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, organizationId),
        eq(aiUsageLog.feature, "opportunity_response"),
        gte(aiUsageLog.createdAt, monthStart())
      )
    );
  return Number(result[0]?.count ?? 0);
}

/**
 * Count network searches performed by an org this month.
 */
export async function getSearchesThisMonth(
  organizationId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, organizationId),
        eq(aiUsageLog.feature, "network_search"),
        gte(aiUsageLog.createdAt, monthStart())
      )
    );
  return Number(result[0]?.count ?? 0);
}

/**
 * Full usage snapshot for an org.
 */
export async function getOrgUsage(organizationId: string) {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan];

  const [matchesThisWeek, aiPerfectMatches, opportunityResponses, searchesThisMonth] =
    await Promise.all([
      getMatchesThisWeek(organizationId),
      getAiPerfectMatchesThisMonth(organizationId),
      getOpportunityResponsesThisMonth(organizationId),
      getSearchesThisMonth(organizationId),
    ]);

  return {
    plan,
    limits,
    usage: {
      matchesThisWeek,
      aiPerfectMatches,
      opportunityResponses,
      searchesThisMonth,
    },
    remaining: {
      matchesThisWeek: Math.max(
        0,
        limits.potentialMatchesPerWeek - matchesThisWeek
      ),
      aiPerfectMatches: Math.max(
        0,
        limits.aiPerfectMatchesPerMonth - aiPerfectMatches
      ),
      opportunityResponses: Math.max(
        0,
        limits.opportunityResponsesPerMonth - opportunityResponses
      ),
      searchesThisMonth: limits.monthlySearches === -1
        ? Infinity
        : Math.max(0, limits.monthlySearches - searchesThisMonth),
    },
  };
}
