import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const domain = process.argv[2] || 'chameleon.co';
const [row] = await sql`SELECT domain, has_classify, firm_name, updated_at, enrichment_data FROM enrichment_cache WHERE domain = ${domain}`;

if (!row) { console.log('Not found'); process.exit(1); }
console.log('domain:', row.domain);
console.log('has_classify:', row.has_classify);
console.log('firm_name:', row.firm_name);
console.log('updated_at:', row.updated_at);
console.log('\nenrichment_data keys:', Object.keys(row.enrichment_data || {}));

const d = row.enrichment_data || {};
console.log('\nclassification.categories:', d.classification?.categories);
console.log('classification.skills (first 5):', d.classification?.skills?.slice(0, 5));
console.log('extracted keys:', Object.keys(d.extracted || {}));
console.log('extracted.services:', d.extracted?.services?.slice(0, 5));
console.log('extracted.clients:', d.extracted?.clients?.slice(0, 5));
console.log('extracted.aboutPitch:', d.extracted?.aboutPitch?.slice(0, 150));

// Also check service_firms enrichment_data
const [firm] = await sql`SELECT id, enrichment_data FROM service_firms WHERE website LIKE ${'%' + domain + '%'} LIMIT 1`;
if (firm) {
  console.log('\n--- service_firms enrichment_data ---');
  const fd = firm.enrichment_data || {};
  console.log('keys:', Object.keys(fd));
  console.log('extracted.services:', fd.extracted?.services?.slice(0, 5));
}
