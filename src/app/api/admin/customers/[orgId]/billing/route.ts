import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { PlanId } from "@/lib/billing/plan-limits";

type Params = { params: Promise<{ orgId: string }> };

/** Verify superadmin access, return session or error response */
async function requireSuperadmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") {
    return null;
  }
  return session;
}

/**
 * GET /api/admin/customers/[orgId]/billing
 *
 * Returns subscription details, gift info, usage metrics, and billing history.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orgId } = await params;

  try {
    // Get subscription (including gift fields)
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
        gift_expires_at AS "giftExpiresAt",
        gift_return_plan AS "giftReturnPlan",
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

/**
 * PATCH /api/admin/customers/[orgId]/billing
 *
 * Admin-only: change subscription plan or grant a gift period.
 *
 * Body options:
 *   { action: "change_plan", plan: "free" | "pro" | "enterprise" }
 *   { action: "gift", plan: "pro" | "enterprise", months: 1-12, returnPlan: "free" | "pro" }
 *   { action: "revoke_gift" }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orgId } = await params;

  try {
    const body = await req.json();
    const { action } = body as { action: string };

    // Find or auto-create subscription
    let sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, orgId),
    });

    if (!sub) {
      // Auto-create a free subscription for this org
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      const newId = crypto.randomUUID();

      await db.insert(subscriptions).values({
        id: newId,
        organizationId: orgId,
        plan: "free",
        status: "active",
        stripeCustomerId: `pending_${orgId.slice(0, 8)}`,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.organizationId, orgId),
      });

      if (!sub) {
        return NextResponse.json(
          { error: "Failed to create subscription record" },
          { status: 500 }
        );
      }
    }

    if (action === "change_plan") {
      const { plan } = body as { plan: PlanId };
      if (!["free", "pro", "enterprise"].includes(plan)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }

      await db
        .update(subscriptions)
        .set({
          plan,
          status: "active",
          giftExpiresAt: null,
          giftReturnPlan: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, orgId));

      // Log the event
      await db.execute(sql`
        INSERT INTO subscription_events (id, stripe_event_id, event_type, organization_id, data)
        VALUES (
          ${crypto.randomUUID()},
          ${"admin_" + crypto.randomUUID().slice(0, 8)},
          'admin.plan_change',
          ${orgId},
          ${JSON.stringify({ plan, changedBy: "admin" })}::jsonb
        )
      `);

      return NextResponse.json({ success: true, plan, status: "active" });
    }

    if (action === "gift") {
      const { plan, months, returnPlan } = body as {
        plan: PlanId;
        months: number;
        returnPlan: PlanId;
      };

      if (!["pro", "enterprise"].includes(plan)) {
        return NextResponse.json({ error: "Gift plan must be pro or enterprise" }, { status: 400 });
      }
      if (!months || months < 1 || months > 12) {
        return NextResponse.json({ error: "Months must be 1-12" }, { status: 400 });
      }
      if (!["free", "pro"].includes(returnPlan)) {
        return NextResponse.json({ error: "Return plan must be free or pro" }, { status: 400 });
      }

      const giftExpiresAt = new Date();
      giftExpiresAt.setMonth(giftExpiresAt.getMonth() + months);

      await db
        .update(subscriptions)
        .set({
          plan,
          status: "active",
          giftExpiresAt,
          giftReturnPlan: returnPlan,
          currentPeriodStart: new Date(),
          currentPeriodEnd: giftExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, orgId));

      // Log the event
      await db.execute(sql`
        INSERT INTO subscription_events (id, stripe_event_id, event_type, organization_id, data)
        VALUES (
          ${crypto.randomUUID()},
          ${"admin_" + crypto.randomUUID().slice(0, 8)},
          'admin.gift_granted',
          ${orgId},
          ${JSON.stringify({ plan, months, returnPlan, giftExpiresAt: giftExpiresAt.toISOString(), changedBy: "admin" })}::jsonb
        )
      `);

      return NextResponse.json({
        success: true,
        plan,
        giftExpiresAt: giftExpiresAt.toISOString(),
        returnPlan,
      });
    }

    if (action === "revoke_gift") {
      const returnPlan = sub.giftReturnPlan ?? "free";

      await db
        .update(subscriptions)
        .set({
          plan: returnPlan,
          giftExpiresAt: null,
          giftReturnPlan: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, orgId));

      // Log the event
      await db.execute(sql`
        INSERT INTO subscription_events (id, stripe_event_id, event_type, organization_id, data)
        VALUES (
          ${crypto.randomUUID()},
          ${"admin_" + crypto.randomUUID().slice(0, 8)},
          'admin.gift_revoked',
          ${orgId},
          ${JSON.stringify({ returnedToPlan: returnPlan, changedBy: "admin" })}::jsonb
        )
      `);

      return NextResponse.json({ success: true, plan: returnPlan });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Admin] Billing update error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to update billing", detail: message },
      { status: 500 }
    );
  }
}
