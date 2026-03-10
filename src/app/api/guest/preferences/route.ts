import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { enrichmentCache } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/guest/preferences?domain=chameleoncollective.com
 *
 * Load guest preferences from the enrichment_cache table.
 * No auth required — keyed by domain.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain")?.toLowerCase().trim();

    if (!domain) {
      return NextResponse.json({ preferences: null });
    }

    const [row] = await db
      .select({ guestPreferences: enrichmentCache.guestPreferences })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);

    return NextResponse.json({
      preferences: row?.guestPreferences || null,
    });
  } catch (error) {
    console.error("[Guest/Preferences] GET error:", error);
    return NextResponse.json({ preferences: null });
  }
}

/**
 * POST /api/guest/preferences
 * Body: { domain: string, preferences: Record<string, string | string[]> }
 *
 * Save guest preferences to the enrichment_cache table.
 * Merges with existing preferences (doesn't overwrite everything).
 * No auth required — keyed by domain.
 */
export async function POST(req: Request) {
  try {
    const { domain: rawDomain, preferences } = await req.json();
    const domain = rawDomain?.toLowerCase().trim();

    if (!domain || !preferences || typeof preferences !== "object") {
      return NextResponse.json(
        { error: "domain and preferences are required" },
        { status: 400 }
      );
    }

    // Check if enrichment_cache row exists for this domain
    const [existing] = await db
      .select({
        id: enrichmentCache.id,
        guestPreferences: enrichmentCache.guestPreferences,
      })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);

    if (existing) {
      // Merge new preferences with existing ones
      const merged = { ...(existing.guestPreferences || {}), ...preferences };
      await db
        .update(enrichmentCache)
        .set({
          guestPreferences: merged,
          updatedAt: new Date(),
        })
        .where(eq(enrichmentCache.id, existing.id));
    } else {
      // Create a minimal enrichment_cache row just for preferences
      // (enrichment data will be filled when they do the enrichment flow)
      await db.insert(enrichmentCache).values({
        id: domain,
        domain,
        firmName: domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1),
        enrichmentData: {},
        guestPreferences: preferences,
        hitCount: 0,
      });
    }

    console.log(
      `[Guest/Preferences] Saved ${Object.keys(preferences).length} pref(s) for ${domain}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Guest/Preferences] POST error:", error);
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
