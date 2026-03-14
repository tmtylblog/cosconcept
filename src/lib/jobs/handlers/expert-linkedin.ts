/**
 * Handler: expert-linkedin
 *
 * PDL person enrichment + specialist profile generation + graph write.
 * Pulls work history, skills, education from PDL, generates AI specialist
 * profiles, and writes everything to PG + Neo4j.
 */

import { enrichPerson } from "@/lib/enrichment/pdl";
import {
  writeExpertToGraph,
  writeWorkHistoryToGraph,
  writeSkillsFromPdlToGraph,
  writeSpecialistProfileToGraph,
} from "@/lib/enrichment/graph-writer";
import { generateSpecialistProfiles } from "@/lib/enrichment/specialist-generator";
import { scoreSpecialistProfile } from "@/lib/expert/quality-score";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { db } from "@/lib/db";
import { expertProfiles, specialistProfiles, specialistProfileExamples } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeLinkedInUrl } from "@/lib/utils";

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

/**
 * Derive a simple division from PDL job title levels + class.
 * This is a lightweight heuristic — NOT the specialist profile system.
 * Just buckets the person for basic filtering/display.
 */
function deriveDivision(
  jobTitleLevels: string[],
  _jobTitleClass: string | null,
): string {
  const levels = new Set(jobTitleLevels.map((l) => l.toLowerCase()));

  // C-suite / owner
  if (levels.has("cxo") || levels.has("owner")) return "collective_leader";

  // VP / Director / Partner
  if (levels.has("vp") || levels.has("director") || levels.has("partner"))
    return "collective_member";

  // Senior / Manager
  if (levels.has("senior") || levels.has("manager")) return "collective_member";

  // Entry / Training
  if (levels.has("entry") || levels.has("training")) return "collective_associate";

  // Default
  return "collective_member";
}

/**
 * Extract unique industries from work history.
 */
function extractIndustries(experience: { company: { industry: string | null } }[]): string[] {
  return experience
    .map((e) => e.company.industry)
    .filter((i): i is string => !!i)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .slice(0, 10);
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

  // Step 0: Skip if recently enriched (within 6 months) to save PDL credits.
  // This catches legacy work history imports and recent PDL enrichments.
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  const [existingProfile] = await db
    .select({ pdlEnrichedAt: expertProfiles.pdlEnrichedAt })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  if (existingProfile?.pdlEnrichedAt) {
    const enrichedAge = Date.now() - existingProfile.pdlEnrichedAt.getTime();
    if (enrichedAge < SIX_MONTHS_MS) {
      const monthsAgo = Math.round(enrichedAge / (30 * 24 * 60 * 60 * 1000));
      console.log(
        `[expert-linkedin] Skipping ${expertId} — enriched ${monthsAgo} month(s) ago (within 6-month window)`
      );
      return {
        expertId,
        status: "skipped_recent",
        fullName,
        enrichedMonthsAgo: monthsAgo,
      };
    }
  }

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

  // Step 2: Generate specialist profiles via AI
  let analysis: Awaited<ReturnType<typeof generateSpecialistProfiles>> | null = null;
  try {
    analysis = await generateSpecialistProfiles({
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
  } catch (err) {
    // Non-fatal — continue without specialist profiles
    console.error(`[expert-linkedin] Specialist profile generation failed for ${expertId}: ${err}`);
  }

  // Derive metadata — prefer AI analysis results, fall back to PDL direct
  const rawDivision = analysis?.division ?? deriveDivision(
    pdlPerson.jobTitleLevels ?? [],
    pdlPerson.jobTitleClass ?? null,
  );
  // Map to DB enum values — the enum only allows these three
  const VALID_DIVISIONS = ["collective_member", "expert", "trusted_expert"] as const;
  type DivisionEnum = typeof VALID_DIVISIONS[number];
  const division: DivisionEnum = (VALID_DIVISIONS as readonly string[]).includes(rawDivision)
    ? (rawDivision as DivisionEnum)
    : "collective_member";
  const topSkills = analysis?.topSkills?.slice(0, 15) ?? pdlPerson.skills.slice(0, 15);
  const topIndustries = analysis?.industries?.slice(0, 10) ?? extractIndustries(pdlPerson.experience);

  // Step 3: Write to PostgreSQL — expert profile with PDL data
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
      linkedinUrl: normalizeLinkedInUrl(pdlPerson.linkedinUrl ?? linkedinUrl),
      location: pdlPerson.location?.name ?? null,
      bio: pdlPerson.summary ?? null,
      pdlId: pdlPerson.id ?? null,
      pdlData: pdlDataPayload,
      pdlEnrichedAt: new Date(),
      topSkills,
      topIndustries,
      division,
      enrichmentStatus: "enriched",
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
        topSkills,
        topIndustries,
        division,
        enrichmentStatus: "enriched",
        updatedAt: new Date(),
      })
      .where(eq(expertProfiles.id, expertId));
  }

  // Step 4: Write to Neo4j — Person node + CURRENTLY_AT edge
  const graphResult = await writeExpertToGraph({
    expertId,
    firmId,
    fullName: pdlPerson.fullName || fullName,
    headline: pdlPerson.headline,
    linkedinUrl: pdlPerson.linkedinUrl ?? undefined,
    location: pdlPerson.location?.name,
    skills: topSkills.length > 0 ? topSkills : pdlPerson.skills.slice(0, 30),
    industries: topIndustries,
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

  // Step 5: Generate and store specialist profiles (if AI analysis succeeded)
  let spCreated = 0;
  if (analysis && analysis.specialistProfiles.length > 0) {
    // Only insert if expert has no specialist profiles yet
    const existingSps = await db
      .select({ id: specialistProfiles.id })
      .from(specialistProfiles)
      .where(eq(specialistProfiles.expertProfileId, expertId));

    if (existingSps.length === 0) {
      const scoredProfiles = analysis.specialistProfiles
        .map((sp) => {
          const relevantExp = pdlPerson.experience
            .filter((exp) =>
              sp.industries.some((ind) =>
                exp.company.industry?.toLowerCase().includes(ind.toLowerCase())
              ) || sp.skills.some((skill) =>
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

          return { sp, scored, examples: relevantExp };
        })
        .sort((a, b) => b.scored.score - a.scored.score);

      const primaryTitle = scoredProfiles[0]?.sp.title;

      for (const { sp, scored, examples: expExamples } of scoredProfiles) {
        const spId = generateId("sp");
        const isSearchable = scored.score >= 80;
        const isPrimary = sp.title === primaryTitle;

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
          isSearchable,
          isPrimary,
          status: scored.score >= 50 ? "published" : "draft",
        });

        // Insert experience-backed examples (max 3)
        for (let i = 0; i < Math.min(expExamples.length, 3); i++) {
          const exp = expExamples[i];
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

        // Write searchable specialist profiles to Neo4j
        if (isSearchable) {
          try {
            await writeSpecialistProfileToGraph({
              profileId: spId,
              expertId,
              firmId,
              title: sp.title,
              skills: sp.skills,
              industries: sp.industries,
            });
          } catch (err) {
            console.error(`[expert-linkedin] Failed to write SP ${spId} to graph: ${err}`);
          }
        }

        spCreated++;
      }
    }
  }

  return {
    expertId,
    fullName: pdlPerson.fullName,
    headline: pdlPerson.headline,
    division,
    specialistProfiles: spCreated,
    skills: topSkills.length,
    industries: topIndustries.length,
    experience: pdlPerson.experience.length,
    pg: { epCreated: !existing },
    graph: graphResult,
    workHistory: workHistoryResult,
    skillMatch: skillMatchResult,
  };
}
