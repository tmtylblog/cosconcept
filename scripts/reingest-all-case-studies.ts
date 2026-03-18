/**
 * Re-ingest ALL case studies to ensure the knowledge graph has complete data.
 *
 * Two populations:
 *
 * 1. LEGACY CASE STUDIES (imported_case_studies + Neo4j)
 *    - Have HTML content in `content` field and `links` (URLs)
 *    - Generate summaries from existing HTML content (no re-scraping)
 *    - Write summary + title back to Neo4j CaseStudy nodes
 *
 * 2. PENDING/FAILED CASE STUDIES (firm_case_studies)
 *    - Have sourceUrl but never completed the ingestion pipeline
 *    - Re-queue through Inngest for full AI extraction
 *
 * Usage: npx tsx scripts/reingest-all-case-studies.ts [--dry-run] [--legacy-only] [--pending-only]
 *
 * Cost estimate: ~$0.001 per case study (Gemini Flash)
 * For 3,000 case studies: ~$3.00
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/lib/db";
import {
  importedCaseStudies,
  firmCaseStudies,
  serviceFirms,
} from "../src/lib/db/schema";
import { neo4jWrite, neo4jRead } from "../src/lib/neo4j";
import { eq, inArray, isNull, and, isNotNull, or, sql } from "drizzle-orm";
import { ingestCaseStudy } from "../src/lib/enrichment/case-study-ingestor";
import {
  generateCaseStudySummary,
} from "../src/lib/enrichment/case-study-analyzer";
import { writeCaseStudyToGraph } from "../src/lib/enrichment/graph-writer";
import type { CaseStudyCosAnalysis } from "../src/lib/enrichment/case-study-ingestor";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const FLASH_MODEL = "google/gemini-2.0-flash-001";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LEGACY_ONLY = args.includes("--legacy-only");
const PENDING_ONLY = args.includes("--pending-only");

// Rate limiting: don't hammer the AI
const BATCH_SIZE = 10;
const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Part 1: Legacy Case Studies (from imported_case_studies) ──

async function processLegacyCaseStudies() {
  console.log("\n═══ Part 1: Legacy Case Studies ═══\n");

  // Find Neo4j CaseStudy nodes that have no summary but have 'about' content
  const noSummaryNodes = await neo4jRead<{
    legacyId: string;
    about: string | null;
    links: string[] | null;
    orgName: string | null;
  }>(
    `MATCH (cs:CaseStudy)
     WHERE cs.summary IS NULL AND cs.about IS NOT NULL AND size(cs.about) > 50
     RETURN cs.legacyId AS legacyId, cs.about AS about,
            cs.links AS links, cs.orgName AS orgName
     LIMIT 5000`
  );

  console.log(`Found ${noSummaryNodes.length} legacy case studies with content but no summary`);

  if (DRY_RUN) {
    console.log("[DRY RUN] Would process these. Exiting.");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < noSummaryNodes.length; i += BATCH_SIZE) {
    const batch = noSummaryNodes.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (node) => {
        processed++;
        try {
          if (!node.about || node.about.length < 50) return;

          // Strip HTML tags for AI processing
          const cleanText = node.about
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim();

          if (cleanText.length < 50) return;

          // Direct AI extraction — skip the ingestor (which requires a real firmId for audit logs)
          let analysis: CaseStudyCosAnalysis | null = null;
          try {
            const result = await generateObject({
              model: openrouter.chat(FLASH_MODEL),
              prompt: `Extract structured case study data from this content. If it's not a real case study (no specific client, no specific work done), set isCaseStudy to false.\n\nCONTENT:\n${cleanText.slice(0, 12000)}`,
              schema: z.object({
                isCaseStudy: z.boolean(),
                title: z.string(),
                clientName: z.string().optional(),
                clientIndustry: z.string().optional(),
                challenge: z.string().optional(),
                solution: z.string().optional(),
                outcomes: z.array(z.string()),
                metrics: z.array(z.object({ label: z.string(), value: z.string(), improvement: z.string().optional() })),
                servicesUsed: z.array(z.string()),
                skillsDemonstrated: z.array(z.string()),
                industries: z.array(z.string()),
                confidence: z.number(),
              }),
            });
            if (result.object.isCaseStudy) {
              analysis = { ...result.object, approach: undefined, projectDuration: undefined, teamSize: undefined };
            }
          } catch {
            // AI extraction failed — fall back to basic summary
          }

          if (!analysis) {
            // Not a case study or extraction failed — use truncated content as summary
            const basicSummary = cleanText.length > 200
              ? cleanText.slice(0, 197) + "..."
              : cleanText;

            await neo4jWrite(
              `MATCH (cs:CaseStudy {legacyId: $legacyId})
               SET cs.summary = $summary`,
              { legacyId: node.legacyId, summary: basicSummary }
            );
            succeeded++;
            return;
          }

          // Generate proper 2-sentence summary
          const visibleLayer = await generateCaseStudySummary(analysis);

          // Write back to Neo4j
          await neo4jWrite(
            `MATCH (cs:CaseStudy {legacyId: $legacyId})
             SET cs.summary = $summary,
                 cs.title = CASE WHEN cs.title IS NULL THEN $title ELSE cs.title END`,
            {
              legacyId: node.legacyId,
              summary: visibleLayer.summary,
              title: analysis.title,
            }
          );

          // Also link skills and industries if we extracted them
          if (analysis.skillsDemonstrated?.length) {
            await neo4jWrite(
              `MATCH (cs:CaseStudy {legacyId: $legacyId})
               UNWIND $skills AS skillName
               MERGE (s:Skill {name: skillName})
               MERGE (cs)-[:DEMONSTRATES_SKILL]->(s)`,
              { legacyId: node.legacyId, skills: analysis.skillsDemonstrated }
            );
          }
          if (analysis.industries?.length) {
            await neo4jWrite(
              `MATCH (cs:CaseStudy {legacyId: $legacyId})
               UNWIND $industries AS indName
               MERGE (i:Industry {name: indName})
               MERGE (cs)-[:IN_INDUSTRY]->(i)`,
              { legacyId: node.legacyId, industries: analysis.industries }
            );
          }

          succeeded++;
        } catch (err) {
          console.error(`  [${processed}] Failed ${node.legacyId}:`, String(err).slice(0, 100));
          failed++;
        }
      })
    );

    console.log(`  Batch ${Math.ceil((i + 1) / BATCH_SIZE)}: ${processed}/${noSummaryNodes.length} (${succeeded} ok, ${failed} failed)`);
    await sleep(DELAY_MS);
  }

  return { processed, succeeded, failed };
}

// ─── Part 2: Pending/Failed case studies (from firm_case_studies) ──

async function processPendingCaseStudies() {
  console.log("\n═══ Part 2: Pending/Failed Case Studies ═══\n");

  // Find all case studies stuck in pending, ingesting, or failed that have a sourceUrl
  const pending = await db
    .select({
      id: firmCaseStudies.id,
      firmId: firmCaseStudies.firmId,
      organizationId: firmCaseStudies.organizationId,
      sourceUrl: firmCaseStudies.sourceUrl,
      status: firmCaseStudies.status,
    })
    .from(firmCaseStudies)
    .where(
      and(
        or(
          eq(firmCaseStudies.status, "pending"),
          eq(firmCaseStudies.status, "ingesting"),
          eq(firmCaseStudies.status, "failed")
        ),
        isNotNull(firmCaseStudies.sourceUrl)
      )
    );

  console.log(`Found ${pending.length} pending/failed case studies with URLs`);
  const byStatus = pending.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("  By status:", byStatus);

  if (DRY_RUN) {
    console.log("[DRY RUN] Would re-ingest these. Exiting.");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row) => {
        processed++;
        try {
          // Reset status
          await db
            .update(firmCaseStudies)
            .set({ status: "ingesting", statusMessage: null, updatedAt: new Date() })
            .where(eq(firmCaseStudies.id, row.id));

          // Ingest from URL
          const analysis = await ingestCaseStudy({
            firmId: row.firmId,
            sourceType: "url",
            url: row.sourceUrl,
          });

          if (!analysis) {
            await db
              .update(firmCaseStudies)
              .set({
                status: "failed",
                statusMessage: "Content could not be extracted or is not a case study",
                updatedAt: new Date(),
              })
              .where(eq(firmCaseStudies.id, row.id));
            failed++;
            return;
          }

          // Generate summary
          const visibleLayer = await generateCaseStudySummary(analysis, {
            organizationId: row.organizationId,
            entityId: row.id,
          });

          // Write to Neo4j
          const graphNodeId = `${row.firmId}:cs:${Buffer.from(row.sourceUrl)
            .toString("base64url")
            .slice(0, 20)}`;

          await writeCaseStudyToGraph({
            caseStudyId: graphNodeId,
            firmId: row.firmId,
            title: analysis.title,
            summary: visibleLayer.summary,
            description: [analysis.challenge, analysis.solution]
              .filter(Boolean)
              .join(" → "),
            clientName: analysis.clientName,
            sourceUrl: row.sourceUrl,
            skills: analysis.skillsDemonstrated,
            industries: analysis.industries,
            outcomes: analysis.outcomes,
          });

          // Update PG
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
              ingestedAt: new Date(),
              lastIngestedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(firmCaseStudies.id, row.id));

          succeeded++;
        } catch (err) {
          console.error(`  [${processed}] Failed ${row.id}:`, String(err).slice(0, 100));
          // Mark as failed so we don't retry infinitely
          await db
            .update(firmCaseStudies)
            .set({
              status: "failed",
              statusMessage: `Re-ingestion error: ${String(err).slice(0, 200)}`,
              updatedAt: new Date(),
            })
            .where(eq(firmCaseStudies.id, row.id))
            .catch(() => {});
          failed++;
        }
      })
    );

    console.log(`  Batch ${Math.ceil((i + 1) / BATCH_SIZE)}: ${processed}/${pending.length} (${succeeded} ok, ${failed} failed)`);
    await sleep(DELAY_MS);
  }

  return { processed, succeeded, failed };
}

// ─── Part 3: Verify final state ──────────────────────────

async function verifyState() {
  console.log("\n═══ Final Verification ═══\n");

  const [withSummary] = await neo4jRead<{ count: number }>(
    `MATCH (cs:CaseStudy) WHERE cs.summary IS NOT NULL RETURN count(cs) AS count`
  );
  const [withoutSummary] = await neo4jRead<{ count: number }>(
    `MATCH (cs:CaseStudy) WHERE cs.summary IS NULL RETURN count(cs) AS count`
  );
  const [total] = await neo4jRead<{ count: number }>(
    `MATCH (cs:CaseStudy) RETURN count(cs) AS count`
  );

  console.log(`Neo4j CaseStudy nodes:`);
  console.log(`  Total: ${total?.count ?? 0}`);
  console.log(`  With summary: ${withSummary?.count ?? 0}`);
  console.log(`  Without summary: ${withoutSummary?.count ?? 0}`);

  const pgCounts = await db
    .select({
      status: firmCaseStudies.status,
      count: sql<number>`count(*)`,
    })
    .from(firmCaseStudies)
    .groupBy(firmCaseStudies.status);

  console.log(`\nPostgreSQL firm_case_studies:`);
  for (const row of pgCounts) {
    console.log(`  ${row.status}: ${row.count}`);
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Case Study Re-Ingestion Pipeline       ║");
  console.log("╚══════════════════════════════════════════╝");
  if (DRY_RUN) console.log("  [DRY RUN MODE — no changes will be made]");

  const results: Record<string, { processed: number; succeeded: number; failed: number }> = {};

  if (!PENDING_ONLY) {
    results.legacy = await processLegacyCaseStudies();
  }

  if (!LEGACY_ONLY) {
    results.pending = await processPendingCaseStudies();
  }

  await verifyState();

  console.log("\n═══ Summary ═══\n");
  for (const [key, val] of Object.entries(results)) {
    console.log(`${key}: ${val.succeeded} succeeded, ${val.failed} failed (${val.processed} total)`);
  }

  console.log("\n✓ Re-ingestion complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
