import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences, members } from "@/lib/db/schema";
import { PARTNER_COLUMN_MAP, RAW_ONBOARDING_FIELDS } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

/**
 * The 9 required partner preference fields for onboarding completion.
 * Maps each field name to where it lives in the DB.
 */
const REQUIRED_PREF_FIELDS = [
  "desiredPartnerServices",     // rawOnboardingData
  "requiredPartnerIndustries",  // preferredIndustries column
  "idealPartnerClientSize",     // rawOnboardingData
  "preferredPartnerLocations",  // preferredMarkets column
  "preferredPartnerTypes",      // preferredFirmTypes column
  "preferredPartnerSize",       // preferredSizeBands column
  "idealProjectSize",           // rawOnboardingData
  "typicalHourlyRates",         // rawOnboardingData
  "partnershipRole",            // rawOnboardingData
] as const;

/**
 * GET /api/onboarding/status?organizationId={orgId}
 *
 * Returns onboarding completeness status:
 * - enrichmentComplete: whether firm has real enrichment data
 * - preferencesComplete: whether all 9 partner preferences are stored
 * - answeredCount: how many of the 9 are filled
 * - totalRequired: always 9
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

    if (!organizationId) {
      // Still no org — user genuinely has no membership yet
      return NextResponse.json({
        enrichmentComplete: false,
        preferencesComplete: false,
        answeredCount: 0,
        totalRequired: 9,
        onboardingComplete: false,
        missingFields: [...REQUIRED_PREF_FIELDS],
      });
    }

    // 1. Find the firm row
    const [firmRow] = await db
      .select({
        id: serviceFirms.id,
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (!firmRow) {
      return NextResponse.json({
        enrichmentComplete: false,
        preferencesComplete: false,
        answeredCount: 0,
        totalRequired: 9,
        onboardingComplete: false,
        missingFields: [...REQUIRED_PREF_FIELDS],
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
    const [prefRow] = await db
      .select({
        preferredFirmTypes: partnerPreferences.preferredFirmTypes,
        preferredSizeBands: partnerPreferences.preferredSizeBands,
        preferredIndustries: partnerPreferences.preferredIndustries,
        preferredMarkets: partnerPreferences.preferredMarkets,
        rawOnboardingData: partnerPreferences.rawOnboardingData,
      })
      .from(partnerPreferences)
      .where(eq(partnerPreferences.firmId, firmRow.id))
      .limit(1);

    const answeredFields: string[] = [];
    const missingFields: string[] = [];

    for (const field of REQUIRED_PREF_FIELDS) {
      let hasValue = false;

      if (RAW_ONBOARDING_FIELDS.has(field)) {
        // Check in rawOnboardingData JSONB
        const raw = prefRow?.rawOnboardingData as Record<string, unknown> | null;
        if (raw && raw[field] != null) {
          const v = raw[field];
          hasValue = Array.isArray(v) ? v.length > 0 : v !== "";
        }
      } else if (PARTNER_COLUMN_MAP[field]) {
        // Check dedicated column
        const dbColumn = PARTNER_COLUMN_MAP[field];
        const row = prefRow as Record<string, unknown> | undefined;
        if (row) {
          // Map DB column names back to the row keys
          const columnToKey: Record<string, string> = {
            preferredFirmTypes: "preferredFirmTypes",
            preferredSizeBands: "preferredSizeBands",
            preferredIndustries: "preferredIndustries",
            preferredMarkets: "preferredMarkets",
          };
          const key = columnToKey[dbColumn];
          if (key) {
            const v = row[key];
            hasValue = Array.isArray(v) ? v.length > 0 : v != null && v !== "";
          }
        }
      }

      if (hasValue) {
        answeredFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    const answeredCount = answeredFields.length;
    const preferencesComplete = answeredCount >= 9;
    const onboardingComplete = enrichmentComplete && preferencesComplete;

    return NextResponse.json({
      enrichmentComplete,
      preferencesComplete,
      answeredCount,
      totalRequired: 9,
      onboardingComplete,
      missingFields,
    });
  } catch (error) {
    console.error("[Onboarding/Status] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
