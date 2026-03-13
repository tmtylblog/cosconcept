/**
 * Backfill LinkedIn URLs for existing users via PDL person enrichment.
 *
 * Looks up each user's email in PDL to find their LinkedIn profile URL.
 * After finding URLs, clears old attribution data and re-runs attribution.
 *
 * Only processes account owners (role = 'user'), NOT experts/team members.
 *
 * Usage:
 *   node scripts/backfill-linkedin-urls.mjs                # Full run
 *   node scripts/backfill-linkedin-urls.mjs --dry-run      # Preview only
 *   node scripts/backfill-linkedin-urls.mjs --limit 10     # Process 10 users
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load env
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[match[1].trim()] = val;
  }
}

const sql = neon(process.env.DATABASE_URL);
const PDL_API_KEY = process.env.PDL_API_KEY;

if (!PDL_API_KEY) {
  console.error('ERROR: PDL_API_KEY not found in .env.local');
  process.exit(1);
}

// Parse CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

console.log('=== Backfill LinkedIn URLs via PDL ===');
console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
if (limit) console.log(`  Limit: ${limit} users`);
console.log('');

// 1. Get users that need LinkedIn URL lookup (account owners only)
const query = limit
  ? sql`SELECT id, email, name, linkedin_url FROM users WHERE pdl_linkedin_looked_up = false AND linkedin_url IS NULL AND (role = 'user' OR role IS NULL) ORDER BY created_at ASC LIMIT ${limit}`
  : sql`SELECT id, email, name, linkedin_url FROM users WHERE pdl_linkedin_looked_up = false AND linkedin_url IS NULL AND (role = 'user' OR role IS NULL) ORDER BY created_at ASC`;

const usersToProcess = await query;
console.log(`Found ${usersToProcess.length} users to process\n`);

let found = 0;
let notFound = 0;
let errors = 0;
const usersWithNewUrls = [];
let delay = 200; // ms between PDL calls

for (const user of usersToProcess) {
  console.log(`  [${found + notFound + errors + 1}/${usersToProcess.length}] ${user.email}...`);

  if (dryRun) {
    console.log(`    Would call PDL enrichPerson({ email: "${user.email}" })`);
    continue;
  }

  try {
    const params = new URLSearchParams({
      api_key: PDL_API_KEY,
      email: user.email.toLowerCase().trim(),
      titlecase: 'true',
    });

    const response = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`);

    if (response.status === 404) {
      // Not found — mark as looked up to prevent re-querying
      await sql`UPDATE users SET pdl_linkedin_looked_up = true, updated_at = NOW() WHERE id = ${user.id}`;
      notFound++;
      console.log(`    Not found in PDL`);
    } else if (response.status === 429) {
      // Rate limited — increase delay and skip
      errors++;
      delay = Math.min(delay * 2, 5000);
      console.log(`    Rate limited — increasing delay to ${delay}ms`);
    } else if (response.ok) {
      const raw = await response.json();
      const data = raw.data ?? raw;
      const linkedinUrl = data.linkedin_url ?? null;

      if (linkedinUrl) {
        await sql`UPDATE users SET linkedin_url = ${linkedinUrl}, pdl_linkedin_looked_up = true, updated_at = NOW() WHERE id = ${user.id}`;
        usersWithNewUrls.push({ id: user.id, email: user.email, linkedinUrl });
        found++;
        console.log(`    ✓ Found: ${linkedinUrl}`);
      } else {
        await sql`UPDATE users SET pdl_linkedin_looked_up = true, updated_at = NOW() WHERE id = ${user.id}`;
        notFound++;
        console.log(`    PDL match but no LinkedIn URL`);
      }
    } else {
      errors++;
      console.log(`    Error: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    errors++;
    console.log(`    Error: ${err.message}`);
  }

  // Rate limit delay
  await new Promise((r) => setTimeout(r, delay));
}

console.log('\n--- PDL Lookup Summary ---');
console.log(`  Processed: ${found + notFound + errors}`);
console.log(`  Found: ${found}`);
console.log(`  Not found: ${notFound}`);
console.log(`  Errors: ${errors}`);

// 2. Re-run attribution for users that got new LinkedIn URLs
if (usersWithNewUrls.length > 0 && !dryRun) {
  console.log(`\n--- Re-running Attribution for ${usersWithNewUrls.length} users ---`);

  for (const user of usersWithNewUrls) {
    try {
      // Clear old attribution data
      await sql`DELETE FROM attribution_touchpoints WHERE user_id = ${user.id}`;
      await sql`DELETE FROM attribution_events WHERE user_id = ${user.id}`;

      // Queue re-attribution via background_jobs table
      const nameParts = (user.email.split('@')[0] ?? '').split('.');
      await sql`
        INSERT INTO background_jobs (id, type, payload, status, created_at)
        VALUES (
          ${crypto.randomUUID()},
          'attribution-check',
          ${JSON.stringify({
            userId: user.id,
            email: user.email,
            linkedinUrl: user.linkedinUrl,
            firstName: nameParts[0] ?? null,
            lastName: nameParts.slice(1).join(' ') || null,
          })},
          'pending',
          NOW()
        )
      `;
      console.log(`  Queued re-attribution for ${user.email}`);
    } catch (err) {
      console.log(`  Failed to queue re-attribution for ${user.email}: ${err.message}`);
    }
  }
}

console.log('\n=== Done ===');
