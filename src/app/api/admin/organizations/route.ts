import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/organizations
 * Lists all organizations with their subscription info and member count.
 * Protected by middleware (superadmin only).
 */
export async function GET() {
  try {
    // Join organizations with subscriptions and count members
    const rows = await db.execute(sql`
      SELECT
        o.id,
        o.name,
        o.slug,
        COALESCE(s.plan, 'free') AS plan,
        COALESCE(s.status, 'active') AS status,
        (SELECT COUNT(*) FROM "member" m WHERE m."organization_id" = o.id)::int AS members,
        o."created_at" AS "createdAt"
      FROM "organization" o
      LEFT JOIN "subscriptions" s ON s."organization_id" = o.id
      ORDER BY o."created_at" DESC
    `);

    const organizations = rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      plan: r.plan,
      status: r.status,
      members: Number(r.members),
      createdAt: r.createdAt
        ? new Date(r.createdAt as string).toLocaleDateString()
        : "",
    }));

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("[Admin] Organizations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}
