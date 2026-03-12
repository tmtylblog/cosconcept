import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const firmId = 'firm_leg_37e3b6d6-d90d-472f-9385-f16c29218d98';

const logs = await sql`
  SELECT phase, extracted_data, status
  FROM enrichment_audit_log
  WHERE firm_id = ${firmId}
  ORDER BY created_at DESC LIMIT 5
`;
logs.forEach(l => {
  console.log(`\nPhase: ${l.phase} | Status: ${l.status}`);
  console.log(JSON.stringify(l.extracted_data, null, 2).slice(0, 500));
  console.log('---');
});

const services = await sql`SELECT name FROM firm_services WHERE firm_id = ${firmId}`;
console.log('\nfirm_services rows:', services.length);
services.forEach(s => console.log(' -', s.name));

const [cache] = await sql`SELECT enrichment_data FROM enrichment_cache WHERE domain = 'gamutcreative.tv'`;
if (cache) {
  const d = cache.enrichment_data;
  console.log('\nCache extracted.services:', d?.extracted?.services);
  console.log('Cache classification.categories:', d?.classification?.categories);
}
