/**
 * Handler: expert-linkedin
 *
 * PDL person enrichment + graph write.
 * Pulls work history, skills, education from PDL and writes to PG + Neo4j.
 *
 * NOTE: Specialist profile generation is intentionally NOT done here.
 * That will be a separate, dedicated process with its own quality controls.
 * This handler only captures the "base layer" — factual PDL data.
 */

import { enrichPerson } from "@/lib/enrichment/pdl";
import {
  writeExpertToGraph,
  writeWorkHistoryToGraph,
  writeSkillsFromPdlToGraph,
} from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  jobTitleClass: string | null,
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

  // Step 2: Derive basic metadata from PDL data (no AI calls)
  const division = deriveDivision(
    pdlPerson.jobTitleLevels ?? [],
    pdlPerson.jobTitleClass ?? null,
  );
  const topSkills = pdlPerson.skills.slice(0, 15);
  const topIndustries = extractIndustries(pdlPerson.experience);

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
      linkedinUrl: pdlPerson.linkedinUrl ?? linkedinUrl ?? null,
      location: pdlPerson.location?.name ?? null,
      bio: pdlPerson.summary ?? null,
      pdlId: pdlPerson.id ?? null,
      pdlData: pdlDataPayload,
      pdlEnrichedAt: new Date(),
      topSkills,
      topIndustries,
      division,
      isPublic: true,
      profileCompleteness: pdlPerson.experience.length > 0 ? 0.4 : 0.2,
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

  return {
    expertId,
    fullName: pdlPerson.fullName,
    headline: pdlPerson.headline,
    division,
    skills: topSkills.length,
    industries: topIndustries.length,
    experience: pdlPerson.experience.length,
    pg: { epCreated: !existing },
    graph: graphResult,
    workHistory: workHistoryResult,
    skillMatch: skillMatchResult,
  };
}
