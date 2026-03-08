import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/organizations/[orgId]/details
 * Returns members, linked service firms, and enrichment summary.
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
    // Members
    const membersResult = await db.execute(sql`
      SELECT
        m.id,
        m.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        m.role
      FROM "members" m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId}
      ORDER BY m.created_at ASC
    `);

    // Service firms linked to this org
    const firmsResult = await db.execute(sql`
      SELECT
        sf.id,
        sf.name,
        sf.website,
        sf.firm_type AS "firmType",
        sf.size_band AS "sizeBand",
        sf.profile_completeness AS "profileCompleteness",
        sf.created_at AS "createdAt"
      FROM service_firms sf
      WHERE sf.organization_id = ${orgId}
      ORDER BY sf.created_at DESC
    `);

    // Enrichment stats per firm
    const firmIds = firmsResult.rows.map((f) => f.id);
    const enrichmentStats: Record<string, { entries: number; cost: number; phases: string[]; lastEnriched: string | null }> = {};

    if (firmIds.length > 0) {
      const enrichResult = await db.execute(sql`
        SELECT
          firm_id AS "firmId",
          COUNT(*)::int AS entries,
          COALESCE(SUM(cost_usd), 0) AS cost,
          STRING_AGG(DISTINCT phase, ', ') AS phases,
          MAX(created_at) AS "lastEnriched"
        FROM enrichment_audit_log
        WHERE firm_id = ANY(${firmIds})
        GROUP BY firm_id
      `);

      for (const row of enrichResult.rows) {
        enrichmentStats[row.firmId as string] = {
          entries: Number(row.entries),
          cost: Number(row.cost),
          phases: (row.phases as string)?.split(", ") ?? [],
          lastEnriched: row.lastEnriched as string | null,
        };
      }
    }

    return NextResponse.json({
      members: membersResult.rows,
      firms: firmsResult.rows,
      enrichmentStats,
    });
  } catch (error) {
    console.error("[Admin] Org details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch org details" },
      { status: 500 }
    );
  }
}
