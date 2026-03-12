/**
 * Handler: case-study-ingest (legacy pipeline)
 *
 * Simple case study ingest — scrapes URL, AI-extracts, writes to graph.
 * Used by the admin enrichment pipeline (not the user-managed UI flow).
 * For user-managed case studies, use firm-case-study-ingest.
 */

import { ingestCaseStudy } from "@/lib/enrichment/case-study-ingestor";
import { writeCaseStudyToGraph } from "@/lib/enrichment/graph-writer";

interface Payload {
  firmId: string;
  caseStudyUrl: string;
  sourceType?: "url" | "pdf" | "text";
  rawText?: string;
  filename?: string;
}

export async function handleCaseStudyIngest(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { firmId, caseStudyUrl, sourceType, rawText, filename } =
    payload as unknown as Payload;

  const analysis = await ingestCaseStudy({
    firmId,
    sourceType: sourceType ?? "url",
    url: caseStudyUrl,
    rawText,
    filename,
  });

  if (!analysis) {
    return {
      firmId,
      url: caseStudyUrl,
      status: "skipped",
      reason: "not a case study or insufficient content",
    };
  }

  const caseStudyId = `${firmId}:cs:${Buffer.from(
    caseStudyUrl ?? analysis.title ?? Date.now().toString()
  )
    .toString("base64url")
    .slice(0, 20)}`;

  const graphResult = await writeCaseStudyToGraph({
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
