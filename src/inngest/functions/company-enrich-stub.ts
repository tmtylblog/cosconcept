/**
 * Background Job: Enrich Company Stub Nodes via PDL
 *
 * Company nodes created from client extractions start as "stub" nodes with only
 * a name (and sometimes a domain). This job enriches them with real company data
 * from People Data Labs:
 *
 *   1. Find Company stubs (enrichmentStatus = "stub")
 *   2. Hit PDL company/enrich by domain (if available) or name
 *   3. Update Company node with industry, size, location, description
 *   4. Set enrichmentStatus = "enriched" (or "needs_linkedin" if PDL misses)
 *   5. Dedup: if PDL returns a domain that matches an existing Company node,
 *      merge the stub into the canonical node and repoint edges
 *
 * Rate limit: processes 20 stubs per run to stay within PDL quota.
 * Triggered by cron (hourly) or after firm enrichment creates new client stubs.
 *
 * Triggered by: company/enrich-stub event OR cron schedule
 */

import { inngest } from "../client";
import { neo4jWrite } from "@/lib/neo4j";
import { enrichCompanyWithFallback } from "@/lib/enrichment/company-enrichment";

const BATCH_SIZE = 20;

export const companyEnrichStub = inngest.createFunction(
  {
    id: "company-enrich-stub",
    name: "Enrich Company Stub Nodes",
    retries: 2,
    concurrency: { limit: 1 }, // one run at a time
  },
  [
    { event: "company/enrich-stub" },
    { cron: "0 * * * *" }, // every hour
  ],
  async ({ step }) => {
    // Step 1: Fetch a batch of stub Company nodes
    const stubs = await step.run("fetch-stubs", async () => {
      const result = await neo4jWrite(
        `MATCH (c:Company)
         WHERE c.enrichmentStatus = "stub"
           AND NOT c:ServiceFirm  -- skip COS member firms (they enrich via deep-crawl)
         RETURN c.name AS name, c.domain AS domain, elementId(c) AS nodeId
         ORDER BY c.createdAt ASC
         LIMIT $limit`,
        { limit: BATCH_SIZE }
      );
      return result as { name: string; domain: string | null; nodeId: string }[];
    });

    if (stubs.length === 0) {
      return { message: "No Company stubs to enrich", enriched: 0 };
    }

    let enriched = 0;
    let notFound = 0;

    for (const stub of stubs) {
      await step.run(`enrich-${stub.nodeId}`, async () => {
        try {
          const enrichResult = await enrichCompanyWithFallback(
            stub.domain
              ? { website: stub.domain }
              : { name: stub.name }
          );
          const pdl = enrichResult.company;

          if (!pdl) {
            // PDL has no data — mark as enriched with whatever we have
            await neo4jWrite(
              `MATCH (c:Company) WHERE elementId(c) = $nodeId
               SET c.enrichmentStatus = "needs_linkedin",
                   c.enrichedAt = datetime()`,
              { nodeId: stub.nodeId }
            );
            notFound++;
            return;
          }

          const resolvedDomain =
            pdl.website
              ? new URL(
                  pdl.website.startsWith("http") ? pdl.website : `https://${pdl.website}`
                ).hostname.replace(/^www\./, "")
              : stub.domain;

          // Dedup check: if PDL returned a domain and a Company node with that domain
          // already exists, we need to merge edges from the stub to the canonical node.
          if (resolvedDomain && !stub.domain) {
            await neo4jWrite(
              `MATCH (stub:Company) WHERE elementId(stub) = $nodeId
               OPTIONAL MATCH (canonical:Company {domain: $domain})
               WHERE elementId(canonical) <> $nodeId
               WITH stub, canonical
               CALL {
                 WITH stub, canonical
                 WITH stub, canonical
                 WHERE canonical IS NOT NULL
                 // Repoint HAS_CLIENT edges
                 OPTIONAL MATCH (f:ServiceFirm)-[:HAS_CLIENT]->(stub)
                 FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
                   MERGE (f)-[:HAS_CLIENT]->(canonical)
                 )
                 // Repoint FOR_CLIENT edges
                 WITH stub, canonical
                 OPTIONAL MATCH (cs:CaseStudy)-[:FOR_CLIENT]->(stub)
                 FOREACH (_ IN CASE WHEN cs IS NOT NULL THEN [1] ELSE [] END |
                   MERGE (cs)-[:FOR_CLIENT]->(canonical)
                 )
                 SET stub.isLegacy = true,
                     stub.enrichmentStatus = "merged",
                     stub.mergedInto = $domain
                 RETURN true AS merged
               }
               WITH stub, canonical
               WHERE canonical IS NULL
               // No existing canonical node — promote this stub to canonical
               SET stub.domain = $domain
               RETURN stub`,
              { nodeId: stub.nodeId, domain: resolvedDomain }
            );
          }

          // Update Company node with PDL data
          await neo4jWrite(
            `MATCH (c:Company) WHERE elementId(c) = $nodeId
               AND c.enrichmentStatus <> "merged"
             SET c.name = coalesce($pdlName, c.name),
                 c.domain = coalesce($domain, c.domain),
                 c.description = $description,
                 c.industry = $industry,
                 c.employeeCount = $employeeCount,
                 c.location = $location,
                 c.foundedYear = $foundedYear,
                 c.enrichmentStatus = "enriched",
                 c.enrichedAt = datetime()`,
            {
              nodeId: stub.nodeId,
              pdlName: pdl.name || null,
              domain: resolvedDomain ?? null,
              description: pdl.headline ?? null,
              industry: pdl.industry ?? null,
              employeeCount: pdl.employeeCount ?? null,
              location: pdl.location?.name ?? null,
              foundedYear: pdl.founded ?? null,
            }
          );

          enriched++;
        } catch (err) {
          console.error(
            `[CompanyEnrich] Failed to enrich stub "${stub.name}":`,
            err
          );
          // Don't throw — move on to next stub
        }
      });
    }

    console.log(
      `[CompanyEnrich] Batch complete: ${enriched} enriched, ${notFound} not found in PDL, out of ${stubs.length} stubs`
    );

    return { enriched, notFound, total: stubs.length };
  }
);
