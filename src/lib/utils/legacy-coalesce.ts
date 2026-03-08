/**
 * Legacy Data COALESCE Utility
 *
 * Provides fallback logic for imported data:
 * 1. Primary field (filled by COS enrichment)
 * 2. Legacy data field (from n8n import)
 *
 * This ensures the system always shows the best available data.
 */

/**
 * Returns the primary value if present, otherwise falls back to a legacy data field.
 *
 * @param primary - The primary (COS-enriched) value
 * @param legacyData - The full legacy_data jsonb blob
 * @param legacyKey - Dot-notation key path into legacyData (e.g., "research.exec_summary")
 */
export function coalesce<T>(
  primary: T | null | undefined,
  legacyData: Record<string, unknown> | null | undefined,
  legacyKey: string
): T | null {
  // Return primary if it has a value
  if (primary !== null && primary !== undefined && primary !== "") {
    return primary;
  }

  // Fall back to legacy data
  if (!legacyData) return null;

  // Support dot-notation paths
  const keys = legacyKey.split(".");
  let value: unknown = legacyData;

  for (const key of keys) {
    if (value === null || value === undefined || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[key];
  }

  if (value === null || value === undefined || value === "") return null;
  return value as T;
}

/**
 * Get the best available description for a company.
 * Checks: description → legacy exec_summary → legacy description
 */
export function getCompanyDescription(company: {
  description: string | null;
  legacyData: Record<string, unknown> | null;
}): string | null {
  return (
    coalesce(company.description, company.legacyData, "description") ??
    coalesce(null, company.legacyData, "research.exec_summary") ??
    coalesce(null, company.legacyData, "exec_summary")
  );
}

/**
 * Get the best available location for a company.
 * Checks: location → legacy location parts
 */
export function getCompanyLocation(company: {
  location: string | null;
  legacyData: Record<string, unknown> | null;
}): string | null {
  if (company.location) return company.location;

  const city = coalesce<string>(null, company.legacyData, "location_city");
  const state = coalesce<string>(null, company.legacyData, "location_state");
  const country = coalesce<string>(null, company.legacyData, "country");

  const parts = [city, state, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Get the last researched timestamp from meta.
 */
export function getLastResearched(meta: Record<string, unknown> | null): Date | null {
  if (!meta) return null;
  const ts = meta.lastResearchedAt as string | undefined;
  if (!ts) return null;
  const date = new Date(ts);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get legacy research data if available.
 */
export function getLegacyResearch(legacyData: Record<string, unknown> | null): {
  execSummary?: string;
  keyMarkets?: string;
  keyLeadership?: string[];
  investmentThesis?: string;
  activityInsight?: string;
} | null {
  if (!legacyData) return null;

  const research = legacyData.research as Record<string, unknown> | undefined;
  if (!research) return null;

  return {
    execSummary: research.exec_summary as string | undefined,
    keyMarkets: research.key_markets as string | undefined,
    keyLeadership: research.key_leadership as string[] | undefined,
    investmentThesis: research.investment_thesis_insight as string | undefined,
    activityInsight: research.activity_insight as string | undefined,
  };
}
