/**
 * Inngest Function: Case Study Ingestion
 *
 * Processes a single case study from any source:
 * 1. Ingest from URL, PDF text, or raw text
 * 2. AI extract structured COS analysis
 * 3. Write to Neo4j with full relationships
 */

import { inngest } from "../client";
import { ingestCaseStudy } from "@/lib/enrichment/case-study-ingestor";
import { writeCaseStudyToGraph } from "@/lib/enrichment/graph-writer";

export const caseStudyIngest = inngest.createFunction(
  {
    id: "enrich-case-study-ingest",
    name: "Case Study Ingestion",
    retries: 2,
    concurrency: [{ limit: 3 }],
  },
  { event: "enrich/case-study-ingest" },
  async ({ event, step }) => {
    const { firmId, caseStudyUrl, sourceType, rawText, filename } = event.data;

    // Step 1: Multi-format ingestion + AI extraction
    const analysis = await step.run("ingest-and-extract", async () => {
      return ingestCaseStudy({
        firmId,
        sourceType: sourceType ?? "url",
        url: caseStudyUrl,
        rawText,
        filename,
      });
    });

    if (!analysis) {
      return {
        firmId,
        url: caseStudyUrl,
        status: "skipped",
        reason: "not a case study or insufficient content",
      };
    }

    // Step 2: Write to Neo4j with full relationships
    const caseStudyId = `${firmId}:cs:${Buffer.from(
      caseStudyUrl ?? analysis.title ?? Date.now().toString()
    )
      .toString("base64url")
      .slice(0, 20)}`;

    const graphResult = await step.run("graph-write", async () => {
      return writeCaseStudyToGraph({
        caseStudyId,
        firmId,
        title: analysis.title,
        description: [analysis.challenge, analysis.solution]
          .filter(Boolean)
          .join(" → "),
        clientName: analysis.clientName,
        sourceUrl: caseStudyUrl,
        skills: analysis.skillsDemonstrated,
        industries: analysis.industries,
        outcomes: analysis.outcomes,
      });
    });

    return {
      firmId,
      url: caseStudyUrl,
      status: "ingested",
      title: analysis.title,
      client: analysis.clientName,
      services: analysis.servicesUsed.length,
      skills: analysis.skillsDemonstrated.length,
      metrics: analysis.metrics.length,
      confidence: analysis.confidence,
      graph: graphResult,
    };
  }
);
