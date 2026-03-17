/**
 * GET /api/admin/growth-ops/crm/people
 *
 * Paginated unified person list across all source tables.
 * Auth: superadmin or growth_ops role.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUnifiedPeople } from "@/lib/growth-ops/crm-queries";
import type { PersonEntityClass } from "@/lib/growth-ops/crm-types";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const result = await getUnifiedPeople({
      search: searchParams.get("search") || undefined,
      entityClass: (searchParams.get("entityClass") as PersonEntityClass | "all") || "all",
      companyDomain: searchParams.get("companyDomain") || undefined,
      sort: (searchParams.get("sort") as "name" | "created" | "activity" | "deals") || "name",
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") || "asc",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "100", 10),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CRM] People list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
