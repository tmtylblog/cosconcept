/**
 * Legacy Data Migration — Imports old Collective OS data into Neo4j.
 *
 * Reads JSON exports from the old PostgreSQL/Hasura system and writes
 * them into the new Neo4j knowledge graph. This is an EVOLUTION, not
 * a 1:1 copy — we adapt old structures to the new schema.
 *
 * Migration Steps (must run in order):
 * 1. System data — skills, professional services, industries, markets, languages
 * 2. Organizations — core tenant nodes
 * 3. Content — case studies, clients, services, users, opportunities, preferences
 * 4. User profiles — detailed profiles, work history
 * 5. Network data — match recommendations, match activities
 *
 * Uses MERGE (upsert) so it's safe to run multiple times.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { neo4jWrite } from "./neo4j";

// ─── Helpers ─────────────────────────────────────────────

const BATCH_SIZE = 250;
const LEGACY_DIR = join(process.cwd(), "data", "legacy", "Data Dump (JSON)");

function loadJson<T>(step: string, filename: string): T {
  const filePath = join(LEGACY_DIR, step, filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function batchWrite(
  cypher: string,
  items: unknown[],
  paramName = "items"
): Promise<number> {
  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(cypher, { [paramName]: batch });
    written += batch.length;
  }
  return written;
}

// ISO 639-1 code → language name mapping
const LANG_CODE_MAP: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  it: "Italian", nl: "Dutch", ru: "Russian", ja: "Japanese", ko: "Korean",
  zh: "Mandarin Chinese", ar: "Arabic", hi: "Hindi", bn: "Bengali",
  ur: "Urdu", tr: "Turkish", pl: "Polish", cs: "Czech", ro: "Romanian",
  hu: "Hungarian", el: "Greek", sv: "Swedish", no: "Norwegian", da: "Danish",
  fi: "Finnish", th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
  tl: "Filipino", he: "Hebrew", fa: "Persian", sw: "Swahili", uk: "Ukrainian",
  hr: "Croatian", sr: "Serbian", bg: "Bulgarian", sk: "Slovak", sl: "Slovenian",
  et: "Estonian", lv: "Latvian", lt: "Lithuanian", ca: "Catalan", af: "Afrikaans",
  ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati", pa: "Punjabi",
  kn: "Kannada", ml: "Malayalam", si: "Sinhala", ne: "Nepali", km: "Khmer",
  mn: "Mongolian", hy: "Armenian", sq: "Albanian", bs: "Bosnian",
  mt: "Maltese", is: "Icelandic", ga: "Irish", cy: "Welsh",
  yo: "Yoruba", sn: "Shona", am: "Amharic", ku: "Kurdish",
  tk: "Turkmen", rm: "Romansh", as: "Assamese", bm: "Bambara",
  gn: "Guarani", la: "Latin", ht: "Haitian Creole", an: "Aragonese",
  ab: "Abkhazian", kj: "Kuanyama", nr: "Southern Ndebele",
};

// ISO 3166-1 alpha-2 → country name mapping
const COUNTRY_CODE_MAP: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", DE: "Germany",
  FR: "France", NL: "Netherlands", BE: "Belgium", LU: "Luxembourg",
  CH: "Switzerland", AT: "Austria", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", IS: "Iceland", IE: "Ireland",
  ES: "Spain", PT: "Portugal", IT: "Italy", GR: "Greece",
  PL: "Poland", CZ: "Czech Republic", RO: "Romania", HU: "Hungary",
  BG: "Bulgaria", HR: "Croatia", SK: "Slovakia", SI: "Slovenia",
  RS: "Serbia", UA: "Ukraine", TR: "Turkey", RU: "Russia",
  EE: "Estonia", LV: "Latvia", LT: "Lithuania", MT: "Malta",
  AU: "Australia", NZ: "New Zealand", JP: "Japan", KR: "South Korea",
  CN: "China", HK: "Hong Kong", TW: "Taiwan", SG: "Singapore",
  MY: "Malaysia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam",
  PH: "Philippines", IN: "India", PK: "Pakistan", BD: "Bangladesh",
  LK: "Sri Lanka", NP: "Nepal", MM: "Myanmar", KH: "Cambodia",
  MN: "Mongolia", AE: "United Arab Emirates", SA: "Saudi Arabia",
  QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman",
  IL: "Israel", JO: "Jordan", LB: "Lebanon", EG: "Egypt",
  MA: "Morocco", TN: "Tunisia", DZ: "Algeria", LY: "Libya",
  NG: "Nigeria", ZA: "South Africa", KE: "Kenya", GH: "Ghana",
  ET: "Ethiopia", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda",
  SN: "Senegal", CI: "Côte d'Ivoire", CM: "Cameroon", MZ: "Mozambique",
  ZW: "Zimbabwe", BW: "Botswana", NA: "Namibia", MU: "Mauritius",
  AO: "Angola", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CO: "Colombia", CL: "Chile", PE: "Peru", EC: "Ecuador",
  VE: "Venezuela", UY: "Uruguay", PY: "Paraguay", BO: "Bolivia",
  CR: "Costa Rica", PA: "Panama", GT: "Guatemala", HN: "Honduras",
  SV: "El Salvador", NI: "Nicaragua", DO: "Dominican Republic",
  PR: "Puerto Rico", CU: "Cuba", JM: "Jamaica", TT: "Trinidad and Tobago",
  BB: "Barbados", BS: "Bahamas", GU: "Guam", FJ: "Fiji",
  PG: "Papua New Guinea", CY: "Cyprus", GE: "Georgia", AZ: "Azerbaijan",
  KZ: "Kazakhstan", UZ: "Uzbekistan", AM: "Armenia",
};

// ─── Step 1: System Data ─────────────────────────────────

interface LegacySkill {
  id: string;
  name: string;
  level: number;
  children?: LegacySkill[];
}

interface LegacyProfService {
  id: string;
  name: string;
  level: number;
  categoryId: string | null;
}

interface LegacyIndustry {
  id: string;
  name: string;
}

async function migrateSkills(): Promise<number> {
  const data = loadJson<{ data: { skill: LegacySkill[] } }>(
    "Step 1_ System Data", "skills.json"
  );
  const skills = data.data.skill;

  // Flatten the tree — old system has L0 (our L1), L1 (our L2), and children contain L2 (our L3 concept)
  // Their L0 = 22 categories map to our SkillL1 nodes
  // Their L1 = 236 skills map to our Skill nodes (L2)
  // They have no L2 children in the data (checked: 0 L1 with L2 children)

  // Create legacy skill nodes with their UUIDs for cross-referencing
  const allNodes: { id: string; name: string; level: string; parentId?: string }[] = [];

  for (const l0 of skills) {
    allNodes.push({ id: l0.id, name: l0.name, level: "L0" });
    if (l0.children) {
      for (const l1 of l0.children) {
        allNodes.push({ id: l1.id, name: l1.name, level: "L1", parentId: l0.id });
      }
    }
  }

  // MERGE skill nodes that match our existing taxonomy by name,
  // and add legacyId property for cross-referencing
  const written = await batchWrite(
    `UNWIND $items AS item
     MERGE (s:Skill {name: item.name})
     SET s.legacyId = item.id, s.legacyLevel = item.level
     WITH s, item
     WHERE item.level = "L0"
     MERGE (l1:SkillL1 {name: item.name})
     SET l1.legacyId = item.id`,
    allNodes
  );

  // Create LegacySkill nodes for items that DON'T match our taxonomy
  // (so we don't lose any data)
  await batchWrite(
    `UNWIND $items AS item
     MERGE (s:LegacySkill {legacyId: item.id})
     SET s.name = item.name, s.level = item.level`,
    allNodes
  );

  // Create parent→child edges for the legacy hierarchy
  const edges = allNodes.filter((n) => n.parentId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (child:LegacySkill {legacyId: item.id})
     MATCH (parent:LegacySkill {legacyId: item.parentId})
     MERGE (child)-[:BELONGS_TO]->(parent)`,
    edges
  );

  return written;
}

async function migrateProfessionalServices(): Promise<number> {
  const data = loadJson<{ data: { professional_service: LegacyProfService[] } }>(
    "Step 1_ System Data", "professional-service-category-and-specialization.json"
  );
  const services = data.data.professional_service;

  // L0 = 30 categories (these map to our Category nodes!)
  // L1 = 201 specializations (map to ProfessionalService nodes)
  const categories = services.filter((s) => s.level === 0);
  const specializations = services.filter((s) => s.level === 1);

  // Link L0 to our existing Category nodes by name match, add legacyId
  await batchWrite(
    `UNWIND $items AS item
     MERGE (c:Category {name: item.name})
     SET c.legacyId = item.id`,
    categories
  );

  // Create ProfessionalService nodes for L1 specializations
  await batchWrite(
    `UNWIND $items AS item
     MERGE (ps:ProfessionalService {legacyId: item.id})
     SET ps.name = item.name, ps.level = item.level`,
    specializations
  );

  // Link specializations to their category parents
  const specWithParent = specializations
    .filter((s) => s.categoryId)
    .map((s) => ({ id: s.id, categoryId: s.categoryId }));

  await batchWrite(
    `UNWIND $items AS item
     MATCH (ps:ProfessionalService {legacyId: item.id})
     MATCH (c:Category {legacyId: item.categoryId})
     MERGE (ps)-[:BELONGS_TO_CATEGORY]->(c)`,
    specWithParent
  );

  return categories.length + specializations.length;
}

async function migrateIndustries(): Promise<number> {
  const data = loadJson<{ data: { industry: LegacyIndustry[] } }>(
    "Step 1_ System Data", "industry.json"
  );
  const industries = data.data.industry;

  // Merge by name (many already exist from our taxonomy seed)
  // Add legacyId for cross-referencing
  await batchWrite(
    `UNWIND $items AS item
     MERGE (i:Industry {name: item.name})
     SET i.legacyId = item.id`,
    industries
  );

  return industries.length;
}

async function migrateMarkets(): Promise<number> {
  const data = loadJson<{ data: { user_in_market_experience: { id: string; countryCode: string }[] } }>(
    "Step 1_ System Data", "market-country.json"
  );
  const entries = data.data.user_in_market_experience;

  // Deduplicate country codes
  const uniqueCodes = [...new Set(entries.map((e) => e.countryCode))];
  const markets = uniqueCodes
    .map((code) => ({
      code,
      name: COUNTRY_CODE_MAP[code] ?? code,
    }))
    .filter((m) => m.name !== m.code); // skip unknown codes

  // Merge with existing Market nodes by name, add ISO code
  await batchWrite(
    `UNWIND $items AS item
     MERGE (m:Market {name: item.name})
     SET m.isoCode = item.code`,
    markets
  );

  return markets.length;
}

async function migrateLanguages(): Promise<number> {
  const data = loadJson<{ data: { user_language: { id: string; languageCode: string }[] } }>(
    "Step 1_ System Data", "language.json"
  );
  const entries = data.data.user_language;

  const uniqueCodes = [...new Set(entries.map((e) => e.languageCode))];
  const languages = uniqueCodes
    .map((code) => ({
      code,
      name: LANG_CODE_MAP[code] ?? code,
    }))
    .filter((l) => l.name !== l.code);

  await batchWrite(
    `UNWIND $items AS item
     MERGE (l:Language {name: item.name})
     SET l.isoCode = item.code`,
    languages
  );

  return languages.length;
}

// ─── Step 2: Organizations ───────────────────────────────

interface LegacyOrg {
  id: string;
  organisation_detail: {
    business_name: string;
    legal_business_name?: string;
    about?: string;
    website?: string;
    linkedinUrl?: string;
    no_of_employees?: number;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    country?: string;
    zip_code?: string;
    industry_id?: string;
    professional_service_id?: string;
    professional_service_category_id?: string;
  };
}

async function migrateOrganizations(): Promise<number> {
  const data = loadJson<{ data: { organisation: LegacyOrg[] } }>(
    "Step 2_ Organization Basic Data", "organization.json"
  );
  const orgs = data.data.organisation;

  // Create Organization nodes (maps to our ServiceFirm concept in the new system)
  const orgNodes = orgs
    .filter((o) => o.organisation_detail?.business_name)
    .map((o) => ({
      id: o.id,
      name: o.organisation_detail.business_name,
      legalName: o.organisation_detail.legal_business_name ?? null,
      about: (o.organisation_detail.about ?? "").slice(0, 5000),
      website: o.organisation_detail.website ?? null,
      linkedinUrl: o.organisation_detail.linkedinUrl ?? null,
      employees: o.organisation_detail.no_of_employees ?? null,
      city: o.organisation_detail.city ?? null,
      state: o.organisation_detail.state ?? null,
      country: o.organisation_detail.country ?? null,
      industryId: o.organisation_detail.industry_id ?? null,
      serviceId: o.organisation_detail.professional_service_id ?? null,
      categoryId: o.organisation_detail.professional_service_category_id ?? null,
    }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (o:Organization {legacyId: item.id})
     SET o.name = item.name,
         o.legalName = item.legalName,
         o.about = item.about,
         o.website = item.website,
         o.linkedinUrl = item.linkedinUrl,
         o.employees = item.employees,
         o.city = item.city,
         o.state = item.state,
         o.countryCode = item.country,
         o.isLegacy = true,
         o.isCollectiveOSCustomer = true`,
    orgNodes
  );

  // Link orgs to industries
  const orgIndustries = orgNodes
    .filter((o) => o.industryId)
    .map((o) => ({ orgId: o.id, industryId: o.industryId }));

  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Organization {legacyId: item.orgId})
     MATCH (i:Industry {legacyId: item.industryId})
     MERGE (o)-[:OPERATES_IN_INDUSTRY]->(i)`,
    orgIndustries
  );

  // Link orgs to professional service categories
  const orgCategories = orgNodes
    .filter((o) => o.categoryId)
    .map((o) => ({ orgId: o.id, catId: o.categoryId }));

  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Organization {legacyId: item.orgId})
     MATCH (c:Category {legacyId: item.catId})
     MERGE (o)-[:IN_CATEGORY]->(c)`,
    orgCategories
  );

  // Link orgs to markets via country code
  const orgMarkets = orgNodes
    .filter((o) => o.country && COUNTRY_CODE_MAP[o.country])
    .map((o) => ({ orgId: o.id, market: COUNTRY_CODE_MAP[o.country!] }));

  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Organization {legacyId: item.orgId})
     MATCH (m:Market {name: item.market})
     MERGE (o)-[:LOCATED_IN]->(m)`,
    orgMarkets
  );

  return orgNodes.length;
}

// ─── Step 3: Content Data ────────────────────────────────

async function migrateClients(): Promise<number> {
  const data = loadJson<{ data: { company: {
    id: string; name: string; website?: string; noOfEmployees?: string;
    industry?: { id: string; name: string } | null;
    organisation?: { id: string };
  }[] } }>(
    "Step 3_ Organization Content Data", "clients.json"
  );
  const companies = data.data.company;

  // Create Company/Client nodes
  const nodes = companies.map((c) => ({
    id: c.id,
    name: c.name,
    website: c.website ?? null,
    employees: c.noOfEmployees ? parseInt(c.noOfEmployees) || null : null,
    industryName: c.industry?.name ?? null,
    orgId: c.organisation?.id ?? null,
  }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (c:Company {legacyId: item.id})
     SET c.name = item.name,
         c.website = item.website,
         c.employees = item.employees`,
    nodes
  );

  // Link companies to industries
  const withIndustry = nodes.filter((n) => n.industryName);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (c:Company {legacyId: item.id})
     MATCH (i:Industry {name: item.industryName})
     MERGE (c)-[:OPERATES_IN_INDUSTRY]->(i)`,
    withIndustry
  );

  // Link companies to their claiming organization
  const withOrg = nodes.filter((n) => n.orgId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (c:Company {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.orgId})
     MERGE (o)-[:HAS_CLIENT]->(c)`,
    withOrg
  );

  return nodes.length;
}

async function migrateUsers(): Promise<number> {
  const data = loadJson<{ data: { user_meta: {
    id: string; firstName?: string; lastName?: string;
    email?: string; title?: string;
    organisation?: { id: string };
    user_meta_cos_user_roles?: { cos_user_role: { name: string } }[];
  }[] } }>(
    "Step 3_ Organization Content Data", "user-basic.json"
  );
  const users = data.data.user_meta;

  const nodes = users.map((u) => ({
    id: u.id,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    fullName: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
    email: u.email ?? null,
    title: u.title ?? null,
    orgId: u.organisation?.id ?? null,
    roles: (u.user_meta_cos_user_roles ?? []).map((r) => r.cos_user_role.name),
  }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (u:User {legacyId: item.id})
     SET u.firstName = item.firstName,
         u.lastName = item.lastName,
         u.fullName = item.fullName,
         u.email = item.email,
         u.title = item.title,
         u.roles = item.roles`,
    nodes
  );

  // Link users to organizations
  const withOrg = nodes.filter((n) => n.orgId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (u:User {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.orgId})
     MERGE (u)-[:BELONGS_TO]->(o)`,
    withOrg
  );

  return nodes.length;
}

async function migrateCaseStudies(): Promise<number> {
  const data = loadJson<{ data: { case_study: {
    authorId?: string;
    about?: string;
    status?: string;
    summary?: string;
    case_study_companies?: { companyID?: string; company?: { name: string } }[];
    case_study_industries?: { industry?: { id: string; name: string } }[];
    case_study_skills?: { skill?: { id: string; name: string } }[];
    case_study_markets?: { countryCode?: string }[];
    case_study_links?: { link?: string }[];
    case_study_languages?: { languageCode?: string }[];
    case_study_users?: { user_meta?: { id: string } }[];
    organisation?: { id: string; organisation_detail?: { business_name: string } };
  }[] } }>(
    "Step 3_ Organization Content Data", "case-studies.json"
  );
  const studies = data.data.case_study;

  // Create CaseStudy nodes (generate stable ID from index since no id field visible)
  const nodes = studies.map((cs, i) => ({
    id: `legacy-cs-${i}`,
    about: (cs.about ?? "").slice(0, 10000),
    summary: cs.summary ?? null,
    status: cs.status ?? "published",
    links: (cs.case_study_links ?? []).map((l) => l.link).filter(Boolean),
    authorId: cs.authorId ?? null,
    orgId: cs.organisation?.id ?? null,
    orgName: cs.organisation?.organisation_detail?.business_name ?? null,
    industries: (cs.case_study_industries ?? []).map((i) => i.industry?.name).filter(Boolean),
    skills: (cs.case_study_skills ?? []).map((s) => s.skill?.name).filter(Boolean),
    markets: (cs.case_study_markets ?? []).map((m) => COUNTRY_CODE_MAP[m.countryCode ?? ""] ?? null).filter(Boolean),
    clientIds: (cs.case_study_companies ?? []).map((c) => c.companyID).filter(Boolean),
    contributorIds: (cs.case_study_users ?? []).map((u) => u.user_meta?.id).filter(Boolean),
  }));

  // Create CaseStudy nodes
  await batchWrite(
    `UNWIND $items AS item
     MERGE (cs:CaseStudy {legacyId: item.id})
     SET cs.about = item.about,
         cs.summary = item.summary,
         cs.status = item.status,
         cs.links = item.links,
         cs.orgName = item.orgName`,
    nodes
  );

  // Link to organizations
  const withOrg = nodes.filter((n) => n.orgId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (cs:CaseStudy {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.orgId})
     MERGE (cs)-[:OWNED_BY]->(o)`,
    withOrg
  );

  // Link to authors
  const withAuthor = nodes.filter((n) => n.authorId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (cs:CaseStudy {legacyId: item.id})
     MATCH (u:User {legacyId: item.authorId})
     MERGE (cs)-[:AUTHORED_BY]->(u)`,
    withAuthor
  );

  // Link to industries
  for (const cs of nodes) {
    if (cs.industries.length === 0) continue;
    await neo4jWrite(
      `MATCH (cs:CaseStudy {legacyId: $csId})
       UNWIND $industries AS indName
       MATCH (i:Industry {name: indName})
       MERGE (cs)-[:BELONGS_TO_INDUSTRY]->(i)`,
      { csId: cs.id, industries: cs.industries }
    );
  }

  // Link to skills (batch by case study)
  for (const cs of nodes) {
    if (cs.skills.length === 0) continue;
    await neo4jWrite(
      `MATCH (cs:CaseStudy {legacyId: $csId})
       UNWIND $skills AS skillName
       MATCH (s:LegacySkill {name: skillName})
       MERGE (cs)-[:DEMONSTRATES_SKILL]->(s)`,
      { csId: cs.id, skills: cs.skills }
    );
  }

  // Link to markets
  for (const cs of nodes) {
    if (cs.markets.length === 0) continue;
    await neo4jWrite(
      `MATCH (cs:CaseStudy {legacyId: $csId})
       UNWIND $markets AS mktName
       MATCH (m:Market {name: mktName})
       MERGE (cs)-[:TARGETS_MARKET]->(m)`,
      { csId: cs.id, markets: cs.markets }
    );
  }

  // Link to client companies
  for (const cs of nodes) {
    if (cs.clientIds.length === 0) continue;
    await neo4jWrite(
      `MATCH (cs:CaseStudy {legacyId: $csId})
       UNWIND $clientIds AS cid
       MATCH (c:Company {legacyId: cid})
       MERGE (cs)-[:FEATURES_CLIENT]->(c)`,
      { csId: cs.id, clientIds: cs.clientIds }
    );
  }

  return nodes.length;
}

async function migrateServices(): Promise<number> {
  const data = loadJson<{ data: { org_service: {
    id: string; name: string; description?: string;
    tags?: string; publish_status?: string;
    organisation?: { id: string };
  }[] } }>(
    "Step 3_ Organization Content Data", "organization-services.json"
  );
  const services = data.data.org_service;

  const nodes = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: (s.description ?? "").slice(0, 5000),
    tags: s.tags ? s.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    publishStatus: s.publish_status ?? "draft",
    orgId: s.organisation?.id ?? null,
  }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (s:OrgService {legacyId: item.id})
     SET s.name = item.name,
         s.description = item.description,
         s.tags = item.tags,
         s.publishStatus = item.publishStatus`,
    nodes
  );

  // Link to organizations
  const withOrg = nodes.filter((n) => n.orgId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (s:OrgService {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.orgId})
     MERGE (s)-[:OWNED_BY]->(o)`,
    withOrg
  );

  return nodes.length;
}

async function migrateOpportunities(): Promise<number> {
  const data = loadJson<{ data: { opportunity: {
    id: string; title?: string; summary?: string; description?: string;
    type?: string; urgency?: string; status?: string; projectStage?: string;
    minAmount?: number; maxAmount?: number; currency?: string;
    teamSize?: number; timeUnit?: string; duration?: number;
    location?: string; discoverability?: string; closeReason?: string;
    opportunity_skills?: { skill?: { id: string; name: string } }[];
    opportunity_industries?: { industry?: { id: string; name: string } }[];
    organization?: { id: string };
  }[] } }>(
    "Step 3_ Organization Content Data", "opportunities.json"
  );
  const opps = data.data.opportunity;

  const nodes = opps.map((o) => ({
    id: o.id,
    title: o.title ?? "Untitled",
    summary: o.summary ?? null,
    description: (o.description ?? "").slice(0, 5000),
    type: o.type ?? null,
    urgency: o.urgency ?? null,
    status: o.status ?? "closed",
    projectStage: o.projectStage ?? null,
    minAmount: o.minAmount ?? null,
    maxAmount: o.maxAmount ?? null,
    currency: o.currency ?? null,
    teamSize: o.teamSize ?? null,
    location: o.location ?? null,
    orgId: o.organization?.id ?? null,
    skills: (o.opportunity_skills ?? []).map((s) => s.skill?.name).filter(Boolean),
    industries: (o.opportunity_industries ?? []).map((i) => i.industry?.name).filter(Boolean),
  }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (o:Opportunity {legacyId: item.id})
     SET o.title = item.title,
         o.summary = item.summary,
         o.description = item.description,
         o.type = item.type,
         o.urgency = item.urgency,
         o.status = item.status,
         o.minAmount = item.minAmount,
         o.maxAmount = item.maxAmount,
         o.currency = item.currency`,
    nodes
  );

  // Link to organizations
  const withOrg = nodes.filter((n) => n.orgId);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Opportunity {legacyId: item.id})
     MATCH (org:Organization {legacyId: item.orgId})
     MERGE (o)-[:OWNED_BY]->(org)`,
    withOrg
  );

  return nodes.length;
}

async function migratePartnershipPreferences(): Promise<number> {
  const data = loadJson<{ data: { fact_partnership_preferences: {
    organization_id: string;
    client_industries?: string[];
    client_sizes?: string[];
    individual_rate_start?: number;
    individual_rate_end?: number;
    location_countries?: string[];
    location_regions?: string[];
    location_type?: string;
    partner_sizes?: string[];
    partner_types?: string[];
    project_size_ranges?: string[];
    services_offered?: string[];
  }[] } }>(
    "Step 3_ Organization Content Data", "partnership-preferences.json"
  );
  const prefs = data.data.fact_partnership_preferences;

  const nodes = prefs.map((p) => ({
    orgId: p.organization_id,
    clientIndustries: p.client_industries ?? [],
    clientSizes: p.client_sizes ?? [],
    rateStart: p.individual_rate_start ?? null,
    rateEnd: p.individual_rate_end ?? null,
    locationCountries: p.location_countries ?? [],
    locationRegions: p.location_regions ?? [],
    locationType: p.location_type ?? null,
    partnerSizes: p.partner_sizes ?? [],
    partnerTypes: p.partner_types ?? [],
    projectSizeRanges: p.project_size_ranges ?? [],
    servicesOffered: p.services_offered ?? [],
  }));

  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Organization {legacyId: item.orgId})
     MERGE (o)-[:HAS_PREFERENCES]->(pp:PartnershipPreferences {orgId: item.orgId})
     SET pp.clientIndustries = item.clientIndustries,
         pp.clientSizes = item.clientSizes,
         pp.rateStart = item.rateStart,
         pp.rateEnd = item.rateEnd,
         pp.locationCountries = item.locationCountries,
         pp.locationRegions = item.locationRegions,
         pp.locationType = item.locationType,
         pp.partnerSizes = item.partnerSizes,
         pp.partnerTypes = item.partnerTypes,
         pp.projectSizeRanges = item.projectSizeRanges,
         pp.servicesOffered = item.servicesOffered`,
    nodes
  );

  return nodes.length;
}

// ─── Step 4: User Profiles ───────────────────────────────

async function migrateUserDetails(): Promise<number> {
  const data = loadJson<{ data: { user_meta: {
    id: string;
    user_skills?: { skill: { id: string; name: string } }[];
    user_industry_experiences?: { industry: { id: string; name: string } }[];
    user_in_market_experiences?: { countryCode: string }[];
    user_languages?: { languageCode: string }[];
  }[] } }>(
    "Step 4_ User Profile Data", "user-details.json"
  );
  const users = data.data.user_meta;

  // Link users to skills
  for (const user of users) {
    const skills = (user.user_skills ?? []).map((s) => s.skill?.name).filter(Boolean);
    if (skills.length > 0) {
      await neo4jWrite(
        `MATCH (u:User {legacyId: $userId})
         UNWIND $skills AS skillName
         MATCH (s:LegacySkill {name: skillName})
         MERGE (u)-[:HAS_SKILL]->(s)`,
        { userId: user.id, skills }
      );
    }

    // Link to industries
    const industries = (user.user_industry_experiences ?? []).map((i) => i.industry?.name).filter(Boolean);
    if (industries.length > 0) {
      await neo4jWrite(
        `MATCH (u:User {legacyId: $userId})
         UNWIND $industries AS indName
         MATCH (i:Industry {name: indName})
         MERGE (u)-[:HAS_INDUSTRY_EXPERIENCE]->(i)`,
        { userId: user.id, industries }
      );
    }

    // Link to markets
    const markets = (user.user_in_market_experiences ?? [])
      .map((m) => COUNTRY_CODE_MAP[m.countryCode] ?? null)
      .filter(Boolean) as string[];
    if (markets.length > 0) {
      await neo4jWrite(
        `MATCH (u:User {legacyId: $userId})
         UNWIND $markets AS mktName
         MATCH (m:Market {name: mktName})
         MERGE (u)-[:HAS_MARKET_EXPERIENCE]->(m)`,
        { userId: user.id, markets }
      );
    }

    // Link to languages
    const languages = (user.user_languages ?? [])
      .map((l) => LANG_CODE_MAP[l.languageCode] ?? null)
      .filter(Boolean) as string[];
    if (languages.length > 0) {
      await neo4jWrite(
        `MATCH (u:User {legacyId: $userId})
         UNWIND $languages AS langName
         MATCH (l:Language {name: langName})
         MERGE (u)-[:SPEAKS]->(l)`,
        { userId: user.id, languages }
      );
    }
  }

  return users.length;
}

async function migrateWorkHistory(): Promise<number> {
  const data = loadJson<{ data: { user_meta: {
    id: string;
    work_history?: {
      id: string; order?: number; title?: string; description?: string;
      startAt?: string; endAt?: string; isCurrentPosition?: boolean;
      company?: { id: string; name: string };
    }[];
  }[] } }>(
    "Step 4_ User Profile Data", "user-work-history.json"
  );
  const users = data.data.user_meta;

  let count = 0;
  for (const user of users) {
    const history = user.work_history ?? [];
    if (history.length === 0) continue;

    for (const wh of history) {
      await neo4jWrite(
        `MATCH (u:User {legacyId: $userId})
         MERGE (wh:WorkHistory {legacyId: $whId})
         SET wh.title = $title,
             wh.description = $description,
             wh.startAt = $startAt,
             wh.endAt = $endAt,
             wh.isCurrentPosition = $isCurrent,
             wh.sortOrder = $order
         MERGE (u)-[:HAS_WORK_HISTORY]->(wh)
         WITH wh
         WHERE $companyId IS NOT NULL
         MERGE (c:Company {legacyId: $companyId})
         ON CREATE SET c.name = $companyName
         MERGE (wh)-[:WORKED_AT]->(c)`,
        {
          userId: user.id,
          whId: wh.id,
          title: wh.title ?? null,
          description: (wh.description ?? "").slice(0, 3000),
          startAt: wh.startAt ?? null,
          endAt: wh.endAt ?? null,
          isCurrent: wh.isCurrentPosition ?? false,
          order: wh.order ?? 0,
          companyId: wh.company?.id ?? null,
          companyName: wh.company?.name ?? null,
        }
      );
      count++;
    }
  }

  return count;
}

// ─── Step 5: Network Data ────────────────────────────────

async function migrateMatches(): Promise<number> {
  const data = loadJson<{ data: { org_matchmaking_recommendations: {
    id: string; jobId?: string; score?: number;
    recommendationType?: string; createdAt?: string;
    matchmaking_recommendation_organisations?: {
      organisation: { id: string; organisation_detail?: { business_name: string } };
    }[];
  }[] } }>(
    "Step 5_ Network Data", "perfect-match.json"
  );
  const matches = data.data.org_matchmaking_recommendations;

  const nodes = matches.map((m) => ({
    id: m.id,
    jobId: m.jobId ?? null,
    score: m.score ?? 0,
    type: m.recommendationType ?? "PERFECT_MATCH",
    createdAt: m.createdAt ?? null,
    org1Id: m.matchmaking_recommendation_organisations?.[0]?.organisation?.id ?? null,
    org2Id: m.matchmaking_recommendation_organisations?.[1]?.organisation?.id ?? null,
  }));

  await batchWrite(
    `UNWIND $items AS item
     MERGE (mr:MatchRecommendation {legacyId: item.id})
     SET mr.jobId = item.jobId,
         mr.score = item.score,
         mr.recommendationType = item.type,
         mr.createdAt = item.createdAt`,
    nodes
  );

  // Link to org 1
  const withOrg1 = nodes.filter((n) => n.org1Id);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (mr:MatchRecommendation {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.org1Id})
     MERGE (mr)-[:MATCHED]->(o)`,
    withOrg1
  );

  // Link to org 2
  const withOrg2 = nodes.filter((n) => n.org2Id);
  await batchWrite(
    `UNWIND $items AS item
     MATCH (mr:MatchRecommendation {legacyId: item.id})
     MATCH (o:Organization {legacyId: item.org2Id})
     MERGE (mr)-[:MATCHED]->(o)`,
    withOrg2
  );

  return nodes.length;
}

async function migrateMatchActivity(): Promise<number> {
  const data = loadJson<{ data: { match_activity: {
    recommendationId: string;
    status: string;
    organisation?: { organisation_detail?: { business_name: string } };
    org_matchmaking_recommendation?: {
      match_activities?: { created_at: string; status: string; orgId: string }[];
    };
  }[] } }>(
    "Step 5_ Network Data", "match-activity.json"
  );
  const activities = data.data.match_activity;

  // Flatten: each match_activity has nested activities per org
  const flatActivities: { recId: string; orgId: string; status: string; createdAt: string }[] = [];
  const seen = new Set<string>();

  for (const ma of activities) {
    const nestedActs = ma.org_matchmaking_recommendation?.match_activities ?? [];
    for (const act of nestedActs) {
      const key = `${ma.recommendationId}-${act.orgId}`;
      if (seen.has(key)) continue; // dedup
      seen.add(key);
      flatActivities.push({
        recId: ma.recommendationId,
        orgId: act.orgId,
        status: act.status,
        createdAt: act.created_at,
      });
    }
  }

  await batchWrite(
    `UNWIND $items AS item
     MATCH (o:Organization {legacyId: item.orgId})
     MATCH (mr:MatchRecommendation {legacyId: item.recId})
     MERGE (ma:MatchActivity {orgId: item.orgId, recId: item.recId})
     SET ma.status = item.status,
         ma.createdAt = item.createdAt
     MERGE (o)-[:RESPONDED_TO]->(ma)
     MERGE (ma)-[:FOR_RECOMMENDATION]->(mr)`,
    flatActivities
  );

  return flatActivities.length;
}

// ─── Master Migration Function ───────────────────────────

export interface MigrationResult {
  step1: {
    skills: number;
    professionalServices: number;
    industries: number;
    markets: number;
    languages: number;
  };
  step2: { organizations: number };
  step3: {
    clients: number;
    users: number;
    caseStudies: number;
    services: number;
    opportunities: number;
    partnershipPreferences: number;
  };
  step4: {
    userDetails: number;
    workHistory: number;
  };
  step5: {
    matches: number;
    matchActivities: number;
  };
  totalNodes: number;
  durationMs: number;
  errors: string[];
}

async function safeRun(name: string, fn: () => Promise<number>, errors: string[]): Promise<number> {
  try {
    const count = await fn();
    console.log(`[Migration] ${name}: ${count} records`);
    return count;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Migration] ${name} FAILED: ${msg}`);
    errors.push(`${name}: ${msg}`);
    return 0;
  }
}

export async function runLegacyMigration(steps?: number[]): Promise<MigrationResult> {
  const start = Date.now();
  const errors: string[] = [];
  const runSteps = steps ?? [1, 2, 3, 4, 5];

  console.log(`[Migration] Starting legacy data migration (steps: ${runSteps.join(", ")})...`);

  // Step 1: System Data
  const s1 = { skills: 0, professionalServices: 0, industries: 0, markets: 0, languages: 0 };
  if (runSteps.includes(1)) {
    s1.skills = await safeRun("Skills", migrateSkills, errors);
    s1.professionalServices = await safeRun("Professional Services", migrateProfessionalServices, errors);
    s1.industries = await safeRun("Industries", migrateIndustries, errors);
    s1.markets = await safeRun("Markets", migrateMarkets, errors);
    s1.languages = await safeRun("Languages", migrateLanguages, errors);
  }

  // Step 2: Organizations
  const s2 = { organizations: 0 };
  if (runSteps.includes(2)) {
    s2.organizations = await safeRun("Organizations", migrateOrganizations, errors);
  }

  // Step 3: Content
  const s3 = { clients: 0, users: 0, caseStudies: 0, services: 0, opportunities: 0, partnershipPreferences: 0 };
  if (runSteps.includes(3)) {
    s3.clients = await safeRun("Clients", migrateClients, errors);
    s3.users = await safeRun("Users", migrateUsers, errors);
    s3.caseStudies = await safeRun("Case Studies", migrateCaseStudies, errors);
    s3.services = await safeRun("Services", migrateServices, errors);
    s3.opportunities = await safeRun("Opportunities", migrateOpportunities, errors);
    s3.partnershipPreferences = await safeRun("Partnership Prefs", migratePartnershipPreferences, errors);
  }

  // Step 4: User Profiles
  const s4 = { userDetails: 0, workHistory: 0 };
  if (runSteps.includes(4)) {
    s4.userDetails = await safeRun("User Details", migrateUserDetails, errors);
    s4.workHistory = await safeRun("Work History", migrateWorkHistory, errors);
  }

  // Step 5: Network
  const s5 = { matches: 0, matchActivities: 0 };
  if (runSteps.includes(5)) {
    s5.matches = await safeRun("Matches", migrateMatches, errors);
    s5.matchActivities = await safeRun("Match Activity", migrateMatchActivity, errors);
  }

  const totalNodes = Object.values(s1).reduce((a, b) => a + b, 0) +
    s2.organizations + Object.values(s3).reduce((a, b) => a + b, 0) +
    Object.values(s4).reduce((a, b) => a + b, 0) +
    Object.values(s5).reduce((a, b) => a + b, 0);

  const durationMs = Date.now() - start;
  console.log(`[Migration] Complete: ${totalNodes} records in ${durationMs}ms. ${errors.length} errors.`);

  return { step1: s1, step2: s2, step3: s3, step4: s4, step5: s5, totalNodes, durationMs, errors };
}
