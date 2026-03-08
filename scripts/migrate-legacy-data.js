#!/usr/bin/env node
/**
 * COS Legacy Data Migration Script
 *
 * Reads the JSON data dumps from data/legacy/ and pushes them through
 * the COS import API endpoints in batches.
 *
 * Usage:
 *   node scripts/migrate-legacy-data.js [--companies] [--contacts] [--clients] [--case-studies] [--sync] [--all]
 *
 * Requires:
 *   COS_API_URL   - e.g. https://cos-concept.vercel.app
 *   ADMIN_SECRET   - the admin secret for import endpoints
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ─── Config ────────────────────────────────────────────

const API_URL =
  process.env.COS_API_URL || "https://cos-concept.vercel.app";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "cos-seed-admin-2026";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50", 10);
const DATA_DIR = path.join(
  __dirname,
  "..",
  "data",
  "legacy",
  "Data Dump (JSON)"
);

// ─── HTTP Helper ───────────────────────────────────────

function postJSON(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === "https:" ? https : http;
    const data = JSON.stringify(body);

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 120000,
      },
      (res) => {
        let responseData = "";
        res.on("data", (chunk) => (responseData += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(responseData) });
          } catch (e) {
            resolve({ status: res.statusCode, body: responseData });
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.write(data);
    req.end();
  });
}

// ─── Load JSON ─────────────────────────────────────────

function loadJSON(relativePath) {
  const fullPath = path.join(DATA_DIR, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

// ─── Industry Lookup ───────────────────────────────────

function buildIndustryMap() {
  const data = loadJSON("Step 1_ System Data/industry.json");
  const map = new Map();
  const industries = data.data?.industry || data.data || [];
  for (const ind of (Array.isArray(industries) ? industries : [])) {
    if (ind.id && ind.name) map.set(ind.id, ind.name);
  }
  return map;
}

// ─── Migrate Companies ────────────────────────────────

async function migrateCompanies() {
  console.log("\n═══════════════════════════════════════");
  console.log("  MIGRATING COMPANIES");
  console.log("═══════════════════════════════════════\n");

  const orgData = loadJSON(
    "Step 2_ Organization Basic Data/organization.json"
  );
  const orgs = orgData.data.organisation;
  console.log(`Loaded ${orgs.length} organizations\n`);

  // Build industry map for ID -> name resolution
  const industryMap = buildIndustryMap();
  console.log(`Industry lookup: ${industryMap.size} industries loaded`);

  // Load organization services for enrichment
  let orgServices = [];
  try {
    const svcData = loadJSON(
      "Step 3_ Organization Content Data/organization-services.json"
    );
    // Navigate the data structure
    const keys = Object.keys(svcData.data);
    for (const k of keys) {
      const val = svcData.data[k];
      if (Array.isArray(val)) {
        orgServices = val;
        break;
      }
    }
    console.log(`Organization services: ${orgServices.length} loaded`);
  } catch (e) {
    console.log("Organization services: not found (skipping)");
  }

  // Build services map: orgId -> services[]
  const servicesMap = new Map();
  for (const svc of orgServices) {
    const orgId = svc.organisation_id || svc.organisationId;
    if (!orgId) continue;
    if (!servicesMap.has(orgId)) servicesMap.set(orgId, []);
    servicesMap.get(orgId).push(svc);
  }

  // Load case studies for enrichment
  let caseStudies = [];
  try {
    const csData = loadJSON(
      "Step 3_ Organization Content Data/case-studies.json"
    );
    caseStudies = csData.data.case_study || [];
    console.log(`Case studies: ${caseStudies.length} loaded`);
  } catch (e) {
    console.log("Case studies: not found (skipping)");
  }

  // Build case studies map: orgId -> case_study[]
  // Case studies are linked via user -> org, so we'll attach by org later
  // For now, skip this complexity and store count

  // Transform organizations to n8n-compatible format for our import endpoint
  const companies = orgs.map((org) => {
    const det = org.organisation_detail || {};
    const industry = industryMap.get(det.industry_id) || null;
    const services = servicesMap.get(org.id) || [];

    // Build location string
    const locationParts = [det.city, det.state, det.country].filter(Boolean);
    const location = locationParts.join(", ") || null;

    return {
      // Required by import endpoint
      id: org.id,
      company: det.business_name || "Unknown",
      domain: det.website || null,
      description: det.about || null,
      industry: industry,
      location_city: det.city || null,
      location_state: det.state || null,
      country: det.country || null,
      size: det.no_of_employees
        ? String(det.no_of_employees)
        : null,
      linkedin: det.linkedinUrl || null,

      // Additional legacy fields stored in legacyData
      address_1: det.address_1 || null,
      address_2: det.address_2 || null,
      zip_code: det.zip_code || null,
      legal_business_name: det.legal_business_name || null,
      professional_service_id: det.professional_service_id || null,
      professional_service_category_id:
        det.professional_service_category_id || null,
      industry_id: det.industry_id || null,

      // Services from organization_services
      services: services.map((s) => ({
        id: s.id,
        name: s.service_name || s.name,
        category: s.category || null,
      })),

      // Mark as ICP (professional services) since all orgs in COS are PS firms
      is_icp: true,
    };
  });

  // Send in batches
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(companies.length / BATCH_SIZE);

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} companies)... `
    );

    try {
      const res = await postJSON(
        `${API_URL}/api/admin/import/companies`,
        {
          batch,
          batchNumber: batchNum,
          totalBatches,
        }
      );

      if (res.status === 200 && res.body.success) {
        totalImported += res.body.imported;
        totalSkipped += res.body.skipped;
        console.log(
          `✓ imported: ${res.body.imported}, skipped: ${res.body.skipped}`
        );
      } else {
        totalErrors += batch.length;
        console.log(`✗ Error: ${JSON.stringify(res.body).substring(0, 200)}`);
      }
    } catch (err) {
      totalErrors += batch.length;
      console.log(`✗ Network error: ${err.message}`);
    }
  }

  console.log(`\n  ── Company Migration Summary ──`);
  console.log(`  Total:    ${companies.length}`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Errors:   ${totalErrors}`);

  return { imported: totalImported, skipped: totalSkipped, errors: totalErrors };
}

// ─── Migrate Contacts ─────────────────────────────────

async function migrateContacts() {
  console.log("\n═══════════════════════════════════════");
  console.log("  MIGRATING CONTACTS");
  console.log("═══════════════════════════════════════\n");

  // Load user basic data
  const basicData = loadJSON(
    "Step 3_ Organization Content Data/user-basic.json"
  );
  const users = basicData.data.user_meta;
  console.log(`Loaded ${users.length} users\n`);

  // Load user details for address/phone
  let detailsMap = new Map();
  try {
    const detData = loadJSON(
      "Step 4_ User Profile Data/user-details.json"
    );
    const details = detData.data.user_meta;
    for (const d of details) {
      detailsMap.set(d.id, d);
    }
    console.log(`User details: ${detailsMap.size} loaded`);
  } catch (e) {
    console.log("User details: not found (skipping)");
  }

  // Load specialized profiles for summaries
  let profilesMap = new Map();
  try {
    const profData = loadJSON(
      "Step 4_ User Profile Data/user-specialized-profile.json"
    );
    const profs = profData.data.user_meta;
    for (const p of profs) {
      if (p.user_profiles && p.user_profiles.length > 0) {
        profilesMap.set(p.id, p.user_profiles);
      }
    }
    console.log(`Specialized profiles: ${profilesMap.size} with data`);
  } catch (e) {
    console.log("Specialized profiles: not found (skipping)");
  }

  // Load work history
  let workHistoryMap = new Map();
  try {
    const whData = loadJSON(
      "Step 4_ User Profile Data/user-work-history.json"
    );
    const keys = Object.keys(whData.data);
    const whList = whData.data[keys[0]];
    if (Array.isArray(whList)) {
      for (const wh of whList) {
        if (wh.id) workHistoryMap.set(wh.id, wh);
      }
      console.log(`Work history: ${workHistoryMap.size} loaded`);
    }
  } catch (e) {
    console.log("Work history: not found (skipping)");
  }

  // Transform users to contact format
  const contacts = users.map((user) => {
    const details = detailsMap.get(user.id);
    const profiles = profilesMap.get(user.id) || [];
    const workHistory = workHistoryMap.get(user.id);
    const basicInfo = details?.user_basic_information || {};

    // Extract roles
    const roles = (user.user_meta_cos_user_roles || [])
      .map((r) => r.cos_user_role?.name)
      .filter(Boolean);

    // Get best profile summary
    const primaryProfile = profiles[0];
    const bio = primaryProfile?.summary || null;
    const headline = primaryProfile?.role || user.title || null;

    // Determine if partner/expert from roles
    const isPartner = roles.includes("Deal Maker") || roles.includes("Admin");
    const isExpert = roles.includes("Expert");

    return {
      // Required fields
      id: user.id,
      company_id: user.organisation?.id || null,
      company_name: user.organisation?.organisation_detail?.business_name || null,
      first_name: user.firstName || null,
      last_name: user.lastName || null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      email: user.email || null,
      title: user.title || headline || null,
      headline: headline,
      short_bio: bio,

      // Location from user details
      city: basicInfo.city || null,
      state: basicInfo.stateOrProvince || null,
      country: basicInfo.country || null,

      // Classification
      is_partner: isPartner,
      is_icp: true, // All COS platform users are PS professionals

      // Legacy data to preserve
      roles: roles,
      phone: basicInfo.phone || null,
      address: basicInfo.addressLine1 || null,
      skills: details?.user_skills || [],
      industry_experiences: details?.user_industry_experiences || [],
      market_experiences: details?.user_in_market_experiences || [],
      professional_info: details?.user_professional_information || null,
      profiles: profiles,
      work_history: workHistory?.user_work_histories || null,
    };
  });

  // Send in batches
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalFiltered = 0;
  const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} contacts)... `
    );

    try {
      const res = await postJSON(
        `${API_URL}/api/admin/import/contacts`,
        {
          batch,
          batchNumber: batchNum,
          totalBatches,
        }
      );

      if (res.status === 200 && res.body.success) {
        totalImported += res.body.imported;
        totalSkipped += res.body.skipped;
        totalFiltered += res.body.filteredInvestorContacts || 0;
        console.log(
          `✓ imported: ${res.body.imported}, skipped: ${res.body.skipped}, filtered: ${res.body.filteredInvestorContacts || 0}`
        );
      } else {
        totalErrors += batch.length;
        console.log(`✗ Error: ${JSON.stringify(res.body).substring(0, 200)}`);
      }
    } catch (err) {
      totalErrors += batch.length;
      console.log(`✗ Network error: ${err.message}`);
    }
  }

  console.log(`\n  ── Contact Migration Summary ──`);
  console.log(`  Total:            ${contacts.length}`);
  console.log(`  Imported:         ${totalImported}`);
  console.log(`  Skipped:          ${totalSkipped}`);
  console.log(`  Investor filtered: ${totalFiltered}`);
  console.log(`  Errors:           ${totalErrors}`);

  return { imported: totalImported, skipped: totalSkipped, filtered: totalFiltered, errors: totalErrors };
}

// ─── Migrate Clients ──────────────────────────────────

async function migrateClients() {
  console.log("\n═══════════════════════════════════════");
  console.log("  MIGRATING CLIENTS");
  console.log("═══════════════════════════════════════\n");

  const clientData = loadJSON(
    "Step 3_ Organization Content Data/clients.json"
  );
  const clients = clientData.data.company;
  console.log(`Loaded ${clients.length} client records\n`);

  // Send in batches
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(clients.length / BATCH_SIZE);

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} clients)... `
    );

    try {
      const res = await postJSON(
        `${API_URL}/api/admin/import/clients`,
        {
          batch,
          batchNumber: batchNum,
          totalBatches,
        }
      );

      if (res.status === 200 && res.body.success) {
        totalImported += res.body.imported;
        totalSkipped += res.body.skipped;
        console.log(
          `✓ imported: ${res.body.imported}, skipped: ${res.body.skipped}`
        );
      } else {
        totalErrors += batch.length;
        console.log(`✗ HTTP ${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`);
      }
    } catch (err) {
      totalErrors += batch.length;
      console.log(`✗ Network error: ${err.message}`);
    }

    // Small delay between batches to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n  ── Client Migration Summary ──`);
  console.log(`  Total:    ${clients.length}`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Errors:   ${totalErrors}`);

  return { imported: totalImported, skipped: totalSkipped, errors: totalErrors };
}

// ─── Migrate Case Studies ─────────────────────────────

async function migrateCaseStudies() {
  console.log("\n═══════════════════════════════════════");
  console.log("  MIGRATING CASE STUDIES");
  console.log("═══════════════════════════════════════\n");

  const csData = loadJSON(
    "Step 3_ Organization Content Data/case-studies.json"
  );
  const caseStudies = csData.data.case_study;
  console.log(`Loaded ${caseStudies.length} case study records\n`);

  // Send in batches
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(caseStudies.length / BATCH_SIZE);

  for (let i = 0; i < caseStudies.length; i += BATCH_SIZE) {
    const batch = caseStudies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} case studies)... `
    );

    try {
      const res = await postJSON(
        `${API_URL}/api/admin/import/case-studies`,
        {
          batch,
          batchNumber: batchNum,
          totalBatches,
        }
      );

      if (res.status === 200 && res.body.success) {
        totalImported += res.body.imported;
        totalSkipped += res.body.skipped;
        console.log(
          `✓ imported: ${res.body.imported}, skipped: ${res.body.skipped}`
        );
      } else {
        totalErrors += batch.length;
        console.log(`✗ HTTP ${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`);
      }
    } catch (err) {
      totalErrors += batch.length;
      console.log(`✗ Network error: ${err.message}`);
    }

    // Small delay between batches to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n  ── Case Study Migration Summary ──`);
  console.log(`  Total:    ${caseStudies.length}`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Errors:   ${totalErrors}`);

  return { imported: totalImported, skipped: totalSkipped, errors: totalErrors };
}

// ─── Sync Graph ───────────────────────────────────────

async function syncGraph(entityType) {
  console.log(`\n  Syncing ${entityType} to Neo4j graph...`);

  try {
    const res = await postJSON(
      `${API_URL}/api/admin/import/sync-graph`,
      { entityType, limit: 500 }
    );

    if (res.status === 200 && res.body.success) {
      console.log(
        `  ✓ Synced: ${res.body.synced}, Errors: ${res.body.errors}, Remaining: ${res.body.remaining}`
      );

      // If there are more, keep syncing
      if (res.body.remaining > 0) {
        console.log(`  Continuing sync for remaining ${res.body.remaining}...`);
        return syncGraph(entityType);
      }

      return res.body;
    } else {
      console.log(`  ✗ Error: ${JSON.stringify(res.body).substring(0, 200)}`);
      return null;
    }
  } catch (err) {
    console.log(`  ✗ Network error: ${err.message}`);
    return null;
  }
}

// ─── Get Stats ────────────────────────────────────────

async function getStats() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}/api/admin/import/stats`);
    const mod = url.protocol === "https:" ? https : http;

    mod
      .get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { "x-admin-secret": ADMIN_SECRET },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          });
        }
      )
      .on("error", reject);
  });
}

// ─── Main ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doAll = args.includes("--all") || args.length === 0;
  const doCompanies = doAll || args.includes("--companies");
  const doContacts = doAll || args.includes("--contacts");
  const doClients = doAll || args.includes("--clients");
  const doCaseStudies = doAll || args.includes("--case-studies");
  const doSync = doAll || args.includes("--sync");

  console.log("╔═══════════════════════════════════════╗");
  console.log("║   COS LEGACY DATA MIGRATION          ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log();
  console.log(`API: ${API_URL}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log(`Flags: ${args.join(" ") || "--all (default)"}`);
  console.log();

  // First, clean up test data from earlier
  const preStats = await getStats();
  console.log(
    `Pre-migration stats: ${preStats.companies?.total || 0} companies, ${preStats.contacts?.total || 0} contacts, ${preStats.clients?.total || 0} clients, ${preStats.caseStudies?.total || 0} case studies`
  );

  if (doCompanies) {
    await migrateCompanies();
  }

  if (doContacts) {
    await migrateContacts();
  }

  if (doClients) {
    await migrateClients();
  }

  if (doCaseStudies) {
    await migrateCaseStudies();
  }

  if (doSync) {
    console.log("\n═══════════════════════════════════════");
    console.log("  SYNCING TO NEO4J GRAPH");
    console.log("═══════════════════════════════════════");

    await syncGraph("companies");
    await syncGraph("contacts");
  }

  // Final stats
  console.log("\n═══════════════════════════════════════");
  console.log("  FINAL MIGRATION STATS");
  console.log("═══════════════════════════════════════\n");

  const stats = await getStats();
  console.log(`  Companies:    ${stats.companies?.total || 0} total`);
  console.log(`    → Graph:    ${stats.companies?.syncedToGraph || 0} synced`);
  console.log(`    → ICP:      ${stats.companies?.isIcp || 0}`);
  console.log(`    → Flagged:  ${stats.companies?.flagged || 0}`);
  console.log();
  console.log(`  Contacts:     ${stats.contacts?.total || 0} total`);
  console.log(`    → Graph:    ${stats.contacts?.syncedToGraph || 0} synced`);
  console.log(`    → Email:    ${stats.contacts?.withEmail || 0}`);
  console.log(`    → Experts:  ${stats.contacts?.experts || 0}`);
  console.log(`    → Internal: ${stats.contacts?.internal || 0}`);
  console.log();
  console.log(`  Clients:      ${stats.clients?.total || 0} total`);
  console.log(`    → Linked:   ${stats.clients?.linkedToCompany || 0}`);
  console.log();
  console.log(`  Case Studies: ${stats.caseStudies?.total || 0} total`);
  console.log(`    → Linked:   ${stats.caseStudies?.linkedToCompany || 0}`);
  console.log(`    → Published: ${stats.caseStudies?.published || 0}`);
  console.log();
  console.log(`  Outreach:     ${stats.outreach?.total || 0} total`);
  console.log();
  console.log("  Migration complete! ✓");
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err.message);
  process.exit(1);
});
