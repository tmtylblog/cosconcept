/**
 * POST /api/opportunities/find-matches
 *
 * Given a list of opportunity IDs and a search scope, returns matching
 * specialist profiles (expertise) and specialist profile examples (case studies)
 * from the firm's own team and/or accepted partner firms.
 *
 * Scope:
 *   "own"      — search this firm's own profiles only
 *   "partners" — search accepted partner firms only
 *   "both"     — search own + partners
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  opportunities,
  serviceFirms,
  members,
  partnerships,
  specialistProfiles,
  specialistProfileExamples,
  expertProfiles,
} from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { opportunityIds, scope, organizationId } = (await req.json()) as {
    opportunityIds: string[];
    scope: "own" | "partners" | "both";
    organizationId?: string;
  };

  if (!opportunityIds?.length) {
    return new Response(JSON.stringify({ error: "No opportunity IDs provided" }), { status: 400 });
  }

  // Resolve firm
  let firmId: string | null = null;
  const orgId = organizationId ?? (await db
    .select({ orgId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.user.id))
    .limit(1)
    .then((r) => r[0]?.orgId ?? null));

  if (orgId) {
    const firm = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);
    firmId = firm[0]?.id ?? null;
  }

  if (!firmId) {
    return new Response(JSON.stringify({ error: "No firm found" }), { status: 400 });
  }

  // Fetch the opportunities to get their required skills / categories
  const opps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      requiredSkills: opportunities.requiredSkills,
      requiredCategories: opportunities.requiredCategories,
    })
    .from(opportunities)
    .where(and(
      inArray(opportunities.id, opportunityIds),
      eq(opportunities.firmId, firmId),
    ));

  if (!opps.length) {
    return Response.json({ matches: [] });
  }

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

  if (!searchFirmIds.length) {
    return Response.json({ matches: [] });
  }

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
  const matches = opps.map((opp) => {
    const requiredSkills = (opp.requiredSkills as string[] | null) ?? [];
    const requiredCategories = (opp.requiredCategories as string[] | null) ?? [];
    const allRequired = [...requiredSkills, ...requiredCategories].map((s) => s.toLowerCase());

    const matchedExperts: {
      profileId: string;
      expertName: string | null;
      firmName: string | null;
      firmId: string;
      profileTitle: string | null;
      matchedSkills: string[];
      source: "own" | "partner";
    }[] = [];

    const matchedCaseStudies: {
      exampleId: string;
      profileId: string;
      title: string | null;
      description: string | null;
      firmName: string | null;
      firmId: string;
      matchedSkills: string[];
      source: "own" | "partner";
    }[] = [];

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

      // Check this profile's examples
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

  return Response.json({ matches, scope, firmId });
}
