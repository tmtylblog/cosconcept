import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
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

  const { userId } = await params;

  try {
    // 1. Core user
    const userResult = await db.execute(sql`
      SELECT
        id, name, email, email_verified AS "emailVerified",
        image, job_title AS "jobTitle", phone, linkedin_url AS "linkedinUrl",
        role, banned, ban_reason AS "banReason",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0] as {
      id: string; name: string; email: string; emailVerified: boolean;
      image: string | null; jobTitle: string | null; phone: string | null;
      linkedinUrl: string | null; role: string; banned: boolean;
      banReason: string | null; createdAt: string; updatedAt: string;
    };

    // 2. Org membership
    const memberResult = await db.execute(sql`
      SELECT
        m.id AS "memberId",
        m.role AS "memberRole",
        m.created_at AS "memberSince",
        o.id AS "orgId",
        o.name AS "orgName",
        o.slug AS "orgSlug"
      FROM members m
      JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ${userId}
      ORDER BY m.created_at DESC
      LIMIT 1
    `);

    const membership = memberResult.rows[0] as {
      memberId: string; memberRole: string; memberSince: string;
      orgId: string; orgName: string; orgSlug: string;
    } | undefined;

    // 3. Firm + subscription (only if we have an org)
    let firm = null;
    let subscription = null;

    if (membership?.orgId) {
      const firmResult = await db.execute(sql`
        SELECT
          id, name, website, firm_type AS "firmType",
          size_band AS "sizeBand", enrichment_status AS "enrichmentStatus",
          profile_completeness AS "profileCompleteness",
          is_cos_customer AS "isCosCustomer", created_at AS "createdAt"
        FROM service_firms
        WHERE organization_id = ${membership.orgId}
        LIMIT 1
      `);
      firm = firmResult.rows[0] ?? null;

      const subResult = await db.execute(sql`
        SELECT
          plan, status,
          current_period_end AS "currentPeriodEnd",
          cancel_at_period_end AS "cancelAtPeriodEnd",
          trial_end AS "trialEnd"
        FROM subscriptions
        WHERE organization_id = ${membership.orgId}
        LIMIT 1
      `);
      subscription = subResult.rows[0] ?? null;
    }

    // 4. Expert profile (by userId or email)
    const expertResult = await db.execute(sql`
      SELECT
        ep.id, ep.full_name AS "fullName",
        ep.first_name AS "firstName", ep.last_name AS "lastName",
        ep.title, ep.division, ep.photo_url AS "photoUrl",
        ep.linkedin_url AS "linkedinUrl",
        ep.profile_completeness AS "profileCompleteness",
        ep.pdl_enriched_at AS "pdlEnrichedAt",
        COUNT(sp.id)::int AS "specialistProfileCount"
      FROM expert_profiles ep
      LEFT JOIN specialist_profiles sp ON sp.expert_profile_id = ep.id
      WHERE ep.user_id = ${userId}
         OR LOWER(ep.email) = LOWER(${user.email})
      GROUP BY ep.id
      LIMIT 1
    `);
    const expertProfile = expertResult.rows[0] ?? null;

    // 5. Aggregate stats
    const statsResult = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM conversations WHERE user_id = ${userId}) AS "conversationCount",
        (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ${userId}) AS "messageCount",
        (SELECT COALESCE(SUM(cost_usd), 0)::float FROM ai_usage_log WHERE user_id = ${userId}) AS "aiCostTotal",
        (SELECT COUNT(*)::int FROM ai_usage_log WHERE user_id = ${userId}) AS "aiCallCount",
        (SELECT COUNT(*)::int FROM memory_entries WHERE user_id = ${userId}) AS "memoryCount",
        (SELECT MAX(created_at) FROM conversations WHERE user_id = ${userId}) AS "lastConversationAt",
        (SELECT MAX(created_at) FROM ai_usage_log WHERE user_id = ${userId}) AS "lastAiCallAt"
    `);
    const stats = statsResult.rows[0] ?? {
      conversationCount: 0, messageCount: 0, aiCostTotal: 0,
      aiCallCount: 0, memoryCount: 0, lastConversationAt: null, lastAiCallAt: null,
    };

    // 6. Recent sessions
    const sessionsResult = await db.execute(sql`
      SELECT
        ip_address AS "ipAddress",
        user_agent AS "userAgent",
        created_at AS "createdAt",
        expires_at AS "expiresAt"
      FROM sessions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 5
    `);

    return NextResponse.json({
      user,
      membership: membership ?? null,
      firm,
      subscription,
      expertProfile,
      stats,
      recentSessions: sessionsResult.rows,
    });
  } catch (error) {
    console.error("[Admin] User detail error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to fetch user", detail: message }, { status: 500 });
  }
}
