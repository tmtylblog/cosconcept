/**
 * Handler: expert-linkedin
 *
 * PDL person enrichment + specialist profile generation + graph write.
 * Extracted from the Inngest function of the same name.
 */

import { enrichPerson } from "@/lib/enrichment/pdl";
import { generateSpecialistProfiles } from "@/lib/enrichment/specialist-generator";
import {
  writeExpertToGraph,
  writeSpecialistProfileToGraph,
  writeWorkHistoryToGraph,
  writeSkillsFromPdlToGraph,
} from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { db } from "@/lib/db";
import {
  expertProfiles,
  specialistProfiles,
  specialistProfileExamples,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { scoreSpecialistProfile } from "@/lib/expert/quality-score";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface Payload {
  expertId: string;
  firmId: string;
  fullName: string;
  linkedinUrl?: string;
  companyName?: string;
  companyWebsite?: string;
  importedContactId?: string;
}

export async function handleExpertLinkedIn(
  payload: Record<string, unknown>
): Promise<unknown> {
  const {
    expertId,
    firmId,
    fullName,
    linkedinUrl,
    companyName,
    companyWebsite,
    importedContactId,
  } = payload as unknown as Payload;

  // Step 1: PDL person enrichment
  const pdlPerson = await enrichPerson({
    name: fullName,
    linkedinUrl,
    companyName,
    companyWebsite,
  });

  await logEnrichmentStep({
    firmId,
    userId: expertId,
    phase: "linkedin",
    source: "api.peopledatalabs.com",
    rawInput: `name=${fullName}, company=${companyName}`,
    extractedData: pdlPerson
      ? {
          fullName: pdlPerson.fullName,
          headline: pdlPerson.headline,
          skills: pdlPerson.skills.length,
          experience: pdlPerson.experience.length,
        }
      : null,
    status: pdlPerson ? "success" : "skipped",
  });

  if (!pdlPerson) {
    return { expertId, status: "not_found", fullName };
  }

  // Step 2: Generate specialist profiles
  const analysis = await generateSpecialistProfiles({
    pdlPerson,
    firmContext: companyName
      ? { firmName: companyName, caseStudies: [], services: [] }
      : undefined,
    isCurrentMember: true,
  });

  await logEnrichmentStep({
    firmId,
    userId: expertId,
    phase: "linkedin",
    source: "specialist-generator",
    rawInput: `Expert: ${pdlPerson.fullName}, Skills: ${pdlPerson.skills.length}`,
    extractedData: {
      profiles: analysis.specialistProfiles.length,
      division: analysis.division,
      industries: analysis.industries.length,
    },
    model: "gemini-flash",
    status: "success",
  });

  // Step 3: Write to PostgreSQL
  const nameParts = (pdlPerson.fullName || fullName).split(" ");
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.slice(1).join(" ") || null;

  const [existing] = await db
    .select({ id: expertProfiles.id })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  const pdlDataPayload = {
    id: pdlPerson.id,
    experience: pdlPerson.experience.map((exp) => ({
      company: {
        name: exp.company.name,
        website: exp.company.website ?? null,
        industry: exp.company.industry ?? null,
      },
      title: exp.title,
      startDate: exp.startDate ?? null,
      endDate: exp.endDate ?? null,
      isCurrent: exp.isCurrent ?? false,
      summary: exp.summary ?? undefined,
    })),
    skills: pdlPerson.skills,
    education: pdlPerson.education.map((edu) => ({
      school: { name: edu.school.name },
      degrees: edu.degrees,
      startDate: edu.startDate ?? undefined,
      endDate: edu.endDate ?? undefined,
    })),
    summary: pdlPerson.summary ?? undefined,
    // New fields from Step 2
    jobTitleLevels: pdlPerson.jobTitleLevels ?? [],
    jobTitleClass: pdlPerson.jobTitleClass ?? null,
  };

  if (!existing) {
    await db.insert(expertProfiles).values({
      id: expertId,
      firmId,
      importedContactId: importedContactId ?? null,
      firstName,
      lastName,
      fullName: pdlPerson.fullName || fullName,
      email: null,
      title: pdlPerson.jobTitle ?? null,
      headline: pdlPerson.headline ?? null,
      linkedinUrl: pdlPerson.linkedinUrl ?? linkedinUrl ?? null,
      location: pdlPerson.location?.name ?? null,
      bio: pdlPerson.summary ?? null,
      pdlId: pdlPerson.id ?? null,
      pdlData: pdlDataPayload,
      pdlEnrichedAt: new Date(),
      topSkills: analysis.topSkills.slice(0, 15),
      topIndustries: analysis.industries.slice(0, 10),
      division: analysis.division,
      isPublic: true,
      profileCompleteness: pdlPerson.experience.length > 0 ? 0.6 : 0.3,
    });
  } else {
    await db
      .update(expertProfiles)
      .set({
        headline: pdlPerson.headline ?? undefined,
        bio: pdlPerson.summary ?? undefined,
        pdlId: pdlPerson.id ?? undefined,
        pdlData: pdlDataPayload,
        pdlEnrichedAt: new Date(),
        topSkills: analysis.topSkills.slice(0, 15),
        topIndustries: analysis.industries.slice(0, 10),
        division: analysis.division,
        updatedAt: new Date(),
      })
      .where(eq(expertProfiles.id, expertId));
  }

  // Insert specialist profiles (only if none exist)
  const [existingSp] = await db
    .select({ id: specialistProfiles.id })
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, expertId))
    .limit(1);

  let spCreated = 0;
  if (!existingSp && analysis.specialistProfiles.length > 0) {
    const scoredProfiles = analysis.specialistProfiles
      .map((sp) => {
        const relevantExp = pdlPerson.experience
          .filter(
            (exp) =>
              sp.industries.some((ind) =>
                exp.company.industry?.toLowerCase().includes(ind.toLowerCase())
              ) ||
              sp.skills.some((skill) =>
                pdlPerson.skills.some((s) =>
                  s.toLowerCase().includes(skill.toLowerCase())
                )
              )
          )
          .slice(0, 3);

        const examples = relevantExp.map((exp) => ({
          title: exp.title,
          subject: exp.summary ?? null,
          companyIndustry: exp.company.industry ?? null,
        }));

        const scored = scoreSpecialistProfile({
          title: sp.title,
          bodyDescription: sp.description,
          industries: sp.industries,
          examples,
        });

        return { sp, scored, relevantExp };
      })
      .sort((a, b) => b.scored.score - a.scored.score);

    const primaryTitle = scoredProfiles[0]?.sp.title;

    for (const { sp, scored, relevantExp } of scoredProfiles) {
      const spId = generateId("sp");

      await db.insert(specialistProfiles).values({
        id: spId,
        expertProfileId: expertId,
        firmId,
        title: sp.title,
        bodyDescription: sp.description,
        skills: sp.skills,
        industries: sp.industries,
        services: [],
        qualityScore: scored.score,
        qualityStatus: scored.status,
        source: "ai_generated",
        isSearchable: scored.score >= 80,
        isPrimary: sp.title === primaryTitle,
        status: scored.score >= 50 ? "published" : "draft",
      });

      for (let i = 0; i < Math.min(relevantExp.length, 3); i++) {
        const exp = relevantExp[i];
        const expIdx = pdlPerson.experience.indexOf(exp);
        await db.insert(specialistProfileExamples).values({
          id: generateId("ex"),
          specialistProfileId: spId,
          exampleType: "role",
          title: exp.title,
          subject: exp.summary ?? null,
          companyName: exp.company.name,
          companyIndustry: exp.company.industry ?? null,
          startDate: exp.startDate ?? null,
          endDate: exp.endDate ?? null,
          isCurrent: exp.isCurrent ?? false,
          isPdlSource: true,
          pdlExperienceIndex: expIdx >= 0 ? expIdx : null,
          position: i + 1,
        });
      }

      spCreated++;
    }
  }

  // Step 4: Write to Neo4j — Person node + CURRENTLY_AT edge
  const graphResult = await writeExpertToGraph({
    expertId,
    firmId,
    fullName: pdlPerson.fullName || fullName,
    headline: pdlPerson.headline,
    linkedinUrl: pdlPerson.linkedinUrl ?? undefined,
    location: pdlPerson.location?.name,
    skills:
      analysis.topSkills.length > 0
        ? analysis.topSkills
        : pdlPerson.skills.slice(0, 30),
    industries:
      analysis.industries.length > 0
        ? analysis.industries
        : pdlPerson.experience
            .map((e) => e.company.industry)
            .filter((i): i is string => !!i)
            .filter((v, idx, arr) => arr.indexOf(v) === idx)
            .slice(0, 10),
    // New fields: seniority levels + job title class
    seniorityLevels: pdlPerson.jobTitleLevels,
    jobTitleClass: pdlPerson.jobTitleClass,
  });

  // Step 4b: Write work history → WORKED_AT edges to Company nodes
  const workHistoryResult = await writeWorkHistoryToGraph(
    expertId,
    pdlPerson.experience
  );

  // Step 4c: Match PDL skills to taxonomy → HAS_SKILL edges (source: pdl_self_reported)
  const skillMatchResult = await writeSkillsFromPdlToGraph(
    expertId,
    pdlPerson.skills
  );

  // Write strong specialist profiles to Neo4j
  const strongSps = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, expertId));

  for (const sp of strongSps.filter((s) => s.isSearchable)) {
    await writeSpecialistProfileToGraph({
      profileId: sp.id,
      expertId,
      firmId,
      title: sp.title ?? undefined,
      skills: (sp.skills as string[]) ?? [],
      industries: (sp.industries as string[]) ?? [],
    });
  }

  return {
    expertId,
    fullName: pdlPerson.fullName,
    headline: pdlPerson.headline,
    division: analysis.division,
    specialistProfiles: analysis.specialistProfiles.map((p) => p.title),
    skills: analysis.topSkills.length,
    industries: analysis.industries.length,
    experience: pdlPerson.experience.length,
    pg: { epCreated: !existing, spCreated },
    graph: graphResult,
    workHistory: workHistoryResult,
    skillMatch: skillMatchResult,
  };
}
