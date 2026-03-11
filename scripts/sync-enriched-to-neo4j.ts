/**
 * @deprecated Track A: imported_clients table was truncated.
 * This script will return empty results. Graph sync now happens
 * via graph-writer.ts called from Inngest enrichment functions.
 *
 * Sync Enriched Client Data: PostgreSQL → Neo4j
 *
 * Pushes enrichment data (logo, description, employees, revenue, location,
 * tags, tech stack, etc.) from the `imported_clients` table to existing
 * Company nodes in Neo4j.
 *
 * Matching strategy:
 *   1. Primary: Match by `legacyId` ↔ `sourceId` (most clients)
 *   2. Fallback: Match by `name` (trimmed, case-insensitive)
 *
 * Usage:
 *   npx tsx scripts/sync-enriched-to-neo4j.ts                # Default: all enriched
 *   npx tsx scripts/sync-enriched-to-neo4j.ts --limit 100    # Limit batch
 *   npx tsx scripts/sync-enriched-to-neo4j.ts --dry-run      # Preview only
 *   npx tsx scripts/sync-enriched-to-neo4j.ts --all          # ALL clients (not just enriched)
 *   npx tsx scripts/sync-enriched-to-neo4j.ts --clean-names  # Also fix whitespace in names
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import neo4j, { type Driver } from "neo4j-driver";

const sql = neon(process.env.DATABASE_URL!);

// ── Neo4j Connection ─────────────────────────────────────

function createNeo4jDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    console.error("❌ Missing NEO4J_URI, NEO4J_USERNAME, or NEO4J_PASSWORD in .env.local");
    process.exit(1);
  }

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

const driver = createNeo4jDriver();

async function neo4jWriteBatch<T>(
  cypher: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

async function neo4jReadQuery<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

// ── Args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SYNC_ALL = args.includes("--all");
const CLEAN_NAMES = args.includes("--clean-names");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 500 : 999999;
const BATCH_SIZE = 100;

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Sync Enriched Client Data → Neo4j Company Nodes");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(`Mode:       ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Scope:      ${SYNC_ALL ? "ALL clients" : "Enriched clients only"}`);
  console.log(`Limit:      ${LIMIT === 999999 ? "ALL" : LIMIT}`);
  console.log(`Clean names: ${CLEAN_NAMES ? "YES" : "NO"}\n`);

  // Verify Neo4j connectivity
  try {
    await driver.verifyConnectivity();
    console.log("✓ Connected to Neo4j\n");
  } catch (err) {
    console.error("❌ Failed to connect to Neo4j:", err);
    process.exit(1);
  }

  // Step 0: Get stats on what's in Neo4j
  const neo4jStats = await neo4jReadQuery<{ total: { low: number } }>(
    `MATCH (c:Company) RETURN count(c) AS total`
  );
  const neo4jCompanyCount = neo4jStats[0]?.total?.low ?? 0;
  console.log(`Neo4j Company nodes: ${neo4jCompanyCount.toLocaleString()}`);

  // Step 1: Get enriched clients from PostgreSQL
  // Use tagged templates as required by neon serverless driver
  const clients = SYNC_ALL
    ? await sql`
        SELECT id, source_id, name, domain, logo_url, description,
               industry, sector, sub_industry, employee_count,
               employee_count_exact, employee_range, estimated_revenue,
               location, city, state, country, country_code,
               company_type, founded_year, linkedin_url, twitter_url,
               facebook_url, tags, tech_stack, funding_raised,
               latest_funding_stage, enriched_at, website
        FROM imported_clients
        ORDER BY name
        LIMIT ${LIMIT}
      `
    : await sql`
        SELECT id, source_id, name, domain, logo_url, description,
               industry, sector, sub_industry, employee_count,
               employee_count_exact, employee_range, estimated_revenue,
               location, city, state, country, country_code,
               company_type, founded_year, linkedin_url, twitter_url,
               facebook_url, tags, tech_stack, funding_raised,
               latest_funding_stage, enriched_at, website
        FROM imported_clients
        WHERE enriched_at IS NOT NULL OR domain IS NOT NULL
        ORDER BY name
        LIMIT ${LIMIT}
      `;

  console.log(`PostgreSQL clients to sync: ${clients.length.toLocaleString()}\n`);

  if (clients.length === 0) {
    console.log("Nothing to sync.");
    await driver.close();
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run — showing first 10:");
    for (const c of clients.slice(0, 10)) {
      console.log(`  ${c.name?.trim()} (${c.domain || "no domain"}) — enriched: ${c.enriched_at ? "YES" : "no"}`);
    }
    console.log(`\n  ... and ${Math.max(0, clients.length - 10)} more`);
    await driver.close();
    return;
  }

  // Step 2: Clean names if requested (fix whitespace in Neo4j)
  if (CLEAN_NAMES) {
    console.log("── Cleaning whitespace in Company names ──\n");
    const cleanResult = await neo4jWriteBatch<{ cleaned: { low: number } }>(
      `MATCH (c:Company)
       WHERE c.name CONTAINS '\\n' OR c.name STARTS WITH ' ' OR c.name ENDS WITH ' '
       SET c.name = trim(replace(replace(c.name, '\\n', ''), '\\r', ''))
       RETURN count(c) AS cleaned`,
      {}
    );
    console.log(`  Cleaned ${cleanResult[0]?.cleaned?.low ?? 0} Company names\n`);
  }

  // Step 3: Sync enrichment data in batches
  console.log("── Syncing enrichment data ──\n");

  let matched = 0;
  let unmatched = 0;
  let errors = 0;
  const unmatchedNames: string[] = [];

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(clients.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} clients)... `);

    // Map PostgreSQL rows to Neo4j property objects
    const items = batch.map((c) => ({
      sourceId: c.source_id,
      name: c.name?.trim(),
      domain: c.domain || null,
      logoUrl: c.logo_url || null,
      description: c.description || null,
      industry: c.industry || null,
      sector: c.sector || null,
      subIndustry: c.sub_industry || null,
      employeeCount: c.employee_count || null,
      employeeCountExact: c.employee_count_exact || null,
      employeeRange: c.employee_range || null,
      estimatedRevenue: c.estimated_revenue || null,
      location: c.location || null,
      city: c.city || null,
      state: c.state || null,
      country: c.country || null,
      countryCode: c.country_code || null,
      companyType: c.company_type || null,
      foundedYear: c.founded_year || null,
      linkedinUrl: c.linkedin_url || null,
      twitterUrl: c.twitter_url || null,
      facebookUrl: c.facebook_url || null,
      tags: c.tags || null,
      techStack: c.tech_stack || null,
      fundingRaised: c.funding_raised || null,
      latestFundingStage: c.latest_funding_stage || null,
      enrichedAt: c.enriched_at ? new Date(c.enriched_at).toISOString() : null,
      website: c.website || null,
    }));

    try {
      // MERGE by legacyId (primary matching strategy for legacy-imported clients)
      // Also try matching by trimmed name as fallback for any nodes without legacyId
      const result = await neo4jWriteBatch<{
        sourceId: string;
        matchType: string;
      }>(
        `UNWIND $items AS item

         // Try to find by legacyId first
         OPTIONAL MATCH (c1:Company {legacyId: item.sourceId})

         // Fallback: try matching by exact trimmed name
         OPTIONAL MATCH (c2:Company)
         WHERE c2.legacyId IS NULL
           AND c2.sourceId IS NULL
           AND trim(c2.name) = item.name

         // Use whichever matched (prefer legacyId match)
         WITH item,
              CASE
                WHEN c1 IS NOT NULL THEN c1
                WHEN c2 IS NOT NULL THEN c2
                ELSE NULL
              END AS c,
              CASE
                WHEN c1 IS NOT NULL THEN 'legacyId'
                WHEN c2 IS NOT NULL THEN 'name'
                ELSE 'none'
              END AS matchType

         WHERE c IS NOT NULL

         // Set all enrichment properties (COALESCE preserves existing if new is null)
         SET c.name = COALESCE(item.name, c.name),
             c.domain = COALESCE(item.domain, c.domain),
             c.logoUrl = COALESCE(item.logoUrl, c.logoUrl),
             c.description = COALESCE(item.description, c.description),
             c.industry = COALESCE(item.industry, c.industry),
             c.sector = COALESCE(item.sector, c.sector),
             c.subIndustry = COALESCE(item.subIndustry, c.subIndustry),
             c.employeeCount = COALESCE(item.employeeCount, c.employeeCount),
             c.employeeCountExact = item.employeeCountExact,
             c.employeeRange = COALESCE(item.employeeRange, c.employeeRange),
             c.estimatedRevenue = COALESCE(item.estimatedRevenue, c.estimatedRevenue),
             c.location = COALESCE(item.location, c.location),
             c.city = COALESCE(item.city, c.city),
             c.state = COALESCE(item.state, c.state),
             c.country = COALESCE(item.country, c.country),
             c.countryCode = COALESCE(item.countryCode, c.countryCode),
             c.companyType = COALESCE(item.companyType, c.companyType),
             c.foundedYear = item.foundedYear,
             c.linkedinUrl = COALESCE(item.linkedinUrl, c.linkedinUrl),
             c.twitterUrl = COALESCE(item.twitterUrl, c.twitterUrl),
             c.facebookUrl = COALESCE(item.facebookUrl, c.facebookUrl),
             c.tags = COALESCE(item.tags, c.tags),
             c.techStack = COALESCE(item.techStack, c.techStack),
             c.fundingRaised = COALESCE(item.fundingRaised, c.fundingRaised),
             c.latestFundingStage = COALESCE(item.latestFundingStage, c.latestFundingStage),
             c.enrichedAt = item.enrichedAt,
             c.website = COALESCE(item.website, c.website),
             c.updatedAt = datetime()

         RETURN item.sourceId AS sourceId, matchType`,
        { items }
      );

      const batchMatched = result.length;
      const batchUnmatched = batch.length - batchMatched;
      matched += batchMatched;
      unmatched += batchUnmatched;

      // Track match types
      const byLegacyId = result.filter((r) => r.matchType === "legacyId").length;
      const byName = result.filter((r) => r.matchType === "name").length;

      // Find unmatched for debugging
      const matchedSourceIds = new Set(result.map((r) => r.sourceId));
      for (const item of items) {
        if (!matchedSourceIds.has(item.sourceId)) {
          unmatchedNames.push(item.name || "unnamed");
        }
      }

      console.log(
        `✓ ${batchMatched} matched (${byLegacyId} by legacyId, ${byName} by name), ${batchUnmatched} unmatched`
      );
    } catch (err) {
      errors += batch.length;
      console.log(`✗ Error: ${err}`);
    }
  }

  // Step 4: Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Sync Complete");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total processed: ${clients.length.toLocaleString()}`);
  console.log(`  Matched & updated: ${matched.toLocaleString()}`);
  console.log(`  Unmatched:         ${unmatched.toLocaleString()}`);
  console.log(`  Errors:            ${errors}`);
  console.log(`  Match rate:        ${((matched / clients.length) * 100).toFixed(1)}%`);

  if (unmatchedNames.length > 0 && unmatchedNames.length <= 20) {
    console.log(`\n  Unmatched clients:`);
    for (const name of unmatchedNames) {
      console.log(`    - ${name}`);
    }
  } else if (unmatchedNames.length > 20) {
    console.log(`\n  First 20 unmatched:`);
    for (const name of unmatchedNames.slice(0, 20)) {
      console.log(`    - ${name}`);
    }
    console.log(`    ... and ${unmatchedNames.length - 20} more`);
  }

  // Step 5: Verify enrichment in Neo4j
  console.log("\n── Neo4j Enrichment Coverage ──\n");

  const coverage = await neo4jReadQuery<{
    total: { low: number };
    hasLogo: { low: number };
    hasDomain: { low: number };
    hasDescription: { low: number };
    hasEmployees: { low: number };
    hasRevenue: { low: number };
    hasCity: { low: number };
    hasLinkedin: { low: number };
    hasTags: { low: number };
    hasEnriched: { low: number };
  }>(
    `MATCH (c:Company)
     RETURN count(c) AS total,
            count(c.logoUrl) AS hasLogo,
            count(c.domain) AS hasDomain,
            count(c.description) AS hasDescription,
            count(c.employeeCountExact) AS hasEmployees,
            count(c.estimatedRevenue) AS hasRevenue,
            count(c.city) AS hasCity,
            count(c.linkedinUrl) AS hasLinkedin,
            count(c.tags) AS hasTags,
            count(c.enrichedAt) AS hasEnriched`
  );

  if (coverage.length > 0) {
    const s = coverage[0];
    const t = s.total?.low ?? 0;
    const pct = (val: { low: number }) => t > 0 ? `${Math.round(((val?.low ?? 0) / t) * 100)}%` : "0%";

    console.log(`  Total Company nodes:  ${t.toLocaleString()}`);
    console.log(`  Has domain:           ${(s.hasDomain?.low ?? 0).toLocaleString()} (${pct(s.hasDomain)})`);
    console.log(`  Has logo URL:         ${(s.hasLogo?.low ?? 0).toLocaleString()} (${pct(s.hasLogo)})`);
    console.log(`  Has description:      ${(s.hasDescription?.low ?? 0).toLocaleString()} (${pct(s.hasDescription)})`);
    console.log(`  Has employee count:   ${(s.hasEmployees?.low ?? 0).toLocaleString()} (${pct(s.hasEmployees)})`);
    console.log(`  Has revenue:          ${(s.hasRevenue?.low ?? 0).toLocaleString()} (${pct(s.hasRevenue)})`);
    console.log(`  Has city:             ${(s.hasCity?.low ?? 0).toLocaleString()} (${pct(s.hasCity)})`);
    console.log(`  Has LinkedIn:         ${(s.hasLinkedin?.low ?? 0).toLocaleString()} (${pct(s.hasLinkedin)})`);
    console.log(`  Has tags:             ${(s.hasTags?.low ?? 0).toLocaleString()} (${pct(s.hasTags)})`);
    console.log(`  PDL enriched:         ${(s.hasEnriched?.low ?? 0).toLocaleString()} (${pct(s.hasEnriched)})`);
  }

  await driver.close();
  console.log("\n✓ Done. Neo4j driver closed.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  driver.close();
  process.exit(1);
});
