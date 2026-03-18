/**
 * Inngest Function: Firm Case Study Ingestion + Analysis
 *
 * Full pipeline for user-managed case studies:
 * 1. Set status → "ingesting"
 * 2. Ingest content from URL (existing ingestor)
 * 3. Validate it's actually a case study
 * 4. Generate visible layer (summary + tags)
 * 5. Generate hidden abstraction layer (partnership signals)
 * 6. Write to Neo4j graph
 * 7. Upsert abstraction profile
 * 8. Update firmCaseStudies row with all results
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { firmCaseStudies, abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ingestCaseStudy } from "@/lib/enrichment/case-study-ingestor";
import { writeCaseStudyToGraph } from "@/lib/enrichment/graph-writer";
import {
  generateCaseStudySummary,
  generateCaseStudyAbstraction,
} from "@/lib/enrichment/case-study-analyzer";

export const firmCaseStudyIngest = inngest.createFunction(
  {
    id: "enrich-firm-case-study-ingest",
    name: "Firm Case Study Ingestion + Analysis",
    retries: 2,
    concurrency: [{ limit: 3 }],
  },
  { event: "enrich/firm-case-study-ingest" },
  async ({ event, step }) => {
    const { caseStudyId, firmId, organizationId, sourceUrl, rawText } =
      event.data;

    // Step 1: Set status → "ingesting"
    await step.run("set-ingesting", async () => {
      await db
        .update(firmCaseStudies)
        .set({
          status: "ingesting",
          statusMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(firmCaseStudies.id, caseStudyId));
    });

    // Step 2: Ingest content via existing multi-format ingestor
    const analysis = await step.run("ingest-and-extract", async () => {
      // If raw text was provided (PDF upload or text paste), use it directly
      if (rawText) {
        return ingestCaseStudy({
          firmId,
          sourceType: "text",
          rawText,
          filename: event.data.filename,
        });
      }
      // Otherwise, scrape the URL
      return ingestCaseStudy({
        firmId,
        sourceType: "url",
        url: sourceUrl,
      });
    });

    // Step 3: Validate it's actually a case study
    if (!analysis || !analysis.isCaseStudy) {
      await step.run("mark-not-case-study", async () => {
        await db
          .update(firmCaseStudies)
          .set({
            status: "failed",
            statusMessage: analysis
              ? "Content was analyzed but does not appear to be a case study. Try a different URL that links directly to a project or client success story."
              : "Could not extract content from this URL. Please check the link is accessible and contains readable content.",
            cosAnalysis: analysis ?? null,
            updatedAt: new Date(),
          })
          .where(eq(firmCaseStudies.id, caseStudyId));
      });

      return {
        caseStudyId,
        status: "failed",
        reason: analysis ? "not a case study" : "no content extracted",
      };
    }

    // Step 4: Generate visible layer (summary + tags)
    const visibleLayer = await step.run("generate-summary", async () => {
      return generateCaseStudySummary(analysis, {
        organizationId,
        entityId: caseStudyId,
      });
    });

    // Step 5: Generate hidden abstraction layer
    const abstraction = await step.run("generate-abstraction", async () => {
      // Get firm context for richer abstraction
      const firm = await db
        .select({
          name: serviceFirms.name,
          firmType: serviceFirms.firmType,
          enrichmentData: serviceFirms.enrichmentData,
        })
        .from(serviceFirms)
        .where(eq(serviceFirms.id, firmId))
        .limit(1);

      const firmData = firm[0];
      const enrichment = firmData?.enrichmentData as Record<string, unknown> | null;

      return generateCaseStudyAbstraction(
        analysis,
        {
          firmName: firmData?.name,
          firmCategory: firmData?.firmType ?? undefined,
          firmServices: (enrichment?.services as string[]) ?? undefined,
        },
        { organizationId, entityId: caseStudyId }
      );
    });

    // Step 6: Write to Neo4j graph
    const graphNodeId = `${firmId}:cs:${Buffer.from(sourceUrl)
      .toString("base64url")
      .slice(0, 20)}`;

    const graphResult = await step.run("graph-write", async () => {
      return writeCaseStudyToGraph({
        caseStudyId: graphNodeId,
        firmId,
        title: analysis.title,
        summary: visibleLayer.summary,
        description: [analysis.challenge, analysis.solution]
          .filter(Boolean)
          .join(" → "),
        clientName: analysis.clientName,
        sourceUrl,
        skills: analysis.skillsDemonstrated,
        industries: analysis.industries,
        outcomes: analysis.outcomes,
      });
    });

    // Step 7: Upsert abstraction profile
    const abstractionProfileId = `abs_cs_${caseStudyId}`;

    await step.run("upsert-abstraction", async () => {
      const hiddenNarrative = [
        `## Capability Proof\n${abstraction.capabilityProof}`,
        `## Partnership Signals\n${abstraction.partnershipSignals}`,
        `## Ideal Referral Profile\n${abstraction.idealReferralProfile}`,
      ].join("\n\n");

      const confidenceScores = {
        evidenceStrength: abstraction.evidenceStrength,
        evidenceReasoning: abstraction.evidenceReasoning,
        taxonomyMapping: abstraction.taxonomyMapping,
      };

      const evidenceSources = {
        sourceUrl,
        title: analysis.title,
        clientName: analysis.clientName,
        metrics: analysis.metrics,
      };

      // Check if profile exists
      const existing = await db
        .select({ id: abstractionProfiles.id })
        .from(abstractionProfiles)
        .where(eq(abstractionProfiles.id, abstractionProfileId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(abstractionProfiles)
          .set({
            hiddenNarrative,
            confidenceScores,
            evidenceSources,
            lastEnrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(abstractionProfiles.id, abstractionProfileId));
      } else {
        await db.insert(abstractionProfiles).values({
          id: abstractionProfileId,
          entityType: "case_study",
          entityId: caseStudyId,
          hiddenNarrative,
          confidenceScores,
          evidenceSources,
          lastEnrichedAt: new Date(),
        });
      }
    });

    // Step 8: Update firmCaseStudies row with all results
    await step.run("finalize", async () => {
      await db
        .update(firmCaseStudies)
        .set({
          status: "active",
          statusMessage: null,
          title: analysis.title,
          summary: visibleLayer.summary,
          autoTags: visibleLayer.autoTags,
          cosAnalysis: analysis,
          graphNodeId,
          abstractionProfileId,
          ingestedAt: new Date(),
          lastIngestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(firmCaseStudies.id, caseStudyId));
    });

    return {
      caseStudyId,
      status: "active",
      title: analysis.title,
      summary: visibleLayer.summary,
      tags: visibleLayer.autoTags,
      evidenceStrength: abstraction.evidenceStrength,
      graph: graphResult,
    };
  }
);
