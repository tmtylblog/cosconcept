import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, members } from "@/lib/db/schema";
import { readAllPreferences, INTERVIEW_FIELDS, LEGACY_INTERVIEW_FIELDS, isOnboardingComplete } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/status?organizationId={orgId}
 *
 * Returns onboarding completeness status:
 * - enrichmentComplete: whether firm has real enrichment data
 * - preferencesComplete: whether all partner preferences are stored (v2 5Q or v1 9Q)
 * - answeredCount: how many of the current interview fields are filled
 * - totalRequired: derived from INTERVIEW_FIELDS.length (v2 = 5)
 * - onboardingComplete: enrichmentComplete AND preferencesComplete
 * - missingFields: array of field names not yet answered
 */
export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    let organizationId = url.searchParams.get("organizationId");

    // Server-side fallback: resolve org from user's membership if not provided
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

    const totalRequired = INTERVIEW_FIELDS.length;

    if (!organizationId) {
      // Still no org — user genuinely has no membership yet
      return NextResponse.json({
        enrichmentComplete: false,
        preferencesComplete: false,
        answeredCount: 0,
        totalRequired,
        onboardingComplete: false,
        missingFields: [...INTERVIEW_FIELDS],
      });
    }

    // 1. Find the firm row
    const [firmRow] = await db
      .select({
        id: serviceFirms.id,
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
        entityType: serviceFirms.entityType,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (!firmRow) {
      return NextResponse.json({
        enrichmentComplete: false,
        preferencesComplete: false,
        answeredCount: 0,
        totalRequired,
        onboardingComplete: false,
        missingFields: [...INTERVIEW_FIELDS],
      });
    }

    // 2. Check enrichment completeness
    const enrichmentData = firmRow.enrichmentData as Record<string, unknown> | null;
    let enrichmentComplete = false;

    if (enrichmentData) {
      const companyData = enrichmentData.companyData as Record<string, unknown> | undefined;
      const classification = enrichmentData.classification as Record<string, unknown> | undefined;

      // Enrichment is complete if we have company name OR classification categories
      enrichmentComplete = !!(
        (companyData && companyData.name) ||
        (classification && Array.isArray(classification.categories) && classification.categories.length > 0)
      );
    }

    // 3. Check partner preferences completeness
    // Uses readAllPreferences() which checks JSONB first, then falls back to legacy columns
    const prefs = await readAllPreferences(firmRow.id);

    // Check v2 (new 5Q) fields
    const answeredFields: string[] = [];
    const missingFields: string[] = [];

    for (const field of INTERVIEW_FIELDS) {
      if (prefs[field] != null) {
        answeredFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    const answeredCount = answeredFields.length;
    // Accept EITHER v2 (5 new fields) OR v1 (9 legacy fields) as complete
    const preferencesComplete = isOnboardingComplete(prefs);

    // Brand/client entities skip the 9-question onboarding entirely
    const entityType = firmRow.entityType ?? "service_firm";
    const isBrandWaitlist = entityType === "potential_client" || entityType === "brand";

    // Gate is purely preferences-based for service firms.
    // Brand/client entities bypass the gate (they go straight to waitlist screen).
    const onboardingComplete = isBrandWaitlist || preferencesComplete;

    return NextResponse.json({
      enrichmentComplete,
      preferencesComplete,
      answeredCount,
      totalRequired,
      onboardingComplete,
      missingFields,
      entityType,
      isBrandWaitlist,
    });
  } catch (error) {
    console.error("[Onboarding/Status] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
