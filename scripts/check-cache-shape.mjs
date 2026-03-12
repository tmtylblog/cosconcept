import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const row = await sql`SELECT enrichment_data FROM enrichment_cache WHERE domain = 'chameleon.co' LIMIT 1`;
const data = row[0]?.enrichment_data;

console.log('=== TOP-LEVEL KEYS ===');
console.log(Object.keys(data));

console.log('\n=== classification ===');
const c = data.classification || {};
console.log('keys:', Object.keys(c));
console.log('categories:', c.categories);
console.log('skills (first 5):', c.skills?.slice(0, 5));
console.log('industries:', c.industries);
console.log('markets (first 5):', c.markets?.slice(0, 5));
console.log('firmType:', c.firmType);
console.log('sizeBand:', c.sizeBand);
console.log('confidence:', c.confidence);

console.log('\n=== extracted ===');
const e = data.extracted || {};
console.log('keys:', Object.keys(e));
console.log('aboutPitch:', e.aboutPitch?.slice(0, 150));
console.log('clients (first 5):', e.clients?.slice(0, 5));
console.log('services (first 5):', e.services?.slice(0, 5));
console.log('caseStudyUrls count:', e.caseStudyUrls?.length);

console.log('\n=== companyData / pdl ===');
const pd = data.companyData || data.pdl || {};
console.log('keys:', Object.keys(pd));
console.log('displayName:', pd.displayName);
console.log('industry:', pd.industry);
console.log('size:', pd.size);
console.log('employeeCount:', pd.employeeCount);
console.log('headline:', pd.headline?.slice(0, 100));

console.log('\n=== companyCard ===');
const card = data.companyCard || {};
console.log('keys:', Object.keys(card));
console.log('name:', card.name);
console.log('description:', card.description?.slice(0, 100));
