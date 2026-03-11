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
 *
 * Track A update: Counts now use canonical tables (serviceFirms, expertProfiles,
 * firmCaseStudies) instead of truncated imported_* tables.
 */
export async function GET() {
  try {
    // Total orgs
    const orgCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "organizations"`
    );
    const totalOrgs = Number(orgCount.rows[0]?.count ?? 0);

    // Total users
    const userCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "users"`
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

    // Service firms (canonical source)
    const firmCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "service_firms"`
    );
    const totalFirms = Number(firmCount.rows[0]?.count ?? 0);

    // Expert profiles (canonical source — replaces imported_contacts count)
    const expertCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "expert_profiles"`
    );
    const totalExperts = Number(expertCount.rows[0]?.count ?? 0);

    // Case studies (from firm_case_studies — auto-discovered from websites)
    const csCount = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM "firm_case_studies" WHERE status != 'deleted'`
    );
    const totalCaseStudies = Number(csCount.rows[0]?.count ?? 0);

    // Onboarding completion rate
    const onboardingResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT domain) FILTER (WHERE event = 'domain_entered')::int AS started,
        COUNT(DISTINCT domain) FILTER (WHERE event = 'all_questions_done')::int AS completed
      FROM onboarding_events
    `);
    const onboardingStarted = Number(onboardingResult.rows[0]?.started ?? 0);
    const onboardingCompleted = Number(onboardingResult.rows[0]?.completed ?? 0);

    return NextResponse.json({
      totalOrgs,
      totalUsers,
      activeSubscriptions,
      mrr,
      planDistribution,
      totalFirms,
      totalExperts,
      totalCaseStudies,
      onboarding: {
        started: onboardingStarted,
        completed: onboardingCompleted,
        rate: onboardingStarted > 0 ? onboardingCompleted / onboardingStarted : 0,
      },
    });
  } catch (error) {
    console.error("[Admin] Metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
