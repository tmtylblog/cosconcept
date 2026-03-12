import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);

// Get all customers — users who have an org + service_firm
const customers = await sql`
  SELECT
    u.id as user_id,
    u.name as user_name,
    u.email,
    u.created_at as user_created,
    o.id as org_id,
    o.name as org_name,
    sf.id as firm_id,
    sf.name as firm_name,
    sf.website,
    sf.description,
    sf.enrichment_status,
    sf.profile_completeness,
    sf.classification_confidence,
    sf.size_band,
    sf.firm_type,
    sf.enrichment_data,
    sf.is_cos_customer,
    sf.created_at as firm_created
  FROM users u
  JOIN members m ON m.user_id = u.id AND m.role = 'owner'
  JOIN organizations o ON o.id = m.organization_id
  LEFT JOIN service_firms sf ON sf.organization_id = o.id
  ORDER BY u.created_at DESC
`;

console.log(`\n=== CUSTOMERS (${customers.length} total) ===\n`);

// Per-customer breakdown
for (const c of customers) {
  const enrichData = c.enrichment_data || {};
  const hasWebsite = !!c.website;
  const hasDescription = !!c.description;
  const hasClassification = !!c.classification_confidence;
  const hasSizeBand = !!c.size_band;
  const hasFirmType = !!c.firm_type;

  // Check enrichment data keys
  const enrichKeys = Object.keys(enrichData);
  const hasAboutPitch = !!enrichData.aboutPitch;
  const hasSkills = Array.isArray(enrichData.skills) && enrichData.skills.length > 0;
  const hasIndustries = Array.isArray(enrichData.industries) && enrichData.industries.length > 0;
  const hasCategories = Array.isArray(enrichData.categories) && enrichData.categories.length > 0;
  const hasClients = Array.isArray(enrichData.clients) && enrichData.clients.length > 0;
  const hasPdl = !!enrichData.pdl;

  // Score out of 10
  const score = [hasWebsite, hasDescription || hasAboutPitch, hasClassification, hasSizeBand,
                  hasFirmType, hasSkills, hasIndustries, hasCategories, hasClients, hasPdl]
                .filter(Boolean).length;

  console.log(`${c.user_name} <${c.email}>`);
  console.log(`  Firm: ${c.firm_name || '(no firm)'} | Website: ${c.website || 'MISSING'}`);
  console.log(`  Enrichment: ${c.enrichment_status} | Score: ${score}/10 | Completeness: ${c.profile_completeness ?? 0}`);
  console.log(`  Data: website=${hasWebsite} desc=${hasDescription} classif=${hasClassification} sizeBand=${hasSizeBand} firmType=${hasFirmType}`);
  console.log(`        skills=${hasSkills} industries=${hasIndustries} cats=${hasCategories} clients=${hasClients} pdl=${hasPdl}`);
  console.log(`  enrichmentData keys: [${enrichKeys.join(', ') || 'empty'}]`);
  console.log();
}

// Summary stats
const withFirm = customers.filter(c => c.firm_id);
const withWebsite = customers.filter(c => c.website);
const enriched = customers.filter(c => c.enrichment_status === 'enriched');
const hasRealData = customers.filter(c => {
  const d = c.enrichment_data || {};
  return d.aboutPitch || (Array.isArray(d.skills) && d.skills.length > 0);
});
const hasClassification = customers.filter(c => c.classification_confidence);
const hasSizeBand = customers.filter(c => c.size_band);
const hasFirmType = customers.filter(c => c.firm_type);

// Check services, experts, case studies per firm
const firmIds = withFirm.map(c => c.firm_id).filter(Boolean);

let servicesData = [], expertsData = [], caseStudiesData = [], prefsData = [];

if (firmIds.length > 0) {
  [servicesData, expertsData, caseStudiesData, prefsData] = await Promise.all([
    sql`SELECT firm_id, COUNT(*) as cnt FROM firm_services WHERE firm_id = ANY(${firmIds}) GROUP BY firm_id`,
    sql`SELECT firm_id, COUNT(*) as cnt FROM expert_profiles WHERE firm_id = ANY(${firmIds}) GROUP BY firm_id`,
    sql`SELECT firm_id, status, COUNT(*) as cnt FROM firm_case_studies WHERE firm_id = ANY(${firmIds}) GROUP BY firm_id, status`,
    sql`SELECT firm_id FROM partner_preferences WHERE firm_id = ANY(${firmIds})`,
  ]);
}

const firmsWithServices = new Set(servicesData.map(r => r.firm_id));
const firmsWithExperts = new Set(expertsData.map(r => r.firm_id));
const firmsWithCaseStudies = new Set(caseStudiesData.map(r => r.firm_id));
const firmsWithPrefs = new Set(prefsData.map(r => r.firm_id));

console.log('=== SUMMARY ===');
console.log(`Total customers: ${customers.length}`);
console.log(`Have a firm record: ${withFirm.length}/${customers.length}`);
console.log(`Have a website: ${withWebsite.length}/${customers.length}`);
console.log(`Marked 'enriched': ${enriched.length}/${customers.length}`);
console.log(`Have real enrichment data (skills/pitch): ${hasRealData.length}/${customers.length}`);
console.log(`Have classification confidence: ${hasClassification.length}/${customers.length}`);
console.log(`Have sizeBand: ${hasSizeBand.length}/${customers.length}`);
console.log(`Have firmType: ${hasFirmType.length}/${customers.length}`);
console.log(`Have firm_services rows: ${firmsWithServices.size}/${withFirm.length}`);
console.log(`Have expert_profiles rows: ${firmsWithExperts.size}/${withFirm.length}`);
console.log(`Have case_studies: ${firmsWithCaseStudies.size}/${withFirm.length}`);
console.log(`Have partner_preferences: ${firmsWithPrefs.size}/${withFirm.length}`);

// Check partner preferences content
if (prefsData.length > 0) {
  const fullPrefs = await sql`SELECT firm_id, preferred_firm_types, preferred_industries, preferred_markets, growth_goals, raw_onboarding_data FROM partner_preferences WHERE firm_id = ANY(${firmIds})`;
  console.log('\n=== PARTNER PREFERENCES ===');
  for (const p of fullPrefs) {
    const hasRawOnboarding = !!p.raw_onboarding_data;
    const hasPrefTypes = Array.isArray(p.preferred_firm_types) && p.preferred_firm_types.length > 0;
    const hasPrefIndustries = Array.isArray(p.preferred_industries) && p.preferred_industries.length > 0;
    const firm = customers.find(c => c.firm_id === p.firm_id);
    console.log(`  ${firm?.firm_name}: prefTypes=${hasPrefTypes} prefIndustries=${hasPrefIndustries} rawOnboarding=${hasRawOnboarding} growthGoals=${!!p.growth_goals}`);
  }
}
