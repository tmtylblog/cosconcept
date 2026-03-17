/**
 * One-time fix: Update stale enrichment_cache entries for Chameleon Collective
 * that have 0 clients. Copies the 247 clients from the serviceFirms record
 * into the cache so future lookups/auto-retries don't overwrite good data.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { serviceFirms, enrichmentCache } from "../src/lib/db/schema";
import { eq, and, not, like } from "drizzle-orm";

const ORG_ID = "PtOUZvuB0UPqwHhSD9iWC0nhiRnCmV08";
const CACHE_DOMAINS = ["chameleon.co", "chameleoncollective.com"];

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  // Step 1: Find the correct firm record (the one with clients)
  const firms = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      enrichmentData: serviceFirms.enrichmentData,
    })
    .from(serviceFirms)
    .where(
      and(
        eq(serviceFirms.organizationId, ORG_ID),
        not(like(serviceFirms.id, "firm_leg_%"))
      )
    );

  console.log(`Found ${firms.length} non-legacy firms for org ${ORG_ID}:`);
  for (const f of firms) {
    const ed = f.enrichmentData as { extracted?: { clients?: string[] } } | null;
    console.log(`  ${f.id} "${f.name}" — ${ed?.extracted?.clients?.length ?? 0} clients`);
  }

  // Pick the firm with the most clients
  const best = firms.reduce((a, b) => {
    const aClients = (a.enrichmentData as { extracted?: { clients?: string[] } } | null)?.extracted?.clients?.length ?? 0;
    const bClients = (b.enrichmentData as { extracted?: { clients?: string[] } } | null)?.extracted?.clients?.length ?? 0;
    return bClients > aClients ? b : a;
  });

  const bestEd = best.enrichmentData as { extracted?: { clients?: string[] } } | null;
  const clientCount = bestEd?.extracted?.clients?.length ?? 0;
  console.log(`\nBest firm: "${best.name}" with ${clientCount} clients`);

  if (clientCount === 0) {
    console.log("No clients found in any firm record — nothing to fix.");
    return;
  }

  // Step 2: Update cache entries
  for (const domain of CACHE_DOMAINS) {
    const existing = await db
      .select({
        id: enrichmentCache.id,
        domain: enrichmentCache.domain,
        enrichmentData: enrichmentCache.enrichmentData,
      })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain));

    if (existing.length === 0) {
      console.log(`\nNo cache entry for ${domain} — skipping`);
      continue;
    }

    const cacheEd = existing[0].enrichmentData as Record<string, unknown>;
    const cacheExtracted = cacheEd?.extracted as { clients?: string[] } | undefined;
    const cacheClients = cacheExtracted?.clients?.length ?? 0;
    console.log(`\nCache entry for ${domain}: ${cacheClients} clients`);

    if (cacheClients >= clientCount) {
      console.log(`  Already has ${cacheClients} clients — skipping`);
      continue;
    }

    // Merge: keep existing cache data but update extracted with the good data
    const updatedData = {
      ...cacheEd,
      extracted: bestEd!.extracted,
    };

    await db
      .update(enrichmentCache)
      .set({
        enrichmentData: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(enrichmentCache.domain, domain));

    console.log(`  Updated ${domain} cache: 0 → ${clientCount} clients`);
  }

  console.log("\nDone.");
}

main().catch(console.error);
