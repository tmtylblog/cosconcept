/**
 * Inngest Function: Expert LinkedIn/PDL Enrichment
 *
 * Enriches an expert profile:
 * 1. PDL person enrichment (work history, skills, education)
 * 2. AI specialist profile generation (niche expertise analysis)
 * 3. Write enriched expert to PostgreSQL (expert_profiles + specialist_profiles)
 * 4. Write enriched expert to Neo4j graph
 *
 * Triggered by deep crawl when team members are discovered,
 * or manually when experts are added.
 */

import { inngest } from "../client";
import { enrichPerson } from "@/lib/enrichment/pdl";
import { generateSpecialistProfiles } from "@/lib/enrichment/specialist-generator";
import { writeExpertToGraph, writeSpecialistProfileToGraph } from "@/lib/enrichment/graph-writer";
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

export const expertLinkedIn = inngest.createFunction(
  {
    id: "enrich-expert-linkedin",
    name: "Expert LinkedIn Enrichment",
    retries: 2,
    concurrency: [{ limit: 5 }],
  },
  { event: "enrich/expert-linkedin" },
  async ({ event, step }) => {
    const {
      expertId,
      firmId,
      fullName,
      linkedinUrl,
      companyName,
      companyWebsite,
      importedContactId,
    } = event.data;

    // Step 1: PDL person enrichment
    const pdlPerson = await step.run("pdl-enrich", async () => {
      const result = await enrichPerson({
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
        extractedData: result
          ? {
              fullName: result.fullName,
              headline: result.headline,
              skills: result.skills.length,
              experience: result.experience.length,
            }
          : null,
        status: result ? "success" : "skipped",
      });

      return result;
    });

    if (!pdlPerson) {
      return { expertId, status: "not_found", fullName };
    }

    // Step 2: Generate specialist profiles
    const analysis = await step.run("generate-specialist-profiles", async () => {
      const result = await generateSpecialistProfiles({
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
          profiles: result.specialistProfiles.length,
          division: result.division,
          industries: result.industries.length,
        },
        model: "gemini-flash",
        status: "success",
      });

      return result;
    });

    // Step 3: Write to PostgreSQL (expert_profiles + specialist_profiles)
    const pgResult = await step.run("pg-write", async () => {
      const nameParts = (pdlPerson.fullName || fullName).split(" ");
      const firstName = nameParts[0] ?? null;
      const lastName = nameParts.slice(1).join(" ") || null;

      // Upsert expertProfile — use expertId as the record ID
      const existing = await db
        .select({ id: expertProfiles.id })
        .from(expertProfiles)
        .where(eq(expertProfiles.id, expertId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(expertProfiles).values({
          id: expertId,
          firmId,
          importedContactId: importedContactId ?? null,
          firstName,
          lastName,
          fullName: pdlPerson.fullName || fullName,
          email: null, // Not from PDL person search
          title: pdlPerson.jobTitle ?? null,
          headline: pdlPerson.headline ?? null,
          linkedinUrl: pdlPerson.linkedinUrl ?? linkedinUrl ?? null,
          location: pdlPerson.location?.name ?? null,
          bio: pdlPerson.summary ?? null,
          pdlId: pdlPerson.id ?? null,
          pdlData: {
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
          },
          pdlEnrichedAt: new Date(),
          topSkills: analysis.topSkills.slice(0, 15),
          topIndustries: analysis.industries.slice(0, 10),
          division: analysis.division,
          isPublic: true,
          profileCompleteness: pdlPerson.experience.length > 0 ? 0.6 : 0.3,
        });
      } else {
        // Update existing record with latest PDL data
        await db
          .update(expertProfiles)
          .set({
            headline: pdlPerson.headline ?? undefined,
            bio: pdlPerson.summary ?? undefined,
            pdlId: pdlPerson.id ?? undefined,
            pdlData: {
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
            },
            pdlEnrichedAt: new Date(),
            topSkills: analysis.topSkills.slice(0, 15),
            topIndustries: analysis.industries.slice(0, 10),
            division: analysis.division,
            updatedAt: new Date(),
          })
          .where(eq(expertProfiles.id, expertId));
      }

      // Insert AI-generated specialist profiles (only if the expert has none yet)
      const existingSps = await db
        .select({ id: specialistProfiles.id })
        .from(specialistProfiles)
        .where(eq(specialistProfiles.expertProfileId, expertId));

      const spCount = { created: 0 };

      if (existingSps.length === 0 && analysis.specialistProfiles.length > 0) {
        // Score and insert each AI-generated profile
        const scoredProfiles = analysis.specialistProfiles
          .map((sp) => {
            // Build example stubs from PDL experience (first 3 relevant jobs)
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

        const primaryId = scoredProfiles[0]?.sp.title;

        for (const { sp, scored, examples: expExamples } of scoredProfiles) {
          const spId = generateId("sp");
          const isSearchable = scored.score >= 80;
          const isPrimary = sp.title === primaryId;

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

          spCount.created++;
        }
      }

      return { epCreated: existing.length === 0, spCreated: spCount.created };
    });

    // Step 4: Write to Neo4j
    const graphResult = await step.run("graph-write", async () => {
      const expertGraphResult = await writeExpertToGraph({
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
      });

      // Write strong specialist profiles to Neo4j too
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

      return expertGraphResult;
    });

    return {
      expertId,
      fullName: pdlPerson.fullName,
      headline: pdlPerson.headline,
      division: analysis.division,
      specialistProfiles: analysis.specialistProfiles.map((p) => p.title),
      skills: analysis.topSkills.length,
      industries: analysis.industries.length,
      experience: pdlPerson.experience.length,
      pg: pgResult,
      graph: graphResult,
    };
  }
);
