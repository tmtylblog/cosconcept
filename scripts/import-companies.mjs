/**
 * Bulk import legacy company data into imported_companies table.
 * Sources:
 *   - clients.json (20,074 client companies: name, industry, size, website, parent org)
 *   - organization.json (1,096 service firms: name, about, linkedin, website, country, size)
 *
 * Run: node scripts/import-companies.mjs
 */

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const __dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dir, "../data/legacy/Data Dump (JSON)");

const BATCH_SIZE = 200;

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanDomain(website) {
  if (!website) return null;
  return website
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim()
    .toLowerCase() || null;
}

async function insertBatch(rows) {
  if (rows.length === 0) return 0;

  // Build parameterized insert with ON CONFLICT DO NOTHING (skip already-imported)
  const values = rows.map((r) => ({
    id: r.id,
    source_id: r.sourceId,
    source: r.source,
    name: r.name,
    domain: r.domain,
    description: r.description,
    industry: r.industry,
    location: r.location,
    country: r.country,
    size: r.size,
    linkedin_url: r.linkedinUrl,
    website_url: r.websiteUrl,
    is_icp: r.isIcp,
    legacy_data: JSON.stringify(r.legacyData),
    meta: JSON.stringify(r.meta),
    review_tags: JSON.stringify([]),
  }));

  // Use raw SQL for bulk insert via neon tagged template
  // Build multi-row insert
  const placeholders = values.map((_, i) => {
    const base = i * 17;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17})`;
  }).join(",");

  const params = values.flatMap((v) => [
    v.id, v.source_id, v.source, v.name, v.domain, v.description,
    v.industry, v.location, v.country, v.size, v.linkedin_url,
    v.website_url, v.is_icp, v.legacy_data, v.meta, v.review_tags,
    new Date().toISOString(),
  ]);

  await sql.query(
    `INSERT INTO imported_companies
      (id, source_id, source, name, domain, description, industry, location, country, size,
       linkedin_url, website_url, is_icp, legacy_data, meta, review_tags, created_at)
     VALUES ${placeholders}
     ON CONFLICT (id) DO NOTHING`,
    params
  );

  return rows.length;
}

async function runBatches(records, label) {
  let imported = 0;
  let skipped = 0;
  const total = records.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    try {
      const count = await insertBatch(batch);
      imported += count;
    } catch (err) {
      console.error(`  Batch ${i}–${i + BATCH_SIZE} error:`, err.message);
      skipped += batch.length;
    }
    const pct = Math.round(((i + batch.length) / total) * 100);
    process.stdout.write(`\r  [${label}] ${i + batch.length}/${total} (${pct}%)  `);
  }
  console.log(`\n  Done: ${imported} inserted, ${skipped} failed`);
  return imported;
}

// ─── 1. Import clients.json ────────────────────────────────
console.log("\n=== Loading clients.json ===");
const clientsRaw = JSON.parse(
  readFileSync(join(dataDir, "Step 3_ Organization Content Data/clients.json"), "utf8")
);
const clientCompanies = clientsRaw.data.company;
console.log(`  Found ${clientCompanies.length} client company records`);

const clientRows = clientCompanies.map((c) => ({
  id: c.id,
  sourceId: c.id,
  source: "legacy_clients",
  name: c.name || "Unknown",
  domain: cleanDomain(c.website),
  description: null,
  industry: c.industry?.name ?? null,
  location: null,
  country: null,
  size: c.noOfEmployees ? String(c.noOfEmployees) : null,
  linkedinUrl: null,
  websiteUrl: c.website || null,
  isIcp: false, // These are client companies (not service firms)
  legacyData: c,
  meta: {
    source: "legacy_clients_json",
    migratedAt: new Date().toISOString(),
    parentFirmId: c.organisation?.id ?? null,
    parentFirmName: c.organisation?.organisation_detail?.business_name ?? null,
  },
}));

console.log("=== Inserting client companies ===");
const clientsImported = await runBatches(clientRows, "clients");

// ─── 2. Import organization.json ───────────────────────────
console.log("\n=== Loading organization.json ===");
const orgRaw = JSON.parse(
  readFileSync(join(dataDir, "Step 2_ Organization Basic Data/organization.json"), "utf8")
);
const orgs = orgRaw.data.organisation;
console.log(`  Found ${orgs.length} organisation records`);

const orgRows = orgs.map((o) => {
  const d = o.organisation_detail;
  return {
    id: o.id,
    sourceId: o.id,
    source: "legacy_organisations",
    name: d.business_name || "Unknown",
    domain: cleanDomain(d.website),
    description: d.about || null,
    industry: null, // industry_id only — skip for now
    location: [d.city, d.state].filter(Boolean).join(", ") || null,
    country: d.country || null,
    size: d.no_of_employees ? String(d.no_of_employees) : null,
    linkedinUrl: d.linkedinUrl || null,
    websiteUrl: d.website || null,
    isIcp: true, // These are professional services firms
    legacyData: o,
    meta: {
      source: "legacy_organisations_json",
      migratedAt: new Date().toISOString(),
    },
  };
});

console.log("=== Inserting organisations ===");
const orgsImported = await runBatches(orgRows, "orgs");

// ─── 3. Final count ────────────────────────────────────────
const result = await sql`SELECT COUNT(*) as count FROM imported_companies`;
console.log(`\n✅ Import complete!`);
console.log(`   Clients inserted:       ${clientsImported}`);
console.log(`   Organisations inserted: ${orgsImported}`);
console.log(`   Total in DB now:        ${result[0].count}`);
