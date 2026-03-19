/**
 * Opportunity Matcher — shared logic for matching opportunities to specialists.
 *
 * Extracted from /api/opportunities/find-matches so both the API route
 * and the Inngest post-call-analysis pipeline can use it.
 */

import { db } from "@/lib/db";
import {
  opportunities,
  serviceFirms,
  partnerships,
  specialistProfiles,
  specialistProfileExamples,
  expertProfiles,
} from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

export interface MatchedExpert {
  profileId: string;
  expertName: string | null;
  firmName: string | null;
  firmId: string;
  profileTitle: string | null;
  matchedSkills: string[];
  source: "own" | "partner";
}

export interface MatchedCaseStudy {
  exampleId: string;
  profileId: string;
  title: string | null;
  description: string | null;
  firmName: string | null;
  firmId: string;
  matchedSkills: string[];
  source: "own" | "partner";
}

export interface OpportunityMatch {
  opportunityId: string;
  opportunityTitle: string;
  experts: MatchedExpert[];
  caseStudies: MatchedCaseStudy[];
  totalExpertMatches: number;
  totalCaseStudyMatches: number;
}

/**
 * Find matching specialist profiles and case studies for a set of opportunities.
 *
 * @param opportunityIds - IDs to match against
 * @param firmId - The firm context (used for scope + own/partner classification)
 * @param scope - "own" | "partners" | "both"
 */
export async function findOpportunityMatches(
  opportunityIds: string[],
  firmId: string,
  scope: "own" | "partners" | "both" = "both"
): Promise<OpportunityMatch[]> {
  if (!opportunityIds.length) return [];

  // Fetch the opportunities
  const opps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      requiredSkills: opportunities.requiredSkills,
      requiredCategories: opportunities.requiredCategories,
    })
    .from(opportunities)
    .where(inArray(opportunities.id, opportunityIds));

  if (!opps.length) return [];

  // Determine which firm IDs to search
  const searchFirmIds: string[] = [];

  if (scope === "own" || scope === "both") {
    searchFirmIds.push(firmId);
  }

  if (scope === "partners" || scope === "both") {
    const partnerLinks = await db
      .select({ firmAId: partnerships.firmAId, firmBId: partnerships.firmBId })
      .from(partnerships)
      .where(and(
        or(eq(partnerships.firmAId, firmId), eq(partnerships.firmBId, firmId)),
        eq(partnerships.status, "accepted")
      ));

    for (const link of partnerLinks) {
      const partnerId = link.firmAId === firmId ? link.firmBId : link.firmAId;
      searchFirmIds.push(partnerId);
    }
  }

  if (!searchFirmIds.length) return [];

  // Fetch specialist profiles + their examples for relevant firms
  const profiles = await db
    .select({
      id: specialistProfiles.id,
      firmId: specialistProfiles.firmId,
      title: specialistProfiles.title,
      skills: specialistProfiles.skills,
      services: specialistProfiles.services,
      industries: specialistProfiles.industries,
      expertProfileId: specialistProfiles.expertProfileId,
      firmName: serviceFirms.name,
      expertName: expertProfiles.fullName,
    })
    .from(specialistProfiles)
    .leftJoin(serviceFirms, eq(specialistProfiles.firmId, serviceFirms.id))
    .leftJoin(expertProfiles, eq(specialistProfiles.expertProfileId, expertProfiles.id))
    .where(and(
      inArray(specialistProfiles.firmId, searchFirmIds),
      eq(specialistProfiles.status, "published"),
    ));

  const profileIds = profiles.map((p) => p.id);

  const examples = profileIds.length > 0
    ? await db
        .select({
          id: specialistProfileExamples.id,
          specialistProfileId: specialistProfileExamples.specialistProfileId,
          title: specialistProfileExamples.title,
          description: specialistProfileExamples.subject,
          companyIndustry: specialistProfileExamples.companyIndustry,
        })
        .from(specialistProfileExamples)
        .where(inArray(specialistProfileExamples.specialistProfileId, profileIds))
    : [];

  // Build a map: profileId → examples
  const examplesByProfile = new Map<string, typeof examples>();
  for (const ex of examples) {
    const list = examplesByProfile.get(ex.specialistProfileId) ?? [];
    list.push(ex);
    examplesByProfile.set(ex.specialistProfileId, list);
  }

  // For each opportunity, find overlapping profiles and examples
  return opps.map((opp) => {
    const requiredSkills = (opp.requiredSkills as string[] | null) ?? [];
    const requiredCategories = (opp.requiredCategories as string[] | null) ?? [];
    const allRequired = [...requiredSkills, ...requiredCategories].map((s) => s.toLowerCase());

    const matchedExperts: MatchedExpert[] = [];
    const matchedCaseStudies: MatchedCaseStudy[] = [];

    for (const profile of profiles) {
      const profileSkills = [
        ...((profile.skills as string[] | null) ?? []),
        ...((profile.services as string[] | null) ?? []),
      ].map((s) => s.toLowerCase());

      const matched = allRequired.filter((r) =>
        profileSkills.some((ps) => ps.includes(r) || r.includes(ps))
      );

      if (matched.length === 0) continue;

      const source: "own" | "partner" = profile.firmId === firmId ? "own" : "partner";

      matchedExperts.push({
        profileId: profile.id,
        expertName: profile.expertName ?? null,
        firmName: profile.firmName ?? null,
        firmId: profile.firmId,
        profileTitle: profile.title ?? null,
        matchedSkills: matched,
        source,
      });

      const profileExamples = examplesByProfile.get(profile.id) ?? [];
      for (const ex of profileExamples) {
        const exMatched = allRequired.filter((r) =>
          (ex.title ?? "").toLowerCase().includes(r) ||
          (ex.description ?? "").toLowerCase().includes(r) ||
          (ex.companyIndustry ?? "").toLowerCase().includes(r)
        );

        if (exMatched.length > 0 || matched.length > 0) {
          matchedCaseStudies.push({
            exampleId: ex.id,
            profileId: profile.id,
            title: ex.title ?? null,
            description: ex.description ?? null,
            firmName: profile.firmName ?? null,
            firmId: profile.firmId,
            matchedSkills: exMatched.length > 0 ? exMatched : matched,
            source,
          });
        }
      }
    }

    return {
      opportunityId: opp.id,
      opportunityTitle: opp.title,
      experts: matchedExperts.slice(0, 8),
      caseStudies: matchedCaseStudies.slice(0, 8),
      totalExpertMatches: matchedExperts.length,
      totalCaseStudyMatches: matchedCaseStudies.length,
    };
  });
}
