/**
 * GET /api/admin/calls/firms
 *
 * Returns all COS customer service firms for the transcript upload picker.
 * Auth: superadmin session required (inherits from /api/admin/* middleware gate).
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { eq, asc, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // Auth: superadmin only
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
    const firms = await db
      .select({
        id: serviceFirms.id,
        name: serviceFirms.name,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.isCosCustomer, true))
      .orderBy(asc(serviceFirms.name));

    // Filter out firms with no name
    const validFirms = firms.filter((f) => f.name && f.name.trim());

    return NextResponse.json({ firms: validFirms });
  } catch (error) {
    console.error("[Admin] Calls firms error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
