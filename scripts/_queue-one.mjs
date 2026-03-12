import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const email = process.argv[2];
if (!email) { console.log('Usage: node _queue-one.mjs email@domain.com'); process.exit(1); }

const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;
const [member] = await sql`SELECT organization_id FROM members WHERE user_id = ${user.id} LIMIT 1`;
const [firm] = await sql`SELECT id, organization_id, name, website FROM service_firms WHERE organization_id = ${member.organization_id} LIMIT 1`;

console.log(`Firm: ${firm.name} | ${firm.website}`);

const jobId = `job_crawl_${firm.id}_${Date.now()}`;
await sql`
  INSERT INTO background_jobs (id, type, payload, status, run_at, created_at, updated_at)
  VALUES (
    ${jobId}, 'deep-crawl',
    ${JSON.stringify({ firmId: firm.id, organizationId: firm.organization_id, website: firm.website, firmName: firm.name })},
    'pending', NOW(), NOW(), NOW()
  )
  ON CONFLICT DO NOTHING
`;
console.log(`Queued: ${jobId}`);
