/**
 * Layer 1 (PostgreSQL): Structured Filtering
 *
 * Replaces Neo4j Layer 1 with direct PostgreSQL queries.
 * Searches serviceFirms enrichmentData JSONB + abstractionProfiles
 * to find matching firms without requiring Neo4j.
 *
 * Used when NEO4J_URI is not configured or SEARCH_MODE=pg.
 */

import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import type { SearchFilters, MatchCandidate } from "./types";

interface PgCandidate {
  firmId: string;
  firmName: string;
  website: string | null;
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  topServices: string[];
  employeeCount: number | null;
  structuredScore: number;
}

/**
 * Layer 1: Filter firms using PostgreSQL JSONB queries.
 *
 * Searches enrichmentData->'classification' for category/skill/industry/market
 * matches. Returns up to `limit` candidates scored by filter match ratio.
 */
export async function pgStructuredFilter(
  filters: SearchFilters,
  limit = 500,
  excludeFirmId?: string,
): Promise<MatchCandidate[]> {
  // Fetch all enriched firms (we search classification JSONB in-app for flexibility)
  const conditions = [eq(serviceFirms.enrichmentStatus, "enriched")];

  if (excludeFirmId) {
    conditions.push(ne(serviceFirms.id, excludeFirmId));
  }

  const rows = await db
    .select({
      firmId: serviceFirms.id,
      firmName: serviceFirms.name,
      website: serviceFirms.website,
      enrichmentData: serviceFirms.enrichmentData,
      sizeBand: serviceFirms.sizeBand,
    })
    .from(serviceFirms)
    .where(and(...conditions));

  // Score each firm against the filters
  const candidates: PgCandidate[] = [];

  for (const row of rows) {
    const ed = row.enrichmentData as Record<string, unknown> | null;
    if (!ed) continue;

    const classification = ed.classification as {
      categories?: string[];
      skills?: string[];
      industries?: string[];
      markets?: string[];
    } | null;

    const companyData = ed.companyData as {
      employeeCount?: number;
    } | null;

    const extracted = ed.extracted as {
      services?: string[];
    } | null;

    const firmCategories = classification?.categories ?? [];
    const firmSkills = classification?.skills ?? [];
    const firmIndustries = classification?.industries ?? [];
    const firmMarkets = classification?.markets ?? [];
    const firmServices = extracted?.services ?? [];
    const employeeCount = companyData?.employeeCount ?? null;

    // Start with a baseline score — all enriched firms pass Layer 1.
    // Filters boost the score for ranking; they do NOT exclude firms.
    // This prevents empty results when taxonomy terms don't exact-match.
    let score = 0.1; // baseline so every enriched firm is a candidate
    let maxScore = 0.1;

    if (filters.categories?.length) {
      const matched = filters.categories.filter((c) =>
        firmCategories.some((fc) => fc.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(fc.toLowerCase()))
      );
      score += matched.length / filters.categories.length;
      maxScore += 1;
    }

    if (filters.skills?.length) {
      const matched = filters.skills.filter((s) =>
        firmSkills.some((fs) => fs.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(fs.toLowerCase()))
      );
      score += matched.length / filters.skills.length;
      maxScore += 1;
    }

    if (filters.industries?.length) {
      const matched = filters.industries.filter((i) =>
        firmIndustries.some((fi) => fi.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(fi.toLowerCase()))
      );
      score += matched.length / filters.industries.length;
      maxScore += 1;
    }

    if (filters.markets?.length) {
      const matched = filters.markets.filter((m) =>
        firmMarkets.some(
          (fm) =>
            fm.toLowerCase().includes(m.toLowerCase()) ||
            m.toLowerCase().includes(fm.toLowerCase())
        )
      );
      score += matched.length / filters.markets.length;
      maxScore += 1;
    }

    // Size band filter (exact match bonus)
    if (filters.sizeBand && row.sizeBand) {
      const sizeMap: Record<string, string[]> = {
        micro: ["individual", "micro_1_10"],
        small: ["small_11_50"],
        medium: ["emerging_51_200", "mid_201_500"],
        large: ["upper_mid_501_1000", "large_1001_5000", "major_5001_10000", "global_10000_plus"],
      };
      const matchSizes = sizeMap[filters.sizeBand] ?? [];
      if (matchSizes.includes(row.sizeBand)) {
        score += 0.5;
        maxScore += 0.5;
      }
    }

    const structuredScore = score / maxScore;

    // All enriched firms pass Layer 1 — filters rank, not exclude.
    // Vector search (Layer 2) will surface the most semantically relevant ones.
    {
      candidates.push({
        firmId: row.firmId,
        firmName: row.firmName,
        website: row.website,
        categories: firmCategories,
        skills: firmSkills,
        industries: firmIndustries,
        markets: firmMarkets,
        topServices: firmServices,
        employeeCount,
        structuredScore,
      });
    }
  }

  // Sort by score descending and limit
  candidates.sort((a, b) => b.structuredScore - a.structuredScore);
  const topCandidates = candidates.slice(0, limit);

  // Convert to MatchCandidate format
  return topCandidates.map((c) => ({
    firmId: c.firmId,
    firmName: c.firmName,
    totalScore: c.structuredScore,
    structuredScore: c.structuredScore,
    vectorScore: 0,
    preview: {
      categories: c.categories,
      topServices: c.topServices,
      topSkills: c.skills.slice(0, 10),
      industries: c.industries,
      employeeCount: c.employeeCount ?? undefined,
      website: c.website ?? undefined,
    },
  }));
}
