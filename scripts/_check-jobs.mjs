import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
const sql = neon(process.env.DATABASE_URL);

const byType = await sql`SELECT type, status, COUNT(*) as count FROM background_jobs WHERE status = 'pending' GROUP BY type, status ORDER BY type`;
console.log('=== Pending Jobs by Type ===');
byType.forEach(r => console.log(`  ${r.type}: ${r.count}`));

const recent = await sql`SELECT id, type, status, updated_at FROM background_jobs WHERE status != 'pending' ORDER BY updated_at DESC LIMIT 5`;
if (recent.length) {
  console.log('\nRecently processed:');
  recent.forEach(r => console.log(`  [${r.status}] ${r.type} | ${r.updated_at}`));
}
