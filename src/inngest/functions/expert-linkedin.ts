/**
 * Inngest Function: Expert LinkedIn/PDL Enrichment
 *
 * Enriches an expert profile:
 * 1. PDL person enrichment (work history, skills, education)
 * 2. AI specialist profile generation (niche expertise analysis)
 * 3. Write enriched expert to Neo4j graph
 *
 * Triggered by deep crawl when team members are discovered,
 * or manually when experts are added.
 */

import { inngest } from "../client";
import { enrichPerson } from "@/lib/enrichment/pdl";
import { generateSpecialistProfiles } from "@/lib/enrichment/specialist-generator";
import { writeExpertToGraph } from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";

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

    // Step 3: Write to Neo4j
    const graphResult = await step.run("graph-write", async () => {
      return writeExpertToGraph({
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
      graph: graphResult,
    };
  }
);
