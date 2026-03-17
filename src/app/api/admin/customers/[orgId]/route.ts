import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/customers/[orgId]
 *
 * Consolidated customer data endpoint for the admin customer detail page.
 * Returns: org, firm, subscription, members, aggregate stats, enrichment summary.
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
    // 1. Organization
    const orgResult = await db.execute(sql`
      SELECT id, name, slug, logo, metadata, created_at AS "createdAt"
      FROM organizations
      WHERE id = ${orgId}
    `);

    if (orgResult.rows.length === 0) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const org = orgResult.rows[0];

    // 2. Service Firm linked to this org — pick the best record when multiple exist.
    // Multiple firms can exist (auto-created "Collective OS" + enriched real firm).
    // Score by data richness: clients > services > enriched status > real website.
    const firmResult = await db.execute(sql`
      SELECT
        id, name, website, description, firm_type AS "firmType",
        size_band AS "sizeBand", profile_completeness AS "profileCompleteness",
        enrichment_data AS "enrichmentData", enrichment_status AS "enrichmentStatus",
        graph_node_id AS "graphNodeId", is_cos_customer AS "isCosCustomer",
        entity_type AS "entityType",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM service_firms
      WHERE organization_id = ${orgId}
        AND id NOT LIKE 'firm_leg_%'
      ORDER BY
        CASE WHEN jsonb_array_length(COALESCE(enrichment_data->'extracted'->'clients', '[]'::jsonb)) > 0 THEN 100 ELSE 0 END
        + CASE WHEN jsonb_array_length(COALESCE(enrichment_data->'extracted'->'services', '[]'::jsonb)) > 0 THEN 50 ELSE 0 END
        + CASE WHEN enrichment_status = 'enriched' THEN 30 ELSE 0 END
        + CASE WHEN website IS NOT NULL AND website NOT LIKE '%joincollectiveos.com%' THEN 20 ELSE 0 END
        DESC
      LIMIT 1
    `);

    // Fallback: any firm for this org (including legacy)
    const firm = firmResult.rows[0]
      ?? (await db.execute(sql`
        SELECT
          id, name, website, description, firm_type AS "firmType",
          size_band AS "sizeBand", profile_completeness AS "profileCompleteness",
          enrichment_data AS "enrichmentData", enrichment_status AS "enrichmentStatus",
          graph_node_id AS "graphNodeId", is_cos_customer AS "isCosCustomer",
          entity_type AS "entityType",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM service_firms
        WHERE organization_id = ${orgId}
        ORDER BY created_at ASC
        LIMIT 1
      `)).rows[0]
      ?? null;

    // 3. Subscription
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

    // 4. Members with user details
    const membersResult = await db.execute(sql`
      SELECT
        m.id,
        m.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        u.image AS "userImage",
        u.banned,
        m.role,
        m.created_at AS "createdAt"
      FROM members m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId}
      ORDER BY m.created_at ASC
    `);

    // 5. Aggregate stats
    const firmId = firm?.id as string | undefined;

    // 5a. Legacy users linked through service_firms
    const legacyUsersResult = firmId
      ? await db.execute(sql`
          SELECT
            lu.id,
            lu.first_name AS "firstName",
            lu.last_name AS "lastName",
            lu.email,
            lu.title,
            lu.legacy_roles AS "legacyRoles",
            lu.created_at AS "createdAt"
          FROM legacy_users lu
          WHERE lu.firm_id = ${firmId}
            AND lu.migrated_at IS NULL
          ORDER BY lu.last_name ASC, lu.first_name ASC
        `)
      : { rows: [] };

    // Enrichment cost
    const enrichCostResult = firmId
      ? await db.execute(sql`
          SELECT
            COUNT(*)::int AS "totalEntries",
            COALESCE(SUM(cost_usd), 0) AS "totalCost",
            STRING_AGG(DISTINCT phase, ', ') AS phases,
            MAX(created_at) AS "lastEnriched"
          FROM enrichment_audit_log
          WHERE firm_id = ${firmId}
        `)
      : { rows: [{ totalEntries: 0, totalCost: 0, phases: null, lastEnriched: null }] };

    // AI cost for this org
    const aiCostResult = await db.execute(sql`
      SELECT COALESCE(SUM(cost_usd), 0) AS "totalCost"
      FROM ai_usage_log
      WHERE organization_id = ${orgId}
    `);

    // Message count
    const msgCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.organization_id = ${orgId}
    `);

    // Conversation count
    const convCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM conversations
      WHERE organization_id = ${orgId}
    `);

    // Case study count
    const caseCountResult = firmId
      ? await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM firm_case_studies
          WHERE firm_id = ${firmId}
        `)
      : { rows: [{ count: 0 }] };

    // Opportunity count
    const oppCountResult = firmId
      ? await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM opportunities
          WHERE firm_id = ${firmId}
        `)
      : { rows: [{ count: 0 }] };

    // Partnership count
    const partnerCountResult = firmId
      ? await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM partnerships
          WHERE firm_a_id = ${firmId} OR firm_b_id = ${firmId}
        `)
      : { rows: [{ count: 0 }] };

    const enrichRow = enrichCostResult.rows[0];

    return NextResponse.json({
      org,
      firm,
      subscription,
      members: membersResult.rows,
      legacyUsers: legacyUsersResult.rows,
      stats: {
        enrichmentCost: Number(enrichRow?.totalCost ?? 0),
        aiCost: Number(aiCostResult.rows[0]?.totalCost ?? 0),
        messageCount: Number(msgCountResult.rows[0]?.count ?? 0),
        conversationCount: Number(convCountResult.rows[0]?.count ?? 0),
        caseStudyCount: Number(caseCountResult.rows[0]?.count ?? 0),
        opportunityCount: Number(oppCountResult.rows[0]?.count ?? 0),
        partnershipCount: Number(partnerCountResult.rows[0]?.count ?? 0),
      },
      enrichment: {
        totalEntries: Number(enrichRow?.totalEntries ?? 0),
        totalCost: Number(enrichRow?.totalCost ?? 0),
        phases: (enrichRow?.phases as string)?.split(", ").filter(Boolean) ?? [],
        lastEnriched: enrichRow?.lastEnriched as string | null,
      },
    });
  } catch (error) {
    console.error("[Admin] Customer detail error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch customer details", detail: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const check = await db.execute(sql`SELECT id, name FROM organizations WHERE id = ${orgId} LIMIT 1`);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Delete the organization. FK cascades:
    //   members (cascade), invitations (cascade), subscriptions (cascade)
    //   service_firms.organization_id SET NULL — firm record stays for historical data
    // Members deletion cascades to their user sessions but NOT to the user records themselves.
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);

    return NextResponse.json({ success: true, deletedOrgId: orgId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to delete organization", detail: message }, { status: 500 });
  }
}
