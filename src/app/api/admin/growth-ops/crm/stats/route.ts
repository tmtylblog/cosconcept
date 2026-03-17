/**
 * GET /api/admin/growth-ops/crm/stats
 *
 * Quick counts for the CRM dashboard header.
 * Auth: superadmin or growth_ops role.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCrmStats } from "@/lib/growth-ops/crm-queries";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getCrmStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[CRM] Stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
