import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/partnerships
 * Lists all partnerships with firm names.
 * Protected: requires superadmin session.
 */
export async function GET() {
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

  try {
    const rows = await db.execute(sql`
      SELECT
        p.id,
        fa.name AS "firmAName",
        fb.name AS "firmBName",
        p.status,
        p.type,
        p.match_score AS "matchScore",
        p.match_explanation AS "matchExplanation",
        p.created_at AS "createdAt",
        p.accepted_at AS "acceptedAt"
      FROM partnerships p
      LEFT JOIN service_firms fa ON fa.id = p.firm_a_id
      LEFT JOIN service_firms fb ON fb.id = p.firm_b_id
      ORDER BY p.created_at DESC
      LIMIT 200
    `);

    return NextResponse.json({ partnerships: rows.rows });
  } catch (error) {
    console.error("[Admin] Partnerships error:", error);
    return NextResponse.json(
      { error: "Failed to fetch partnerships" },
      { status: 500 }
    );
  }
}
