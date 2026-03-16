/**
 * Sync Instantly campaign data into prospect_timeline.
 * Pulls campaigns and leads from the Instantly API, then inserts
 * aggregate events (email_sent, email_opened, email_replied) per lead.
 *
 * Since Instantly doesn't provide per-event timestamps, these are stored
 * as "all-time" events with event_at = lead creation date or now.
 *
 * Usage: node scripts/sync-instantly-to-timeline.mjs
 *   --dry-run   Show counts without inserting
 */
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { neon } from '@neondatabase/serverless';

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

const API_KEY = process.env.INSTANTLY_API_KEY;
if (!API_KEY) {
  console.error('INSTANTLY_API_KEY not set in .env.local');
  process.exit(1);
}

const BASE_URL = 'https://api.instantly.ai/api/v2';

async function req(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Instantly ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function insertEvent(e) {
  await sql`
    INSERT INTO prospect_timeline (id, prospect_email, prospect_name, event_type, channel, campaign_id, campaign_name, metadata, event_at)
    VALUES (${e.id}, ${e.email}, ${e.name}, ${e.eventType}, 'instantly', ${e.campaignId}, ${e.campaignName}, ${JSON.stringify(e.metadata)}, ${e.eventAt})
    ON CONFLICT (id) DO NOTHING
  `;
}

console.log(`=== Sync Instantly → Timeline ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// 1. List all campaigns
console.log('Fetching campaigns...');
let campaigns;
try {
  const campaignsRes = await req('GET', '/campaigns?limit=100');
  campaigns = campaignsRes.data || campaignsRes.items || campaignsRes;
  if (!Array.isArray(campaigns)) {
    console.log('Unexpected campaigns response:', JSON.stringify(campaignsRes).slice(0, 200));
    campaigns = [];
  }
} catch (err) {
  console.error('Failed to fetch campaigns:', err.message);
  process.exit(1);
}
console.log(`  Found ${campaigns.length} campaigns\n`);

let totalInserted = 0;

for (const campaign of campaigns) {
  const campaignId = campaign.id;
  const campaignName = campaign.name || 'Unnamed';
  console.log(`Campaign: ${campaignName} (${campaignId})`);

  // Paginate through all leads
  let cursor = undefined;
  let leadCount = 0;
  const events = [];

  while (true) {
    let leadsRes;
    try {
      leadsRes = await req('POST', '/leads/list', {
        campaign_id: campaignId,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      });
    } catch (err) {
      console.log(`  Error fetching leads: ${err.message}`);
      break;
    }

    const leads = leadsRes.data || leadsRes.items || leadsRes;
    if (!Array.isArray(leads) || leads.length === 0) break;

    for (const lead of leads) {
      const email = lead.email;
      if (!email) continue;
      leadCount++;

      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '';
      const createdAt = lead.created_at || new Date().toISOString();

      // Always create email_sent event
      events.push({
        id: randomUUID(), email, name, eventType: 'email_sent',
        campaignId, campaignName,
        metadata: { leadId: lead.id, source: 'instantly_sync' },
        eventAt: createdAt,
      });

      // If opened
      if (lead.email_opened || (lead.open_count && lead.open_count > 0)) {
        events.push({
          id: randomUUID(), email, name, eventType: 'email_opened',
          campaignId, campaignName,
          metadata: { leadId: lead.id, openCount: lead.open_count, source: 'instantly_sync' },
          eventAt: createdAt,
        });
      }

      // If replied
      if (lead.email_replied || (lead.reply_count && lead.reply_count > 0)) {
        events.push({
          id: randomUUID(), email, name, eventType: 'email_replied',
          campaignId, campaignName,
          metadata: { leadId: lead.id, replyCount: lead.reply_count, source: 'instantly_sync' },
          eventAt: createdAt,
        });
      }
    }

    cursor = leads[leads.length - 1]?.id;
    if (leads.length < 100) break;

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  ${leadCount} leads → ${events.length} events`);

  if (!dryRun && events.length > 0) {
    // Clear previous sync data for this campaign
    await sql`
      DELETE FROM prospect_timeline
      WHERE campaign_id = ${campaignId}
        AND metadata::text LIKE '%instantly_sync%'
    `;

    const CONCURRENCY = 20;
    for (let i = 0; i < events.length; i += CONCURRENCY) {
      const batch = events.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(insertEvent));
    }
    totalInserted += events.length;
  }
}

const [{ count: finalCount }] = await sql`SELECT count(*) as count FROM prospect_timeline`;
console.log(`\n=== Done! ===`);
console.log(`  Instantly events inserted: ${totalInserted}`);
console.log(`  Total prospect_timeline rows: ${finalCount}`);
