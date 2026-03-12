/**
 * Handler: firm-case-study-ingest
 *
 * Full pipeline for user-managed case studies (submitted via /firm/experience UI).
 * Extracted from the Inngest function of the same name.
 */

import { db } from "@/lib/db";
import { firmCaseStudies, abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ingestCaseStudy } from "@/lib/enrichment/case-study-ingestor";
import { writeCaseStudyToGraph } from "@/lib/enrichment/graph-writer";
import {
  generateCaseStudySummary,
  generateCaseStudyAbstraction,
} from "@/lib/enrichment/case-study-analyzer";

interface Payload {
  caseStudyId: string;
  firmId: string;
  organizationId: string;
  sourceUrl: string;
  sourceType: "url" | "pdf_url" | "text";
  rawText?: string;
  filename?: string;
}

export async function handleFirmCaseStudyIngest(
  payload: Record<string, unknown>
): Promise<unknown> {
  const {
    caseStudyId,
    firmId,
    organizationId,
    sourceUrl,
    rawText,
    filename,
  } = payload as unknown as Payload;

  // Step 1: Mark as ingesting
  await db
    .update(firmCaseStudies)
    .set({ status: "ingesting", statusMessage: null, updatedAt: new Date() })
    .where(eq(firmCaseStudies.id, caseStudyId));

  // Step 2: Ingest content via multi-format ingestor
  let analysis;
  if (rawText) {
    analysis = await ingestCaseStudy({
      firmId,
      sourceType: "text",
      rawText,
      filename,
    });
  } else {
    analysis = await ingestCaseStudy({
      firmId,
      sourceType: "url",
      url: sourceUrl,
    });
  }

  // Step 3: Validate it's a case study
  if (!analysis || !analysis.isCaseStudy) {
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

    return {
      caseStudyId,
      status: "failed",
      reason: analysis ? "not a case study" : "no content extracted",
    };
  }

  // Step 4: Visible layer (summary + tags)
  const visibleLayer = await generateCaseStudySummary(analysis, {
    organizationId,
    entityId: caseStudyId,
  });

  // Step 5: Hidden abstraction layer
  const [firmRow] = await db
    .select({
      name: serviceFirms.name,
      firmType: serviceFirms.firmType,
      enrichmentData: serviceFirms.enrichmentData,
    })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  const enrichment = firmRow?.enrichmentData as Record<string, unknown> | null;

  const abstraction = await generateCaseStudyAbstraction(
    analysis,
    {
      firmName: firmRow?.name,
      firmCategory: firmRow?.firmType ?? undefined,
      firmServices: (enrichment?.services as string[]) ?? undefined,
    },
    { organizationId, entityId: caseStudyId }
  );

  // Step 6: Write to Neo4j graph
  const graphNodeId = `${firmId}:cs:${Buffer.from(sourceUrl)
    .toString("base64url")
    .slice(0, 20)}`;

  const graphResult = await writeCaseStudyToGraph({
    caseStudyId: graphNodeId,
    firmId,
    title: analysis.title,
    description: [analysis.challenge, analysis.solution]
      .filter(Boolean)
      .join(" → "),
    clientName: analysis.clientName,
    sourceUrl,
    skills: analysis.skillsDemonstrated,
    industries: analysis.industries,
    outcomes: analysis.outcomes,
  });

  // Step 7: Upsert abstraction profile
  const abstractionProfileId = `abs_cs_${caseStudyId}`;

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

  const [existing] = await db
    .select({ id: abstractionProfiles.id })
    .from(abstractionProfiles)
    .where(eq(abstractionProfiles.id, abstractionProfileId))
    .limit(1);

  if (existing) {
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

  // Step 8: Finalize
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
