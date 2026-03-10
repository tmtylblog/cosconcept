import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, organizations } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/ensure-org
 *
 * Ensures that an authenticated user has an organization and a serviceFirms row.
 * Called automatically by the layout when a user logs in but has no activeOrg.
 *
 * This is the "unclaimed org" concept — the moment someone authenticates,
 * an org + firm exists so ALL data (enrichment, preferences, etc.) is
 * stored from the very first interaction. The org transitions from
 * "onboarding" to "fully claimed" once onboarding completes.
 *
 * Takes: { organizationId } — the org ID just created/found by the client
 * Creates serviceFirms row if it doesn't exist.
 * Returns: { firmId, created }
 */
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId } = (await req.json()) as { organizationId: string };

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId" },
        { status: 400 }
      );
    }

    // Check if serviceFirms row already exists for this org
    const [existingFirm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (existingFirm) {
      return NextResponse.json({
        firmId: existingFirm.id,
        created: false,
      });
    }

    // Get org name for the firm record
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const firmId = `firm_${organizationId}`;

    await db.insert(serviceFirms).values({
      id: firmId,
      organizationId,
      name: org?.name || "Unknown Firm",
      enrichmentStatus: "pending",
    });

    console.log(`[EnsureOrg] Created serviceFirms row: ${firmId} for org ${organizationId}`);

    return NextResponse.json({
      firmId,
      created: true,
    });
  } catch (error) {
    console.error("[EnsureOrg] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
