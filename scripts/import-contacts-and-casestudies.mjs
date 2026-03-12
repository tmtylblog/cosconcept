/**
 * Bulk import legacy contacts + case studies into Neon.
 *
 * Sources merged for contacts:
 *   user-basic.json       → id, firstName, lastName, email, organisation, title, roles
 *   user-details.json     → skills, industry exp, professional info (LinkedIn URL), location
 *   user-work-history.json → work history array (merged into legacyData)
 *
 * Sources for case studies:
 *   case-studies.json     → content, skills, industries, companies, expert users, org
 *
 * Run: node scripts/import-contacts-and-casestudies.mjs
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

const BATCH_SIZE = 150;

// ─── Helpers ──────────────────────────────────────────────

async function batchInsert(tableName, columns, rows) {
  if (rows.length === 0) return 0;
  const colList = columns.join(", ");
  const placeholders = rows.map((_, i) => {
    const base = i * columns.length;
    return `(${columns.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  }).join(", ");
  const params = rows.flatMap((r) => columns.map((c) => r[c]));
  await sql.query(
    `INSERT INTO ${tableName} (${colList}) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`,
    params
  );
  return rows.length;
}

async function runBatches(rows, label, insertFn) {
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await insertFn(batch);
      inserted += batch.length;
    } catch (err) {
      console.error(`\n  [${label}] Batch ${i}–${i + batch.length} error:`, err.message.slice(0, 120));
      failed += batch.length;
    }
    const done = Math.min(i + batch.length, rows.length);
    const pct = Math.round((done / rows.length) * 100);
    process.stdout.write(`\r  [${label}] ${done}/${rows.length} (${pct}%)  `);
  }
  console.log(`\n  Done: ~${inserted} processed, ${failed} failed`);
  return inserted;
}

// ═══════════════════════════════════════════════════════════
// PART 1: CONTACTS
// ═══════════════════════════════════════════════════════════

console.log("\n=== Loading user files ===");

const basicRaw = JSON.parse(readFileSync(
  join(dataDir, "Step 3_ Organization Content Data/user-basic.json"), "utf8"
));
const detailsRaw = JSON.parse(readFileSync(
  join(dataDir, "Step 4_ User Profile Data/user-details.json"), "utf8"
));
const historyRaw = JSON.parse(readFileSync(
  join(dataDir, "Step 4_ User Profile Data/user-work-history.json"), "utf8"
));

const basicUsers = basicRaw.data.user_meta;            // 3,900 records
const detailUsers = detailsRaw.data.user_meta;          // 3,900 records
const historyUsers = historyRaw.data.user_meta;         // 1,383 records

console.log(`  user-basic:        ${basicUsers.length} records`);
console.log(`  user-details:      ${detailUsers.length} records`);
console.log(`  user-work-history: ${historyUsers.length} records`);

// Build lookup maps
const detailMap = new Map(detailUsers.map((u) => [u.id, u]));
const historyMap = new Map(historyUsers.map((u) => [u.id, u]));

// Merge and map to imported_contacts columns
const contactRows = basicUsers.map((basic) => {
  const detail = detailMap.get(basic.id) ?? {};
  const history = historyMap.get(basic.id) ?? {};

  const profInfo = detail.user_professional_information ?? {};
  const basicInfo = detail.user_basic_information ?? {};

  const skills = (detail.user_skills ?? []).map((s) => s.skill?.name).filter(Boolean);
  const industries = (detail.user_industry_experiences ?? []).map((i) => i.industry?.name).filter(Boolean);
  const roles = (basic.user_meta_cos_user_roles ?? []).map((r) => r.cos_user_role?.name).filter(Boolean);

  const firstName = basic.firstName ?? null;
  const lastName = basic.lastName ?? null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    id: basic.id,
    source_id: basic.id,
    source: "legacy_users",
    company_id: basic.organisation?.id ?? null, // FK to imported_companies (org UUID matches)
    first_name: firstName,
    last_name: lastName,
    name,
    email: basic.email ?? null,
    title: basic.title ?? null,
    linkedin_url: profInfo.linkedInUrl ?? null,
    photo_url: null,
    headline: null,
    short_bio: null,
    city: basicInfo.city ?? null,
    state: basicInfo.stateOrProvince ?? null,
    country: basicInfo.country ?? null,
    is_partner: null,
    is_icp: null,
    profile_match: null,
    profile_match_justification: null,
    expert_classification: roles.includes("Expert") ? "expert" : roles.includes("Admin") ? "internal" : null,
    graph_node_id: null,
    review_tags: JSON.stringify([]),
    legacy_data: JSON.stringify({
      basic,
      skills,
      industries,
      roles,
      profInfo,
      workHistory: history.work_history ?? [],
    }),
    meta: JSON.stringify({
      source: "legacy_users_json",
      migratedAt: new Date().toISOString(),
      organisationId: basic.organisation?.id ?? null,
      organisationName: basic.organisation?.organisation_detail?.business_name ?? null,
      skillCount: skills.length,
      industryCount: industries.length,
      hasWorkHistory: (history.work_history?.length ?? 0) > 0,
    }),
    created_at: new Date().toISOString(),
  };
});

console.log("\n=== Inserting contacts ===");

const CONTACT_COLS = [
  "id", "source_id", "source", "company_id", "first_name", "last_name", "name",
  "email", "title", "linkedin_url", "photo_url", "headline", "short_bio",
  "city", "state", "country", "is_partner", "is_icp",
  "profile_match", "profile_match_justification", "expert_classification",
  "graph_node_id", "review_tags", "legacy_data", "meta", "created_at",
];

await runBatches(contactRows, "contacts", (batch) =>
  batchInsert("imported_contacts", CONTACT_COLS, batch)
);

// ═══════════════════════════════════════════════════════════
// PART 2: CASE STUDIES
// ═══════════════════════════════════════════════════════════

console.log("\n=== Loading case-studies.json ===");

const csRaw = JSON.parse(readFileSync(
  join(dataDir, "Step 3_ Organization Content Data/case-studies.json"), "utf8"
));
const caseStudies = csRaw.data.case_study;
console.log(`  Found ${caseStudies.length} case study records`);
console.log(`  Published: ${caseStudies.filter((s) => s.status === "published").length}`);

const csRows = caseStudies.map((cs, i) => {
  // Deterministic ID: cs_{authorId}_{index} so re-runs are idempotent
  const id = `cs_${cs.authorId}_${i}`;

  const clientCompanies = (cs.case_study_companies ?? []).map((c) => ({
    id: c.companyID,
    name: c.company?.name ?? "",
  }));
  const industries = (cs.case_study_industries ?? []).map((c) => ({
    id: c.industry?.id ?? "",
    name: c.industry?.name ?? "",
  }));
  const skills = (cs.case_study_skills ?? []).map((c) => ({
    id: c.skill?.id ?? "",
    name: c.skill?.name ?? "",
  }));
  const links = (cs.case_study_links ?? []).map((l) => l.url ?? l).filter(Boolean);
  const markets = (cs.case_study_markets ?? []).map((m) => m.market?.name ?? m).filter(Boolean);
  const expertUsers = (cs.case_study_users ?? []).map((u) => ({
    id: u.user_meta?.id ?? "",
    name: u.user_meta?.name ?? "",
  }));

  return {
    id,
    source_id: cs.authorId ?? null,
    source: "legacy_case_studies",
    author_org_source_id: cs.organisation?.id ?? null,
    author_org_name: cs.organisation?.organisation_detail?.business_name ?? null,
    content: cs.about ?? null,
    summary: cs.summary ?? null,
    status: cs.status ?? "published",
    client_companies: JSON.stringify(clientCompanies),
    industries: JSON.stringify(industries),
    skills: JSON.stringify(skills),
    links: JSON.stringify(links),
    markets: JSON.stringify(markets),
    expert_users: JSON.stringify(expertUsers),
    imported_company_id: null,
    legacy_data: JSON.stringify(cs),
    meta: JSON.stringify({
      source: "legacy_case_studies_json",
      migratedAt: new Date().toISOString(),
      skillCount: skills.length,
      industryCount: industries.length,
      expertCount: expertUsers.length,
    }),
    created_at: new Date().toISOString(),
  };
});

console.log("\n=== Inserting case studies ===");

// Check current schema columns
const CS_COLS = [
  "id", "source_id", "source", "author_org_source_id", "author_org_name",
  "content", "status", "client_companies", "industries", "skills",
  "links", "markets", "expert_users", "imported_company_id",
  "legacy_data", "meta", "created_at",
];

// Check if summary column exists
let hasSummary = false;
try {
  await sql.query(`SELECT summary FROM imported_case_studies LIMIT 1`);
  hasSummary = true;
} catch {
  hasSummary = false;
}

if (hasSummary) CS_COLS.splice(6, 0, "summary");
else csRows.forEach((r) => delete r.summary);

await runBatches(csRows, "case-studies", (batch) =>
  batchInsert("imported_case_studies", CS_COLS, batch)
);

// ═══════════════════════════════════════════════════════════
// FINAL COUNT
// ═══════════════════════════════════════════════════════════

const [contacts, casestudies] = await Promise.all([
  sql`SELECT COUNT(*) FROM imported_contacts`,
  sql`SELECT COUNT(*) FROM imported_case_studies`,
]);

console.log("\n✅ Import complete!");
console.log(`   imported_contacts:     ${contacts[0].count}`);
console.log(`   imported_case_studies: ${casestudies[0].count}`);
