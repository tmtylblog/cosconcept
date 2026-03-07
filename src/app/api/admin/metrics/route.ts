import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { PLAN_PRICES } from "@/lib/billing/plan-limits";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metrics
 * Platform-wide metrics for the admin dashboard.
 * Protected by middleware (superadmin only).
 */
export async function GET() {
  try {
    // Total orgs
    const orgCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "organization"`
    );
    const totalOrgs = Number(orgCount.rows[0]?.count ?? 0);

    // Total users
    const userCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "user"`
    );
    const totalUsers = Number(userCount.rows[0]?.count ?? 0);

    // Plan distribution
    const planRows = await db
      .select({
        plan: subscriptions.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.plan);

    const planDistribution: Record<string, number> = {
      free: 0,
      pro: 0,
      enterprise: 0,
    };
    for (const row of planRows) {
      planDistribution[row.plan] = Number(row.count);
    }

    // Active paid subscriptions
    const activeRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));
    const activeSubscriptions = Number(activeRows[0]?.count ?? 0);

    // Calculate MRR from plan distribution
    const mrr =
      (planDistribution.pro ?? 0) * PLAN_PRICES.pro.monthly +
      (planDistribution.enterprise ?? 0) * PLAN_PRICES.enterprise.monthly;

    return NextResponse.json({
      totalOrgs,
      totalUsers,
      activeSubscriptions,
      mrr,
      planDistribution,
    });
  } catch (error) {
    console.error("[Admin] Metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
