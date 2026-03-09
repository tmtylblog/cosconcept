import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";

// ─── Field Classification Constants ────────────────────────

/** Fields that map to serviceFirms.enrichmentData.confirmed */
export const FIRM_FIELDS = new Set([
  "firmCategory",
  "services",
  "clients",
  "skills",
  "markets",
  "languages",
  "industries",
]);

/** Column mapping for partner preference fields → DB columns */
export const PARTNER_COLUMN_MAP: Record<string, string> = {
  preferredPartnerTypes: "preferredFirmTypes",
  preferredPartnerSize: "preferredSizeBands",
  requiredPartnerIndustries: "preferredIndustries",
  preferredPartnerLocations: "preferredMarkets",
  partnershipModels: "partnershipModels",
  dealBreakers: "dealBreakers",
  growthGoals: "growthGoals",
};

/** Fields stored in partnerPreferences.rawOnboardingData JSONB (no dedicated column) */
export const RAW_ONBOARDING_FIELDS = new Set([
  "desiredPartnerServices",
  "idealPartnerClientSize",
  "idealProjectSize",
  "typicalHourlyRates",
]);

/** All valid profile field names */
export const ALL_PROFILE_FIELDS = [
  // Firm profile (confirm enrichment)
  "firmCategory",
  "services",
  "clients",
  "skills",
  "markets",
  "languages",
  "industries",
  // Partner preferences (dedicated columns)
  "preferredPartnerTypes",
  "preferredPartnerSize",
  "requiredPartnerIndustries",
  "preferredPartnerLocations",
  "partnershipModels",
  "dealBreakers",
  "growthGoals",
  // Partner criteria (stored in rawOnboardingData JSONB)
  "desiredPartnerServices",
  "idealPartnerClientSize",
  "idealProjectSize",
  "typicalHourlyRates",
] as const;

export type ProfileFieldName = (typeof ALL_PROFILE_FIELDS)[number];

/** Generate a short unique ID */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Core Update Function ──────────────────────────────────

/**
 * Persist a confirmed profile field to the appropriate DB table.
 * - Firm fields → serviceFirms.enrichmentData.confirmed
 * - Raw onboarding fields → partnerPreferences.rawOnboardingData (JSONB)
 * - Partner preference fields → partnerPreferences dedicated columns
 *
 * Used by both the Ossy `update_profile` tool (real-time during chat)
 * and the guest→auth migration endpoint (batch persist).
 */
export async function updateProfileField(
  firmId: string,
  field: string,
  value: string | string[]
): Promise<{ success: boolean; field: string; value: string | string[] }> {
  try {
    if (FIRM_FIELDS.has(field)) {
      // Merge into serviceFirms.enrichmentData under a "confirmed" key
      const [firm] = await db
        .select({ enrichmentData: serviceFirms.enrichmentData })
        .from(serviceFirms)
        .where(eq(serviceFirms.id, firmId))
        .limit(1);

      const existing = (firm?.enrichmentData as Record<string, unknown>) || {};
      const confirmed = (existing.confirmed as Record<string, unknown>) || {};
      confirmed[field] = value;

      await db
        .update(serviceFirms)
        .set({
          enrichmentData: { ...existing, confirmed },
          updatedAt: new Date(),
        })
        .where(eq(serviceFirms.id, firmId));
    } else if (RAW_ONBOARDING_FIELDS.has(field)) {
      // Store in partnerPreferences.rawOnboardingData JSONB
      const [existing] = await db
        .select({
          id: partnerPreferences.id,
          rawOnboardingData: partnerPreferences.rawOnboardingData,
        })
        .from(partnerPreferences)
        .where(eq(partnerPreferences.firmId, firmId))
        .limit(1);

      const rawData =
        (existing?.rawOnboardingData as Record<string, unknown>) || {};
      rawData[field] = value;

      if (existing) {
        await db
          .update(partnerPreferences)
          .set({ rawOnboardingData: rawData, updatedAt: new Date() })
          .where(eq(partnerPreferences.firmId, firmId));
      } else {
        await db.insert(partnerPreferences).values({
          id: uid("pref"),
          firmId,
          rawOnboardingData: rawData,
        });
      }
    } else {
      // Upsert into partnerPreferences table (dedicated column)
      const dbColumn = PARTNER_COLUMN_MAP[field] || field;
      const [existing] = await db
        .select({ id: partnerPreferences.id })
        .from(partnerPreferences)
        .where(eq(partnerPreferences.firmId, firmId))
        .limit(1);

      if (existing) {
        await db
          .update(partnerPreferences)
          .set({
            [dbColumn]: value,
            updatedAt: new Date(),
          })
          .where(eq(partnerPreferences.firmId, firmId));
      } else {
        await db.insert(partnerPreferences).values({
          id: uid("pref"),
          firmId,
          [dbColumn]: value,
        });
      }
    }

    return { success: true, field, value };
  } catch (err) {
    console.error(`[Profile] Failed to update ${field}:`, err);
    throw err;
  }
}
