import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";
import { syncPreferenceFieldToGraph } from "@/lib/enrichment/preference-writer";

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

/**
 * @deprecated Column mapping kept only for backward-compatible READS.
 * All new WRITES go to rawOnboardingData JSONB.
 * These columns will be removed after Track A migration Phase E.
 */
export const LEGACY_COLUMN_MAP: Record<string, string> = {
  preferredPartnerTypes: "preferredFirmTypes",
  preferredPartnerSize: "preferredSizeBands",
  requiredPartnerIndustries: "preferredIndustries",
  preferredPartnerLocations: "preferredMarkets",
};

/**
 * All partner preference fields — now ALL stored in rawOnboardingData JSONB.
 * Consolidates the former dedicated-column fields and JSONB-only fields into
 * a single storage path for Track A alignment.
 *
 * Includes BOTH new (v2) and legacy (v1) field names so that reads work
 * for users onboarded under either flow.
 */
export const PREFERENCE_FIELDS = new Set([
  // ─── v2 interview fields (new 5-question flow) ───
  "partnershipPhilosophy",
  "capabilityGaps",
  "preferredPartnerTypes",  // shared with v1
  "dealBreaker",
  "geographyPreference",
  // ─── v1 legacy fields (old 9-question flow) ───
  "preferredPartnerSize",
  "requiredPartnerIndustries",
  "preferredPartnerLocations",
  "partnershipModels",
  "dealBreakers",
  "growthGoals",
  "desiredPartnerServices",
  "idealPartnerClientSize",
  "idealProjectSize",
  "typicalHourlyRates",
  "partnershipRole",
]);

/** @deprecated Use PREFERENCE_FIELDS instead. Alias for backward compatibility. */
export const RAW_ONBOARDING_FIELDS = PREFERENCE_FIELDS;

/** The 5 partner preference fields collected during the v2 onboarding interview */
export const INTERVIEW_FIELDS = [
  "partnershipPhilosophy",
  "capabilityGaps",
  "preferredPartnerTypes",
  "dealBreaker",
  "geographyPreference",
] as const;

/** @deprecated The 9 fields from the original v1 interview. Kept for backward-compat completion checks. */
export const LEGACY_INTERVIEW_FIELDS = [
  "desiredPartnerServices",
  "requiredPartnerIndustries",
  "idealPartnerClientSize",
  "preferredPartnerLocations",
  "preferredPartnerTypes",
  "preferredPartnerSize",
  "idealProjectSize",
  "typicalHourlyRates",
  "partnershipRole",
] as const;

/**
 * Check whether a user's preferences indicate completed onboarding.
 * Accepts EITHER the new 5-question v2 flow OR the legacy 9-question v1 flow.
 */
export function isOnboardingComplete(
  prefs: Record<string, unknown>
): boolean {
  const v2Done = INTERVIEW_FIELDS.every((f) => prefs[f] != null);
  const v1Done = LEGACY_INTERVIEW_FIELDS.every((f) => prefs[f] != null);
  return v2Done || v1Done;
}

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
  // v2 interview fields
  "partnershipPhilosophy",
  "capabilityGaps",
  "dealBreaker",
  "geographyPreference",
  // Shared between v1 & v2
  "preferredPartnerTypes",
  // v1 legacy preference fields
  "preferredPartnerSize",
  "requiredPartnerIndustries",
  "preferredPartnerLocations",
  "partnershipModels",
  "dealBreakers",
  "growthGoals",
  "desiredPartnerServices",
  "idealPartnerClientSize",
  "idealProjectSize",
  "typicalHourlyRates",
  "partnershipRole",
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
 * - All preference fields → partnerPreferences.rawOnboardingData (JSONB)
 *
 * Track A migration: ALL preference fields now write to rawOnboardingData JSONB.
 * The dedicated columns (preferredFirmTypes, preferredSizeBands, etc.) are
 * deprecated and will be removed. Reads still fall back to columns for
 * backward compatibility, but all new writes go to JSONB only.
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
    } else if (PREFERENCE_FIELDS.has(field)) {
      // Store ALL preference fields in partnerPreferences.rawOnboardingData JSONB
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
      // Fire-and-forget: sync preference to Neo4j graph edges
      // PG is source of truth — Neo4j failure doesn't break onboarding
      syncPreferenceFieldToGraph(firmId, field, value).catch((err) =>
        console.error(`[Profile] Neo4j sync failed for ${field}:`, err)
      );
    } else {
      throw new Error(`Unknown profile field: ${field}`);
    }

    return { success: true, field, value };
  } catch (err) {
    console.error(`[Profile] Failed to update ${field}:`, err);
    throw err;
  }
}

// ─── Read Helper ────────────────────────────────────────────

/**
 * Read all partner preference field values for a firm.
 * Checks rawOnboardingData JSONB first, then falls back to legacy dedicated
 * columns for backward compatibility with data stored before Track A.
 */
export async function readAllPreferences(
  firmId: string
): Promise<Record<string, string | string[]>> {
  const [prefRow] = await db
    .select()
    .from(partnerPreferences)
    .where(eq(partnerPreferences.firmId, firmId))
    .limit(1);

  if (!prefRow) return {};

  const rawData = (prefRow.rawOnboardingData as Record<string, unknown>) || {};
  const prefs: Record<string, string | string[]> = {};

  // Read each preference field: JSONB first, legacy column fallback
  for (const field of PREFERENCE_FIELDS) {
    // Check rawOnboardingData first (new canonical location)
    if (rawData[field] != null) {
      const v = rawData[field];
      if (Array.isArray(v) ? v.length > 0 : v !== "") {
        prefs[field] = v as string | string[];
        continue;
      }
    }

    // Fallback: check legacy dedicated columns
    const legacyCol = LEGACY_COLUMN_MAP[field];
    if (legacyCol) {
      const row = prefRow as Record<string, unknown>;
      const v = row[legacyCol];
      if (Array.isArray(v) ? v.length > 0 : v != null && v !== "") {
        prefs[field] = v as string | string[];
      }
    }
  }

  return prefs;
}
