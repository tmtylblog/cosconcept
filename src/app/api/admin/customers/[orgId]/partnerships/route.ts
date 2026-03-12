import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/customers/[orgId]/partnerships
 *
 * Returns partnerships, opportunities, and leads for this customer's firm.
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
    // Get firm ID
    const firmResult = await db.execute(sql`
      SELECT id FROM service_firms WHERE organization_id = ${orgId} LIMIT 1
    `);
    const firmId = firmResult.rows[0]?.id as string | undefined;

    if (!firmId) {
      return NextResponse.json({ partnerships: [], opportunities: [], leads: [] });
    }

    // Partnerships
    const partnershipsResult = await db.execute(sql`
      SELECT
        p.id, p.status, p.type,
        p.match_score AS "matchScore",
        p.match_explanation AS "matchExplanation",
        p.created_at AS "createdAt",
        p.accepted_at AS "acceptedAt",
        CASE
          WHEN p.firm_a_id = ${firmId} THEN sf_b.name
          ELSE sf_a.name
        END AS "partnerFirmName",
        CASE
          WHEN p.firm_a_id = ${firmId} THEN sf_b.website
          ELSE sf_a.website
        END AS "partnerFirmWebsite"
      FROM partnerships p
      LEFT JOIN service_firms sf_a ON sf_a.id = p.firm_a_id
      LEFT JOIN service_firms sf_b ON sf_b.id = p.firm_b_id
      WHERE p.firm_a_id = ${firmId} OR p.firm_b_id = ${firmId}
      ORDER BY p.created_at DESC
      LIMIT 50
    `);

    // Opportunities
    const opportunitiesResult = await db.execute(sql`
      SELECT
        id, title, status, priority,
        estimated_value AS "estimatedValue",
        signal_type AS "signalType",
        client_name AS "clientName",
        created_at AS "createdAt"
      FROM opportunities
      WHERE firm_id = ${firmId}
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Leads
    const leadsResult = await db.execute(sql`
      SELECT
        id, title, status,
        estimated_value AS "estimatedValue",
        client_name AS "clientName",
        quality_score AS "qualityScore",
        created_at AS "createdAt"
      FROM leads
      WHERE firm_id = ${firmId}
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return NextResponse.json({
      partnerships: partnershipsResult.rows,
      opportunities: opportunitiesResult.rows,
      leads: leadsResult.rows,
    });
  } catch (error) {
    console.error("[Admin] Customer partnerships error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch partnerships", detail: message },
      { status: 500 }
    );
  }
}
