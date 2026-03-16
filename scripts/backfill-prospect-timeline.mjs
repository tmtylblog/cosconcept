/**
 * Backfill prospect_timeline from existing data sources:
 * 1. acq_contacts + acq_deals → deal_created events
 * 2. growth_ops_invite_queue → linkedin_invite_sent / linkedin_invite_accepted events
 * 3. users matched by email → signed_up events
 * 4. service_firms with profile_completeness > 0.3 → onboarded events
 * 5. subscriptions with plan != 'free' → paying events
 *
 * Usage: node scripts/backfill-prospect-timeline.mjs
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

console.log(`=== Backfill Prospect Timeline ${dryRun ? '(DRY RUN)' : ''} ===\n`);

// Check existing count
const [{ count: existingCount }] = await sql`SELECT count(*) as count FROM prospect_timeline`;
console.log(`Existing prospect_timeline rows: ${existingCount}\n`);

let totalInserted = 0;

/** Insert a single event into prospect_timeline */
async function insertEvent(e) {
  await sql`
    INSERT INTO prospect_timeline (id, prospect_email, prospect_name, event_type, channel, campaign_id, campaign_name, metadata, event_at)
    VALUES (${e.id}, ${e.email}, ${e.name}, ${e.eventType}, ${e.channel}, ${e.campaignId}, ${e.campaignName}, ${JSON.stringify(e.metadata)}, ${e.eventAt})
    ON CONFLICT (id) DO NOTHING
  `;
}

/** Insert events in concurrent batches */
async function insertBatch(events) {
  const CONCURRENCY = 20;
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(insertEvent));
    totalInserted += batch.length;
  }
}

// ── 1. acq_deals → deal_created events ────────────────────────
console.log('--- Step 1: Deals → deal_created ---');
const deals = await sql`
  SELECT d.id, d.name, d.source, d.source_channel, d.source_campaign_id, d.source_campaign_name,
         d.created_at, d.status, d.stage_label,
         c.email, c.first_name, c.last_name
  FROM acq_deals d
  LEFT JOIN acq_contacts c ON c.id = d.contact_id
  WHERE c.email IS NOT NULL
`;
console.log(`  Found ${deals.length} deals with contacts`);

if (!dryRun && deals.length > 0) {
  const events = deals.map(d => {
    const channel = d.source_channel || (d.source === 'instantly_auto' ? 'instantly' : d.source === 'linkedin_auto' ? 'linkedin' : 'manual');
    return {
      id: randomUUID(),
      email: d.email,
      name: ((d.first_name || '') + ' ' + (d.last_name || '')).trim(),
      eventType: 'deal_created',
      channel,
      campaignId: d.source_campaign_id || null,
      campaignName: d.source_campaign_name || null,
      metadata: { dealId: d.id, status: d.status, stageLabel: d.stage_label },
      eventAt: new Date(d.created_at).toISOString(),
    };
  });
  await insertBatch(events);
  console.log(`  Inserted ${deals.length} deal_created events`);
}

// ── 2. invite_queue → linkedin_invite_sent / accepted ──────────
console.log('\n--- Step 2: LinkedIn invite queue ---');
const invites = await sql`
  SELECT q.id, q.status, q.scheduled_at, q.sent_at,
         q.campaign_id, ic.name as campaign_name,
         t.first_name, t.linkedin_url
  FROM growth_ops_invite_queue q
  JOIN growth_ops_invite_targets t ON t.id = q.target_id
  LEFT JOIN growth_ops_invite_campaigns ic ON ic.id = q.campaign_id
  WHERE q.status IN ('sent', 'accepted')
`;
console.log(`  Found ${invites.length} sent/accepted invites`);

if (!dryRun && invites.length > 0) {
  const events = [];

  for (const inv of invites) {
    const pseudoEmail = inv.linkedin_url || `linkedin:${inv.id}`;
    const name = inv.first_name || '';

    events.push({
      id: randomUUID(),
      email: pseudoEmail,
      name,
      eventType: 'linkedin_invite_sent',
      channel: 'linkedin',
      campaignId: inv.campaign_id || null,
      campaignName: inv.campaign_name || null,
      metadata: { inviteQueueId: inv.id },
      eventAt: new Date(inv.sent_at || inv.scheduled_at).toISOString(),
    });

    if (inv.status === 'accepted') {
      events.push({
        id: randomUUID(),
        email: pseudoEmail,
        name,
        eventType: 'linkedin_invite_accepted',
        channel: 'linkedin',
        campaignId: inv.campaign_id || null,
        campaignName: inv.campaign_name || null,
        metadata: { inviteQueueId: inv.id },
        eventAt: new Date(inv.sent_at || inv.scheduled_at).toISOString(),
      });
    }
  }

  await insertBatch(events);
  console.log(`  Inserted ${events.length} LinkedIn invite events`);
}

// ── 3. users → signed_up events ───────────────────────────────
console.log('\n--- Step 3: Users → signed_up ---');
const signups = await sql`
  SELECT u.id, u.email, u.name, u.created_at
  FROM users u
  WHERE u.email IS NOT NULL
`;
console.log(`  Found ${signups.length} users`);

if (!dryRun && signups.length > 0) {
  const events = signups.map(u => ({
    id: randomUUID(),
    email: u.email,
    name: u.name || '',
    eventType: 'signed_up',
    channel: 'organic',
    campaignId: null,
    campaignName: null,
    metadata: { userId: u.id },
    eventAt: new Date(u.created_at).toISOString(),
  }));
  await insertBatch(events);
  console.log(`  Inserted ${signups.length} signed_up events`);
}

// ── 4. service_firms with completeness > 0.3 → onboarded ──────
console.log('\n--- Step 4: Service firms → onboarded ---');
const onboarded = await sql`
  SELECT sf.id, sf.name, sf.profile_completeness, sf.created_at,
         m.user_id, u.email, u.name as user_name
  FROM service_firms sf
  JOIN members m ON m.organization_id = sf.organization_id AND m.role = 'owner'
  JOIN users u ON u.id = m.user_id
  WHERE sf.profile_completeness > 0.3
    AND u.email IS NOT NULL
`;
console.log(`  Found ${onboarded.length} onboarded firms`);

if (!dryRun && onboarded.length > 0) {
  const events = onboarded.map(f => ({
    id: randomUUID(),
    email: f.email,
    name: f.user_name || '',
    eventType: 'onboarded',
    channel: 'organic',
    campaignId: null,
    campaignName: null,
    metadata: { firmId: f.id, firmName: f.name, completeness: f.profile_completeness },
    eventAt: new Date(f.created_at).toISOString(),
  }));
  await insertBatch(events);
  console.log(`  Inserted ${onboarded.length} onboarded events`);
}

// ── 5. subscriptions with plan != 'free' → paying ─────────────
console.log('\n--- Step 5: Paid subscriptions → paying ---');
const paying = await sql`
  SELECT s.id, s.plan, s.created_at, s.organization_id,
         m.user_id, u.email, u.name as user_name
  FROM subscriptions s
  JOIN members m ON m.organization_id = s.organization_id AND m.role = 'owner'
  JOIN users u ON u.id = m.user_id
  WHERE s.plan != 'free'
    AND s.status IN ('active', 'trialing')
    AND u.email IS NOT NULL
`;
console.log(`  Found ${paying.length} paying subscriptions`);

if (!dryRun && paying.length > 0) {
  const events = paying.map(p => ({
    id: randomUUID(),
    email: p.email,
    name: p.user_name || '',
    eventType: 'paying',
    channel: 'organic',
    campaignId: null,
    campaignName: null,
    metadata: { subscriptionId: p.id, plan: p.plan },
    eventAt: new Date(p.created_at).toISOString(),
  }));
  await insertBatch(events);
  console.log(`  Inserted ${paying.length} paying events`);
}

// ── Summary ───────────────────────────────────────────────────
const [{ count: finalCount }] = await sql`SELECT count(*) as count FROM prospect_timeline`;
console.log(`\n=== Done! ===`);
console.log(`  Total inserted this run: ${totalInserted}`);
console.log(`  Total prospect_timeline rows: ${finalCount}`);
