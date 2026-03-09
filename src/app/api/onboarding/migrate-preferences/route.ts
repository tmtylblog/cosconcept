import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, organizations } from "@/lib/db/schema";
import { updateProfileField } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/migrate-preferences
 *
 * Migrates guest onboarding preferences to the database after authentication.
 * Called automatically when a guest user signs in and has cached preference data.
 */
export async function POST(req: Request) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { organizationId, preferences } = body as {
      organizationId: string;
      preferences: Record<string, string | string[]>;
    };

    if (!organizationId || !preferences || typeof preferences !== "object") {
      return NextResponse.json(
        { error: "Missing organizationId or preferences" },
        { status: 400 }
      );
    }

    const firmId = `firm_${organizationId}`;

    // Ensure serviceFirms row exists (create if missing)
    const [existingFirm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);

    if (!existingFirm) {
      // Get org name for the firm record
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId,
        name: org?.name || "Unknown Firm",
        enrichmentStatus: "pending",
      });

      console.log(`[Migration] Created serviceFirms row: ${firmId}`);
    }

    // Migrate each preference field
    const results: { field: string; success: boolean }[] = [];

    for (const [field, value] of Object.entries(preferences)) {
      try {
        await updateProfileField(firmId, field, value);
        results.push({ field, success: true });
      } catch (err) {
        console.error(`[Migration] Failed to migrate field ${field}:`, err);
        results.push({ field, success: false });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[Migration] Migrated ${successCount}/${results.length} preferences for ${firmId}`
    );

    return NextResponse.json({
      success: true,
      migrated: successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("[Migration] Preference migration error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
