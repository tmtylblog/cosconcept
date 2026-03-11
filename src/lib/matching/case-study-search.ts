/**
 * Case Study Search — Query firm_case_studies for Ossy's search_case_studies tool
 *
 * Returns shapes compatible with CaseStudyCard component.
 */

import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms } from "@/lib/db/schema";
import { eq, ilike, or, sql, and } from "drizzle-orm";

export interface CaseStudyResult {
  title: string;
  firmName: string;
  clientName?: string | null;
  skills: string[];
  industries: string[];
  summary: string;
}

/**
 * Search for case studies by query and optional skill/industry filters.
 */
export async function searchCaseStudies(params: {
  query: string;
  skills?: string[];
  industries?: string[];
  limit?: number;
}): Promise<CaseStudyResult[]> {
  const { query, skills, industries, limit = 10 } = params;
  const searchTerm = `%${query}%`;

  // Base conditions: must be active and have a title
  const conditions: ReturnType<typeof eq>[] = [
    eq(firmCaseStudies.status, "active"),
    eq(firmCaseStudies.isHidden, false),
  ];

  // Text search across title and summary
  const textCondition = or(
    ilike(firmCaseStudies.title, searchTerm),
    ilike(firmCaseStudies.summary, searchTerm)
  );
  if (textCondition) conditions.push(textCondition);

  // Skill JSONB filter: autoTags->'skills' contains any requested skill
  if (skills && skills.length > 0) {
    const skillConds = skills.map(
      (s) =>
        sql`${firmCaseStudies.autoTags}::jsonb->'skills' @> ${JSON.stringify([s])}::jsonb`
    );
    conditions.push(sql`(${sql.join(skillConds, sql` OR `)})`);
  }

  // Industry JSONB filter
  if (industries && industries.length > 0) {
    const indConds = industries.map(
      (i) =>
        sql`${firmCaseStudies.autoTags}::jsonb->'industries' @> ${JSON.stringify([i])}::jsonb`
    );
    conditions.push(sql`(${sql.join(indConds, sql` OR `)})`);
  }

  const rows = await db
    .select({
      title: firmCaseStudies.title,
      summary: firmCaseStudies.summary,
      autoTags: firmCaseStudies.autoTags,
      firmName: serviceFirms.name,
    })
    .from(firmCaseStudies)
    .innerJoin(serviceFirms, eq(firmCaseStudies.firmId, serviceFirms.id))
    .where(and(...conditions))
    .limit(limit);

  return rows.map((r) => {
    const tags = r.autoTags as {
      skills?: string[];
      industries?: string[];
      clientName?: string | null;
    } | null;

    return {
      title: r.title ?? "Untitled Case Study",
      firmName: r.firmName,
      clientName: tags?.clientName ?? null,
      skills: tags?.skills ?? [],
      industries: tags?.industries ?? [],
      summary: r.summary ?? "",
    };
  });
}
