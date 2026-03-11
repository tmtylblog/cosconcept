/**
 * Firm Lookup — Query service_firms by name, domain, or ID
 *
 * Used by Ossy's `lookup_firm` and `get_my_profile` tools.
 * Returns a shape compatible with FirmDetailCard component.
 */

import { db } from "@/lib/db";
import { serviceFirms, expertProfiles, firmCaseStudies } from "@/lib/db/schema";
import { eq, ilike, or, sql, and } from "drizzle-orm";

export interface FirmDetail {
  found: boolean;
  name?: string;
  website?: string;
  description?: string;
  categories?: string[];
  industries?: string[];
  skills?: string[];
  markets?: string[];
  expertCount?: number;
  caseStudyCount?: number;
  clientCount?: number;
  message?: string;
}

/**
 * Look up a firm by name/domain or by ID.
 */
export async function lookupFirmDetail(
  query: string,
  options?: { byId?: boolean }
): Promise<FirmDetail> {
  // Find the firm
  const condition = options?.byId
    ? eq(serviceFirms.id, query)
    : or(
        ilike(serviceFirms.name, `%${query}%`),
        ilike(serviceFirms.website, `%${query}%`)
      );

  const [firm] = await db
    .select()
    .from(serviceFirms)
    .where(condition)
    .limit(1);

  if (!firm) {
    return { found: false, message: `No firm found matching "${query}".` };
  }

  // Parse enrichment data for classification
  const ed = firm.enrichmentData as Record<string, unknown> | null;
  const classification = ed?.classification as {
    categories?: string[];
    skills?: string[];
    industries?: string[];
    markets?: string[];
  } | null;

  // Count related experts and case studies
  const [counts] = await db
    .select({
      experts: sql<number>`(SELECT count(*) FROM expert_profiles WHERE firm_id = ${firm.id})`,
      caseStudies: sql<number>`(SELECT count(*) FROM firm_case_studies WHERE firm_id = ${firm.id} AND status = 'active')`,
    })
    .from(sql`(SELECT 1) AS _`);

  // Extract clients from ground truth
  const extracted = ed?.extracted as { clients?: { name: string }[] } | null;
  const clientCount = extracted?.clients?.length ?? 0;

  return {
    found: true,
    name: firm.name,
    website: firm.website ?? undefined,
    description: firm.description ?? undefined,
    categories: classification?.categories ?? [],
    industries: classification?.industries ?? [],
    skills: classification?.skills ?? [],
    markets: classification?.markets ?? [],
    expertCount: Number(counts?.experts ?? 0),
    caseStudyCount: Number(counts?.caseStudies ?? 0),
    clientCount,
  };
}
