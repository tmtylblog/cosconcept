import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const email = process.argv[2] || 'freddie@chameleon.co';

const [user] = await sql`SELECT id, email, role FROM users WHERE email = ${email}`;
if (!user) { console.log('User not found:', email); process.exit(1); }
console.log('User:', user.email, '| role:', user.role);

const [member] = await sql`SELECT organization_id, role FROM members WHERE user_id = ${user.id} LIMIT 1`;
if (!member) { console.log('No org membership found'); process.exit(1); }
console.log('Org:', member.organization_id, '| member role:', member.role);

const [firm] = await sql`SELECT id, name, website, enrichment_status, profile_completeness FROM service_firms WHERE organization_id = ${member.organization_id} LIMIT 1`;
if (!firm) { console.log('No service_firm found for this org'); process.exit(1); }
console.log('\nFirm:', firm.id);
console.log('  name:', firm.name);
console.log('  website:', firm.website);
console.log('  enrichment_status:', firm.enrichment_status);
console.log('  completeness:', firm.profile_completeness);

const services = await sql`SELECT id, name FROM firm_services WHERE firm_id = ${firm.id}`;
console.log('\nServices in firm_services:', services.length);
services.slice(0, 5).forEach(s => console.log(' -', s.name));

const cache = await sql`SELECT domain, has_classify, updated_at FROM enrichment_cache WHERE domain = 'chameleon.co' LIMIT 1`;
console.log('\nEnrichment cache for chameleon.co:', cache.length ? `has_classify=${cache[0].has_classify}` : 'NOT FOUND');

const jobs = await sql`SELECT type, status, run_at FROM background_jobs WHERE payload->>'firmId' = ${firm.id} ORDER BY created_at DESC LIMIT 5`;
console.log('\nBackground jobs for this firm:', jobs.length);
jobs.forEach(j => console.log(` - ${j.type} | ${j.status} | run_at: ${j.run_at}`));
