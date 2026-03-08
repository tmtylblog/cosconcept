import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/partnerships/stats
 * Aggregated partnership, referral, and opportunity stats.
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
    const [partnershipCounts] = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested,
        COUNT(*) FILTER (WHERE status = 'requested')::int AS requested,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'declined')::int AS declined
      FROM partnerships
    `).then(r => [r.rows[0]]);

    const [referralCounts] = await db.execute(sql`
      SELECT
        COUNT(*)::int AS referrals,
        COUNT(*) FILTER (WHERE status = 'converted')::int AS "referralsConverted"
      FROM referrals
    `).then(r => [r.rows[0]]);

    const [opportunityCounts] = await db.execute(sql`
      SELECT COUNT(*)::int AS opportunities FROM opportunities
    `).then(r => [r.rows[0]]);

    return NextResponse.json({
      total: partnershipCounts?.total ?? 0,
      suggested: partnershipCounts?.suggested ?? 0,
      requested: partnershipCounts?.requested ?? 0,
      accepted: partnershipCounts?.accepted ?? 0,
      declined: partnershipCounts?.declined ?? 0,
      referrals: referralCounts?.referrals ?? 0,
      referralsConverted: referralCounts?.referralsConverted ?? 0,
      opportunities: opportunityCounts?.opportunities ?? 0,
    });
  } catch (error) {
    console.error("[Admin] Partnership stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
