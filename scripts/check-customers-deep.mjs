import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);

// Get customers with their email domains
const customers = await sql`
  SELECT u.email, sf.id as firm_id, sf.name as firm_name, sf.website,
         sf.enrichment_status, sf.enrichment_data, o.id as org_id
  FROM users u
  JOIN members m ON m.user_id = u.id AND m.role = 'owner'
  JOIN organizations o ON o.id = m.organization_id
  LEFT JOIN service_firms sf ON sf.organization_id = o.id
  ORDER BY u.created_at DESC
`;

// Get all enrichment cache domains
const cache = await sql`SELECT domain, firm_name, has_pdl, has_scrape, has_classify, enrichment_data FROM enrichment_cache`;
const cacheByDomain = Object.fromEntries(cache.map(c => [c.domain, c]));

// Get raw_onboarding_data for partner prefs
const prefs = await sql`
  SELECT firm_id, raw_onboarding_data, preferred_firm_types, preferred_industries,
         preferred_markets, partnership_models
  FROM partner_preferences
`;
const prefsByFirm = Object.fromEntries(prefs.map(p => [p.firm_id, p]));

console.log('=== CUSTOMER DATA GAP ANALYSIS ===\n');

const SKIP_DOMAINS = ['test.net', 'example.com', 'testfirm.com'];
const realCustomers = customers.filter(c => {
  const domain = c.email.split('@')[1];
  return !SKIP_DOMAINS.some(skip => domain?.includes(skip)) && !c.email.includes('test@');
});

for (const c of customers) {
  const domain = c.email.split('@')[1];
  const isTest = SKIP_DOMAINS.some(s => domain?.includes(s)) || c.email.startsWith('test@') || c.email.startsWith('testnav@');
  const cached = cacheByDomain[domain];
  const pref = prefsByFirm[c.firm_id];
  const rawOnboarding = pref?.raw_onboarding_data;

  console.log(`${isTest ? '[TEST]' : '[REAL]'} ${c.email}`);
  console.log(`  Firm: "${c.firm_name}" | Domain: ${domain}`);
  console.log(`  website field: ${c.website || 'MISSING'}`);
  console.log(`  enrichment_status: ${c.enrichment_status}`);

  if (cached) {
    const cacheData = cached.enrichment_data || {};
    const skills = cacheData.classification?.skills?.length || 0;
    const industries = cacheData.classification?.industries?.length || 0;
    const categories = cacheData.classification?.categories?.join(', ') || 'none';
    const clients = cacheData.extracted?.clients?.length || 0;
    const services = cacheData.extracted?.services?.length || 0;
    console.log(`  cache HIT ✓ (pdl=${cached.has_pdl} scrape=${cached.has_scrape} classify=${cached.has_classify})`);
    console.log(`    skills=${skills} industries=${industries} services=${services} clients=${clients}`);
    console.log(`    categories: ${categories}`);
  } else {
    console.log(`  cache MISS ✗ — needs enrichment`);
  }

  if (rawOnboarding) {
    const raw = rawOnboarding;
    console.log(`  onboarding answers: ${JSON.stringify(raw).slice(0, 200)}...`);
  } else {
    console.log(`  onboarding answers: MISSING`);
  }

  // Check if firm_name looks wrong (e.g. just domain slug)
  const nameLooksWrong = c.firm_name && (
    c.firm_name === domain?.split('.')[0] ||
    c.firm_name === domain ||
    c.firm_name?.toLowerCase() === c.firm_name?.split('.')[0]?.toLowerCase()
  );
  if (nameLooksWrong && cached?.firm_name) {
    console.log(`  ⚠️  firm_name "${c.firm_name}" looks like a slug — cache has "${cached.firm_name}"`);
  }

  console.log();
}

// What can be auto-fixed
console.log('=== FIXABILITY ===');
let canAutoFix = 0, needsEnrichment = 0, testAccounts = 0;
for (const c of customers) {
  const domain = c.email.split('@')[1];
  const isTest = SKIP_DOMAINS.some(s => domain?.includes(s)) || c.email.startsWith('test@') || c.email.startsWith('testnav@');
  if (isTest) { testAccounts++; continue; }
  const cached = cacheByDomain[domain];
  if (cached?.has_classify) canAutoFix++;
  else needsEnrichment++;
}
console.log(`Test/junk accounts: ${testAccounts}`);
console.log(`Real customers with cached enrichment (auto-fixable now): ${canAutoFix}`);
console.log(`Real customers needing fresh enrichment run: ${needsEnrichment}`);
