import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, members } from "@/lib/db/schema";
import {
  updateProfileField,
  ALL_PROFILE_FIELDS,
} from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

const VALID_FIELDS = new Set<string>(ALL_PROFILE_FIELDS);

/**
 * POST /api/profile/update
 *
 * Persists a single profile field (firm data or partner preference).
 * Accepts: { field: string, value: string | string[], organizationId?: string }
 *
 * Uses the shared `updateProfileField()` function which routes to the correct
 * DB table/column based on field name.
 */
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { field, value } = body;
    let { organizationId } = body;

    // Validate field name
    if (!field || !VALID_FIELDS.has(field)) {
      return NextResponse.json(
        { error: `Invalid field: ${field}` },
        { status: 400 }
      );
    }

    // Validate value
    if (value === undefined || value === null) {
      return NextResponse.json(
        { error: "Value is required" },
        { status: 400 }
      );
    }

    // Resolve organizationId from session membership if not provided
    if (!organizationId && session.user.id) {
      try {
        const [membership] = await db
          .select({ orgId: members.organizationId })
          .from(members)
          .where(eq(members.userId, session.user.id))
          .limit(1);
        if (membership) {
          organizationId = membership.orgId;
        }
      } catch {
        // Non-critical
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // Resolve firmId from organizationId
    const [firm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (!firm) {
      return NextResponse.json(
        { error: "No firm found for this organization" },
        { status: 404 }
      );
    }

    // Persist the field
    const result = await updateProfileField(firm.id, field, value);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Profile/Update] Error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
