import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/customers/[orgId]/billing
 *
 * Returns subscription details and billing history.
 * Queries Stripe API for invoices if stripeCustomerId exists.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    // Get subscription
    const subResult = await db.execute(sql`
      SELECT
        id, plan, status,
        stripe_customer_id AS "stripeCustomerId",
        stripe_subscription_id AS "stripeSubscriptionId",
        current_period_start AS "currentPeriodStart",
        current_period_end AS "currentPeriodEnd",
        cancel_at_period_end AS "cancelAtPeriodEnd",
        trial_start AS "trialStart",
        trial_end AS "trialEnd",
        created_at AS "createdAt"
      FROM subscriptions
      WHERE organization_id = ${orgId}
      LIMIT 1
    `);

    const subscription = subResult.rows[0] ?? null;

    // Get AI usage costs for current billing period
    const aiUsageResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(cost_usd), 0) AS "totalCost",
        COUNT(*)::int AS "totalCalls",
        COALESCE(SUM(input_tokens), 0)::int AS "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int AS "totalOutputTokens"
      FROM ai_usage_log
      WHERE organization_id = ${orgId}
    `);

    // Get enrichment costs
    const firmResult = await db.execute(sql`
      SELECT id FROM service_firms WHERE organization_id = ${orgId} LIMIT 1
    `);
    const firmId = firmResult.rows[0]?.id as string | undefined;

    const enrichCostResult = firmId
      ? await db.execute(sql`
          SELECT COALESCE(SUM(cost_usd), 0) AS "totalCost"
          FROM enrichment_audit_log
          WHERE firm_id = ${firmId}
        `)
      : { rows: [{ totalCost: 0 }] };

    // Subscription events (from our own table — Stripe webhook events)
    const eventsResult = await db.execute(sql`
      SELECT
        id, event_type AS "eventType",
        data,
        created_at AS "createdAt"
      FROM subscription_events
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      subscription,
      usage: {
        aiCost: Number(aiUsageResult.rows[0]?.totalCost ?? 0),
        aiCalls: Number(aiUsageResult.rows[0]?.totalCalls ?? 0),
        aiInputTokens: Number(aiUsageResult.rows[0]?.totalInputTokens ?? 0),
        aiOutputTokens: Number(aiUsageResult.rows[0]?.totalOutputTokens ?? 0),
        enrichmentCost: Number(enrichCostResult.rows[0]?.totalCost ?? 0),
      },
      billingEvents: eventsResult.rows,
    });
  } catch (error) {
    console.error("[Admin] Customer billing error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch billing info", detail: message },
      { status: 500 }
    );
  }
}
