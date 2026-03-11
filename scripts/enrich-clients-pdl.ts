/**
 * @deprecated Track A: imported_clients table was truncated.
 * This script will return empty results. Use the enrichment pipeline
 * (Inngest functions) to enrich firms via PDL instead.
 *
 * Phase 2 Client Enrichment: PDL Company API
 *
 * Enriches clients with full company data from People Data Labs:
 *   - Description / summary
 *   - Exact employee count + range
 *   - Revenue (inferred_revenue)
 *   - Industry classification
 *   - Location (HQ city/state/country)
 *   - Social profiles (LinkedIn, Twitter, Facebook)
 *   - Founded year
 *   - Company type (public/private)
 *   - Tags
 *   - Funding data
 *
 * Usage:
 *   npx tsx scripts/enrich-clients-pdl.ts                    # Default: 100 clients
 *   npx tsx scripts/enrich-clients-pdl.ts --limit 500        # Custom limit
 *   npx tsx scripts/enrich-clients-pdl.ts --limit all        # All unenriched
 *   npx tsx scripts/enrich-clients-pdl.ts --dry-run          # Preview without API calls
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const PDL_API_KEY = process.env.PDL_API_KEY;
const PDL_BASE_URL = "https://api.peopledatalabs.com/v5/company/enrich";

if (!PDL_API_KEY) {
  console.error("❌ PDL_API_KEY not found in .env.local");
  process.exit(1);
}

// ── Args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit"))
  ? args[args.indexOf("--limit") + 1] || args[0]?.split("=")[1]
  : "100";
const DRY_RUN = args.includes("--dry-run");
const LIMIT = limitArg === "all" ? 999999 : parseInt(limitArg) || 100;

// ── PDL size → range mapping ────────────────────────────

const PDL_SIZE_MAP: Record<string, string> = {
  "1-10": "1-10",
  "11-50": "11-50",
  "51-200": "51-200",
  "201-500": "201-500",
  "501-1000": "501-1,000",
  "1001-5000": "1,001-5,000",
  "5001-10000": "5,001-10,000",
  "10001+": "10,001+",
};

// ── PDL API Call ─────────────────────────────────────────

interface PDLCompany {
  display_name?: string;
  name?: string;
  website?: string;
  summary?: string;
  headline?: string;
  industry?: string;
  industry_v2?: string;
  size?: string;
  employee_count?: number;
  founded?: number;
  type?: string;
  tags?: string[];
  location?: {
    name?: string;
    locality?: string;
    region?: string;
    country?: string;
    street_address?: string;
    postal_code?: string;
  };
  linkedin_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  profiles?: string[];
  inferred_revenue?: string;
  total_funding_raised?: number;
  latest_funding_stage?: string;
  funding_stages?: string[];
  ticker?: string;
}

async function enrichFromPDL(
  domain: string
): Promise<{ data: PDLCompany | null; status: number }> {
  const url = new URL(PDL_BASE_URL);
  url.searchParams.set("website", domain);
  url.searchParams.set("min_likelihood", "2");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": PDL_API_KEY!,
      Accept: "application/json",
    },
  });

  if (res.status === 200) {
    const data = await res.json();
    return { data, status: 200 };
  }

  if (res.status === 404) {
    return { data: null, status: 404 };
  }

  // Rate limited or error
  const body = await res.text();
  console.error(`  PDL ${res.status}: ${body.substring(0, 200)}`);
  return { data: null, status: res.status };
}

// ── Update Client ────────────────────────────────────────

async function updateClient(clientId: string, pdl: PDLCompany) {
  const description = pdl.summary || pdl.headline || null;
  const employeeCountExact = pdl.employee_count || null;
  const employeeRange = pdl.size ? (PDL_SIZE_MAP[pdl.size] || pdl.size) : null;
  const estimatedRevenue = pdl.inferred_revenue || null;
  const industry = pdl.industry || pdl.industry_v2 || null;
  const foundedYear = pdl.founded || null;
  const companyType = pdl.type || null;
  const loc = pdl.location?.name || null;
  const city = pdl.location?.locality || null;
  const state = pdl.location?.region || null;
  const country = pdl.location?.country || null;
  const linkedinUrl = pdl.linkedin_url || null;
  const twitterUrl = pdl.twitter_url || null;
  const facebookUrl = pdl.facebook_url || null;
  const tagsJson = pdl.tags?.length ? JSON.stringify(pdl.tags) : null;
  const fundingRaised = pdl.total_funding_raised
    ? `$${pdl.total_funding_raised.toLocaleString()}`
    : null;
  const latestFundingStage = pdl.latest_funding_stage || null;
  const today = new Date().toISOString().split("T")[0];
  const sourcesJson = JSON.stringify({ pdl: today });

  // Split into two updates to avoid JSONB parameter typing issues
  await sql`
    UPDATE imported_clients SET
      description = COALESCE(${description}, description),
      employee_count_exact = COALESCE(${employeeCountExact}::int, employee_count_exact),
      employee_range = COALESCE(${employeeRange}, employee_range),
      estimated_revenue = COALESCE(${estimatedRevenue}, estimated_revenue),
      industry = COALESCE(${industry}, industry),
      founded_year = COALESCE(${foundedYear}::int, founded_year),
      company_type = COALESCE(${companyType}, company_type),
      location = COALESCE(${loc}, location),
      city = COALESCE(${city}, city),
      state = COALESCE(${state}, state),
      country = COALESCE(${country}, country),
      linkedin_url = COALESCE(${linkedinUrl}, linkedin_url),
      twitter_url = COALESCE(${twitterUrl}, twitter_url),
      facebook_url = COALESCE(${facebookUrl}, facebook_url),
      funding_raised = COALESCE(${fundingRaised}, funding_raised),
      latest_funding_stage = COALESCE(${latestFundingStage}, latest_funding_stage),
      enriched_at = NOW(),
      updated_at = NOW()
    WHERE id = ${clientId}
  `;

  // Update JSONB fields separately with explicit casting
  if (tagsJson) {
    await sql.query(
      `UPDATE imported_clients SET tags = $1::jsonb WHERE id = $2`,
      [tagsJson, clientId]
    );
  }

  await sql.query(
    `UPDATE imported_clients SET enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
    [sourcesJson, clientId]
  );
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log("=== Phase 2: PDL Company Enrichment ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Limit: ${LIMIT === 999999 ? "ALL" : LIMIT}\n`);

  // Get unenriched clients that have domains
  const clients = await sql`
    SELECT id, name, domain
    FROM imported_clients
    WHERE domain IS NOT NULL
    AND enriched_at IS NULL
    ORDER BY name
    LIMIT ${LIMIT}
  `;

  console.log(`Found ${clients.length} unenriched clients with domains.\n`);

  if (clients.length === 0) {
    console.log("All clients with domains are already enriched.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run — showing first 10 that would be enriched:");
    for (const c of clients.slice(0, 10)) {
      console.log(`  ${c.name} (${c.domain})`);
    }
    return;
  }

  let enriched = 0;
  let notFound = 0;
  let errors = 0;
  let rateLimited = 0;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    process.stdout.write(
      `[${i + 1}/${clients.length}] ${client.name} (${client.domain})... `
    );

    try {
      const { data, status } = await enrichFromPDL(client.domain);

      if (status === 429) {
        console.log("⚠️  Rate limited — stopping.");
        rateLimited++;
        break;
      }

      if (!data || status === 404) {
        console.log("not found");
        notFound++;
        // Mark as attempted so we don't retry
        const attemptedJson = JSON.stringify({ pdl_attempted: new Date().toISOString().split("T")[0] });
        await sql.query(
          `UPDATE imported_clients SET enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [attemptedJson, client.id]
        );
        continue;
      }

      await updateClient(client.id, data);
      enriched++;
      console.log(`✓ ${data.display_name || data.name || "enriched"}`);

      // Small delay to be nice to PDL API (200ms between requests)
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      errors++;
      console.log(`✗ ${err}`);
    }
  }

  console.log("\n=== Phase 2 Complete ===");
  console.log(`Enriched:     ${enriched}`);
  console.log(`Not found:    ${notFound}`);
  console.log(`Errors:       ${errors}`);
  if (rateLimited) console.log(`Rate limited: stopped early`);

  // Show enrichment coverage
  const stats = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(enriched_at)::int as enriched,
      COUNT(description)::int as has_description,
      COUNT(estimated_revenue)::int as has_revenue,
      COUNT(employee_count_exact)::int as has_employee_count,
      COUNT(city)::int as has_city,
      COUNT(linkedin_url)::int as has_linkedin,
      COUNT(tags)::int as has_tags
    FROM imported_clients
  `;
  const s = stats[0];
  console.log(`\nEnrichment coverage:`);
  console.log(`  Total clients:     ${s.total}`);
  console.log(`  PDL enriched:      ${s.enriched} (${Math.round((s.enriched / s.total) * 100)}%)`);
  console.log(`  Has description:   ${s.has_description}`);
  console.log(`  Has revenue:       ${s.has_revenue}`);
  console.log(`  Has employee count:${s.has_employee_count}`);
  console.log(`  Has city:          ${s.has_city}`);
  console.log(`  Has LinkedIn:      ${s.has_linkedin}`);
  console.log(`  Has tags:          ${s.has_tags}`);
}

main().catch(console.error);
