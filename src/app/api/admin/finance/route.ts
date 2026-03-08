import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiUsageLog, organizations, users } from "@/lib/db/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance — AI cost analytics for admin dashboard
 *
 * Query params:
 *   ?period=7d|30d|90d|all  — Time period (default: 30d)
 *   ?orgId=...              — Filter by organization
 *   ?userId=...             — Filter by user
 *   ?breakdown=feature|model|org|user — Breakdown dimension
 *
 * Returns:
 *   - totalCost, totalCalls, avgCostPerCall
 *   - breakdown by requested dimension
 *   - daily trend data
 *   - top consumers
 */
export async function GET(req: NextRequest) {
  // Verify superadmin role
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const period = params.get("period") ?? "30d";
  const orgId = params.get("orgId");
  const userId = params.get("userId");
  const breakdown = params.get("breakdown") ?? "feature";

  // Calculate date range
  const now = new Date();
  let since: Date | null = null;
  if (period === "7d") since = new Date(now.getTime() - 7 * 86400000);
  else if (period === "30d") since = new Date(now.getTime() - 30 * 86400000);
  else if (period === "90d") since = new Date(now.getTime() - 90 * 86400000);

  // Build conditions
  const conditions = [];
  if (since) conditions.push(gte(aiUsageLog.createdAt, since));
  if (orgId) conditions.push(eq(aiUsageLog.organizationId, orgId));
  if (userId) conditions.push(eq(aiUsageLog.userId, userId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Total stats
  const [totals] = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${aiUsageLog.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${aiUsageLog.outputTokens}), 0)`,
      avgDurationMs: sql<number>`COALESCE(AVG(${aiUsageLog.durationMs}), 0)`,
    })
    .from(aiUsageLog)
    .where(where);

  // Breakdown
  let breakdownData;
  if (breakdown === "feature") {
    breakdownData = await db
      .select({
        key: aiUsageLog.feature,
        cost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(aiUsageLog)
      .where(where)
      .groupBy(aiUsageLog.feature)
      .orderBy(desc(sql`SUM(${aiUsageLog.costUsd})`));
  } else if (breakdown === "model") {
    breakdownData = await db
      .select({
        key: aiUsageLog.model,
        cost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(aiUsageLog)
      .where(where)
      .groupBy(aiUsageLog.model)
      .orderBy(desc(sql`SUM(${aiUsageLog.costUsd})`));
  } else if (breakdown === "org") {
    breakdownData = await db
      .select({
        key: organizations.name,
        orgId: aiUsageLog.organizationId,
        cost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(aiUsageLog)
      .leftJoin(organizations, eq(aiUsageLog.organizationId, organizations.id))
      .where(where)
      .groupBy(aiUsageLog.organizationId, organizations.name)
      .orderBy(desc(sql`SUM(${aiUsageLog.costUsd})`))
      .limit(20);
  } else if (breakdown === "user") {
    breakdownData = await db
      .select({
        key: users.name,
        userId: aiUsageLog.userId,
        cost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(aiUsageLog)
      .leftJoin(users, eq(aiUsageLog.userId, users.id))
      .where(where)
      .groupBy(aiUsageLog.userId, users.name)
      .orderBy(desc(sql`SUM(${aiUsageLog.costUsd})`))
      .limit(20);
  }

  // Daily trend (last 30 days max)
  const trendSince = since ?? new Date(now.getTime() - 30 * 86400000);
  const dailyTrend = await db
    .select({
      date: sql<string>`DATE(${aiUsageLog.createdAt})`,
      cost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(aiUsageLog)
    .where(
      and(
        gte(aiUsageLog.createdAt, trendSince),
        orgId ? eq(aiUsageLog.organizationId, orgId) : undefined,
        userId ? eq(aiUsageLog.userId, userId) : undefined
      )
    )
    .groupBy(sql`DATE(${aiUsageLog.createdAt})`)
    .orderBy(sql`DATE(${aiUsageLog.createdAt})`);

  return NextResponse.json({
    period,
    totals: {
      cost: Number(totals.totalCost),
      calls: Number(totals.totalCalls),
      avgCostPerCall:
        Number(totals.totalCalls) > 0
          ? Number(totals.totalCost) / Number(totals.totalCalls)
          : 0,
      inputTokens: Number(totals.totalInputTokens),
      outputTokens: Number(totals.totalOutputTokens),
      avgDurationMs: Number(totals.avgDurationMs),
    },
    breakdown: breakdownData,
    dailyTrend,
  });
}
