/**
 * Convert imported_outreach rows into prospect_timeline events.
 * - outbound messages → email_sent
 * - inbound messages → email_replied
 * - Channel derived from message_module field
 *
 * Prerequisite: imported_outreach table must be populated (via n8n export workflow).
 *
 * Usage: node scripts/backfill-outreach-to-timeline.mjs
 *   --dry-run   Show counts without inserting
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

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
const dryRun = process.argv.includes('--dry-run');

console.log(`=== Backfill Outreach → Timeline ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// Check source data
const [{ count: outreachCount }] = await sql`SELECT count(*) as count FROM imported_outreach`;
console.log(`imported_outreach rows: ${outreachCount}`);

if (Number(outreachCount) === 0) {
  console.log('\nNo outreach data to process. Trigger the n8n export workflow first.');
  console.log('POST /api/admin/import/outreach with fact.messages data from n8n.');
  process.exit(0);
}

// Fetch all outreach with contact emails
const BATCH_SIZE = 1000;
let offset = 0;
let totalInserted = 0;

async function insertEvent(e) {
  await sql`
    INSERT INTO prospect_timeline (id, prospect_email, prospect_name, event_type, channel, campaign_id, campaign_name, metadata, event_at)
    VALUES (${e.id}, ${e.email}, ${e.name}, ${e.eventType}, ${e.channel}, ${e.campaignId}, ${e.campaignName}, ${JSON.stringify(e.metadata)}, ${e.eventAt})
    ON CONFLICT (id) DO NOTHING
  `;
}

while (true) {
  const rows = await sql`
    SELECT o.id, o.source_id, o.direction, o.message_type, o.message_module,
           o.opportunity_title, o.sent_at, o.created_at,
           c.email as contact_email, c.name as contact_name, c.first_name, c.last_name
    FROM imported_outreach o
    LEFT JOIN imported_contacts c ON c.id = o.contact_id
    WHERE c.email IS NOT NULL
    ORDER BY o.id
    LIMIT ${BATCH_SIZE} OFFSET ${offset}
  `;

  if (rows.length === 0) break;

  console.log(`  Processing batch at offset ${offset} (${rows.length} rows)`);

  if (!dryRun) {
    const events = rows.map(r => {
      const eventType = r.direction === 'inbound' ? 'email_replied' : 'email_sent';
      const channel = r.message_module?.toLowerCase()?.includes('linkedin') ? 'linkedin' : 'instantly';
      const name = r.contact_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '';
      const eventAt = r.sent_at || r.created_at;

      return {
        id: randomUUID(),
        email: r.contact_email,
        name,
        eventType,
        channel,
        campaignId: null,
        campaignName: r.opportunity_title || null,
        metadata: { outreachId: r.id, sourceId: r.source_id, messageModule: r.message_module },
        eventAt: new Date(eventAt).toISOString(),
      };
    });

    const CONCURRENCY = 20;
    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const batch = events.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(insertEvent));
    }
    totalInserted += rows.length;
  }

  offset += BATCH_SIZE;
}

const [{ count: finalCount }] = await sql`SELECT count(*) as count FROM prospect_timeline`;
console.log(`\n=== Done! ===`);
console.log(`  Outreach rows processed: ${offset}`);
console.log(`  Timeline events inserted: ${totalInserted}`);
console.log(`  Total prospect_timeline rows: ${finalCount}`);
