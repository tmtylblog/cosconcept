import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load env manually
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const sql = neon(process.env.DATABASE_URL);

const [
  total, byStatus, absProfiles, absWithEmbed, csProfiles,
  services, experts, caseStudies, auditLog, jobs, pendingJobs, users, orgs
] = await Promise.all([
  sql`SELECT COUNT(*) FROM service_firms`,
  sql`SELECT enrichment_status, COUNT(*) FROM service_firms GROUP BY enrichment_status ORDER BY count DESC`,
  sql`SELECT COUNT(*) FROM abstraction_profiles WHERE entity_type = 'firm'`,
  sql`SELECT COUNT(*) FROM abstraction_profiles WHERE entity_type = 'firm' AND embedding IS NOT NULL`,
  sql`SELECT COUNT(*) FROM abstraction_profiles WHERE entity_type = 'case_study'`,
  sql`SELECT COUNT(*) FROM firm_services`,
  sql`SELECT COUNT(*) FROM expert_profiles`,
  sql`SELECT status, COUNT(*) FROM firm_case_studies GROUP BY status ORDER BY count DESC`,
  sql`SELECT phase, COUNT(*) FROM enrichment_audit_log GROUP BY phase ORDER BY count DESC`,
  sql`SELECT status, COUNT(*) FROM background_jobs GROUP BY status ORDER BY count DESC`,
  sql`SELECT type, COUNT(*) FROM background_jobs WHERE status = 'pending' GROUP BY type ORDER BY count DESC LIMIT 15`,
  sql`SELECT COUNT(*) FROM users`,
  sql`SELECT COUNT(*) FROM organizations`,
]);

console.log('=== SERVICE FIRMS ===');
console.log('Total:', total[0].count);
console.log('By enrichment status:', byStatus.map(r => `${r.enrichment_status}: ${r.count}`).join(', '));

console.log('\n=== ABSTRACTION PROFILES ===');
console.log('Firm profiles:', absProfiles[0].count);
console.log('  → with embeddings:', absWithEmbed[0].count);
console.log('Case study profiles:', csProfiles[0].count);

console.log('\n=== ENRICHMENT DATA ===');
console.log('Firm services:', services[0].count);
console.log('Expert profiles:', experts[0].count);
console.log('Case studies:', caseStudies.map(r => `${r.status}: ${r.count}`).join(', ') || 'none');

console.log('\n=== ENRICHMENT AUDIT LOG ===');
console.log(auditLog.length ? auditLog.map(r => `${r.phase}: ${r.count}`).join(', ') : 'empty');

console.log('\n=== BACKGROUND JOBS ===');
console.log('By status:', jobs.map(r => `${r.status}: ${r.count}`).join(', ') || 'none');
console.log('Pending by type:', pendingJobs.map(r => `${r.type}: ${r.count}`).join(', ') || 'none');

console.log('\n=== USERS & ORGS ===');
console.log('Users:', users[0].count, '| Orgs:', orgs[0].count);
