/**
 * Background Job: Recompute HAS_SKILL Edge Strength for a ServiceFirm
 *
 * The initial enrichment seeds HAS_SKILL edges with strength = classifier confidence.
 * This job recomputes strength using multi-signal evidence weighting:
 *
 *   strength = (caseStudyCount × 1.0 + expertCount × 0.6 + serviceCount × 0.3)
 *              normalised to a 0–1 range
 *
 * Triggered after:
 *   - Case study ingestion completes (case-study/ingested event)
 *   - Expert profile enrichment completes (expert/enriched event)
 *   - Deep crawl completes (firm/crawled event)
 *
 * Idempotent — recomputes from current graph state.
 */

import { inngest } from "../client";
import { neo4jWrite } from "@/lib/neo4j";

export const skillComputeStrength = inngest.createFunction(
  {
    id: "skill-compute-strength",
    name: "Compute Skill Strength for Firm",
    retries: 3,
  },
  [
    { event: "skill/compute-strength" },
    { event: "case-study/ingested" },
    { event: "expert/enriched" },
  ],
  async ({ event, step }) => {
    const firmId: string = event.data.firmId;
    if (!firmId) throw new Error("firmId is required");

    const result = await step.run("recompute-skill-strength", async () => {
      // For each HAS_SKILL edge from this firm, count evidence signals across node types
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})-[r:HAS_SKILL]->(s:Skill)
         // Count case studies demonstrating this skill
         OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs:CaseStudy)-[:DEMONSTRATES_SKILL]->(s)
         WITH f, r, s, count(DISTINCT cs) AS caseStudyCount
         // Count people at this firm with this skill
         OPTIONAL MATCH (p:Person)-[:CURRENTLY_AT]->(f)
         OPTIONAL MATCH (p)-[:HAS_SKILL]->(s)
         WITH f, r, s, caseStudyCount, count(DISTINCT p) AS expertCount
         // Count services offered that map to this skill
         OPTIONAL MATCH (f)-[:OFFERS_SERVICE]->(svc:Service)-[:BELONGS_TO]->(s)
         WITH r, s, caseStudyCount, expertCount, count(DISTINCT svc) AS serviceCount
         // Weighted strength formula: case studies are highest signal
         WITH r, caseStudyCount, expertCount, serviceCount,
              (caseStudyCount * 1.0 + expertCount * 0.6 + serviceCount * 0.3) AS rawScore
         SET r.strength = CASE
               WHEN rawScore = 0 THEN r.confidence  -- fallback to classifier confidence
               WHEN rawScore >= 5 THEN 1.0
               ELSE rawScore / 5.0
             END,
             r.caseStudyCount = caseStudyCount,
             r.expertCount = expertCount,
             r.serviceCount = serviceCount,
             r.evidenceCount = caseStudyCount + expertCount + serviceCount,
             r.lastComputedAt = datetime()
         RETURN count(r) AS updated`,
        { firmId }
      );

      // Also recompute OFFERS_SERVICE strength
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})-[r:OFFERS_SERVICE]->(svc:Service)
         OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs:CaseStudy)
         WHERE cs.title CONTAINS svc.name OR cs.description CONTAINS svc.name
         WITH f, r, svc, count(DISTINCT cs) AS caseStudyCount
         OPTIONAL MATCH (p:Person)-[:CURRENTLY_AT]->(f)
         WHERE p.headline CONTAINS svc.name
         WITH r, caseStudyCount, count(DISTINCT p) AS expertCount,
              coalesce(r.websiteMentionCount, 1) AS websiteMentionCount
         WITH r, caseStudyCount, expertCount, websiteMentionCount,
              (caseStudyCount * 1.0 + expertCount * 0.4 + websiteMentionCount * 0.2) AS rawScore
         SET r.strength = CASE
               WHEN rawScore = 0 THEN 0.3
               WHEN rawScore >= 5 THEN 1.0
               ELSE rawScore / 5.0
             END,
             r.caseStudyCount = caseStudyCount,
             r.expertCount = expertCount,
             r.evidenceCount = caseStudyCount + expertCount + websiteMentionCount,
             r.lastComputedAt = datetime()
         RETURN count(r) AS updated`,
        { firmId }
      );

      return { firmId, recomputed: true };
    });

    return result;
  }
);
