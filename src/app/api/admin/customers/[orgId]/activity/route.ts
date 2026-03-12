import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/customers/[orgId]/activity
 *
 * Mixed activity timeline merging: conversations, ai_usage_log,
 * enrichment_audit_log, onboarding_events.
 *
 * Query params:
 *   type  — filter by event type (default: "all")
 *   page  — pagination (default: 1)
 *   limit — items per page (default: 50, max 100)
 */
export async function GET(
  req: NextRequest,
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
  const url = new URL(req.url);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  try {
    // Get the firm ID for this org (for enrichment/opportunity queries)
    const firmResult = await db.execute(sql`
      SELECT id FROM service_firms WHERE organization_id = ${orgId} LIMIT 1
    `);
    const firmId = firmResult.rows[0]?.id as string | undefined;

    // Build UNION ALL query for mixed timeline
    const parts: string[] = [];
    const queryParams: Record<string, unknown> = { orgId, firmId, lim: limit + 1, off: offset };

    if (typeFilter === "all" || typeFilter === "conversation") {
      parts.push(`
        SELECT
          'conversation' AS type,
          c.created_at AS timestamp,
          COALESCE(c.title, 'Untitled conversation') AS title,
          c.mode || ' · ' || COALESCE(u.name, u.email) AS detail,
          u.name AS "userName",
          jsonb_build_object('conversationId', c.id, 'mode', c.mode) AS metadata
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        WHERE c.organization_id = '${orgId}'
      `);
    }

    if (typeFilter === "all" || typeFilter === "ai_usage") {
      parts.push(`
        SELECT
          'ai_usage' AS type,
          a.created_at AS timestamp,
          a.feature || ' (' || a.model || ')' AS title,
          COALESCE(a.input_tokens::text, '0') || ' in / ' || COALESCE(a.output_tokens::text, '0') || ' out · $' || COALESCE(ROUND(a.cost_usd::numeric, 4)::text, '0') AS detail,
          u.name AS "userName",
          jsonb_build_object('model', a.model, 'feature', a.feature, 'cost', a.cost_usd) AS metadata
        FROM ai_usage_log a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.organization_id = '${orgId}'
      `);
    }

    if ((typeFilter === "all" || typeFilter === "enrichment") && firmId) {
      parts.push(`
        SELECT
          'enrichment' AS type,
          e.created_at AS timestamp,
          e.phase || ' enrichment' AS title,
          e.source || ' · ' || e.status || CASE WHEN e.cost_usd > 0 THEN ' · $' || ROUND(e.cost_usd::numeric, 4)::text ELSE '' END AS detail,
          NULL AS "userName",
          jsonb_build_object('phase', e.phase, 'status', e.status, 'cost', e.cost_usd) AS metadata
        FROM enrichment_audit_log e
        WHERE e.firm_id = '${firmId}'
      `);
    }

    if (typeFilter === "all" || typeFilter === "onboarding") {
      parts.push(`
        SELECT
          'onboarding' AS type,
          o.created_at AS timestamp,
          o.stage AS title,
          o.event AS detail,
          u.name AS "userName",
          COALESCE(o.metadata, '{}'::jsonb) AS metadata
        FROM onboarding_events o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.organization_id = '${orgId}'
      `);
    }

    if (parts.length === 0) {
      return NextResponse.json({ events: [], hasMore: false });
    }

    // Use parameterized query with sql template
    const unionQuery = parts.join(" UNION ALL ");
    const fullQuery = `
      SELECT * FROM (${unionQuery}) AS combined
      ORDER BY timestamp DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    const result = await db.execute(sql.raw(fullQuery));
    const hasMore = result.rows.length > limit;
    const events = result.rows.slice(0, limit);

    return NextResponse.json({ events, hasMore });
  } catch (error) {
    console.error("[Admin] Customer activity error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch activity", detail: message },
      { status: 500 }
    );
  }
}
