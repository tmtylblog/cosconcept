/**
 * Expert Search — Query expert_profiles for Ossy's search_experts tool
 *
 * Returns shapes compatible with ExpertResultCard component.
 */

import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, ilike, or, sql, and, isNotNull } from "drizzle-orm";

export interface ExpertResult {
  name: string;
  title: string;
  firmName: string;
  skills: string[];
  linkedinUrl?: string | null;
  city?: string | null;
  country?: string | null;
  expertClassification?: string | null;
}

/**
 * Search for experts by query (matches title/headline) and optional skill filters.
 */
export async function searchExperts(params: {
  query: string;
  skills?: string[];
  limit?: number;
}): Promise<ExpertResult[]> {
  const { query, skills, limit = 10 } = params;
  const searchTerm = `%${query}%`;

  // Build conditions
  const conditions = [
    eq(expertProfiles.isPublic, true),
    isNotNull(expertProfiles.fullName),
    or(
      ilike(expertProfiles.title, searchTerm),
      ilike(expertProfiles.headline, searchTerm),
      ilike(expertProfiles.fullName, searchTerm),
      ilike(expertProfiles.bio, searchTerm)
    ),
  ];

  // If skills are specified, check JSONB overlap
  if (skills && skills.length > 0) {
    // top_skills JSONB array contains any of the requested skills (case-insensitive)
    const skillConditions = skills.map(
      (s) => sql`${expertProfiles.topSkills}::jsonb @> ${JSON.stringify([s])}::jsonb`
    );
    // Use OR so matching ANY skill qualifies
    conditions.push(sql`(${sql.join(skillConditions, sql` OR `)})`);
  }

  const rows = await db
    .select({
      fullName: expertProfiles.fullName,
      title: expertProfiles.title,
      headline: expertProfiles.headline,
      topSkills: expertProfiles.topSkills,
      linkedinUrl: expertProfiles.linkedinUrl,
      location: expertProfiles.location,
      division: expertProfiles.division,
      firmName: serviceFirms.name,
    })
    .from(expertProfiles)
    .innerJoin(serviceFirms, eq(expertProfiles.firmId, serviceFirms.id))
    .where(and(...conditions))
    .limit(limit);

  return rows.map((r) => {
    // Parse location into city/country
    const parts = r.location?.split(",").map((s) => s.trim()) ?? [];

    return {
      name: r.fullName ?? "Unknown",
      title: r.title ?? r.headline ?? "",
      firmName: r.firmName,
      skills: (r.topSkills as string[]) ?? [],
      linkedinUrl: r.linkedinUrl,
      city: parts[0] ?? null,
      country: parts[parts.length - 1] ?? null,
      expertClassification: r.division ?? null,
    };
  });
}
