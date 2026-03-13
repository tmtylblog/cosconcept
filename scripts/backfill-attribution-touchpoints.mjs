/**
 * Backfill attribution touchpoints for existing attributed users.
 *
 * Scans existing attribution_events rows, cross-references LinkedIn conversations
 * and campaign invites, then populates attribution_touchpoints + updates
 * the boolean flags on attribution_events.
 *
 * Usage: node scripts/backfill-attribution-touchpoints.mjs
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

console.log('=== Backfill Attribution Touchpoints ===\n');

// 1. Get all attribution events with user LinkedIn URLs
const events = await sql`
  SELECT ae.id, ae.user_id, ae.match_method, ae.instantly_campaign_id, ae.instantly_campaign_name,
         u.linkedin_url, u.email
  FROM attribution_events ae
  JOIN users u ON u.id = ae.user_id
`;

console.log(`Found ${events.length} attribution events to process\n`);

let touchpointsCreated = 0;
let eventsUpdated = 0;

for (const event of events) {
  const touchpoints = [];
  let hasLinkedinOrganic = false;
  let hasLinkedinCampaign = false;
  let linkedinConversationCount = 0;

  // Check for existing touchpoints (idempotency)
  const existing = await sql`
    SELECT COUNT(*)::int as count FROM attribution_touchpoints WHERE user_id = ${event.user_id}
  `;
  if (existing[0]?.count > 0) {
    continue; // Already backfilled
  }

  // LinkedIn organic conversations
  if (event.linkedin_url) {
    const normalizedUrl = event.linkedin_url.toLowerCase().trim().replace(/\/$/, '');
    const convos = await sql`
      SELECT gc.id, gc.participant_name, gc.last_message_at, gc.chat_id
      FROM growth_ops_conversations gc
      WHERE LOWER(RTRIM(gc.participant_profile_url, '/')) = ${normalizedUrl}
    `;

    if (convos.length > 0) {
      hasLinkedinOrganic = true;
      linkedinConversationCount = convos.length;

      for (const convo of convos) {
        const msgCount = await sql`
          SELECT COUNT(*)::int as count FROM growth_ops_messages WHERE chat_id = ${convo.chat_id}
        `;
        touchpoints.push({
          id: randomUUID(),
          user_id: event.user_id,
          channel: 'linkedin_organic_conversation',
          source_id: convo.id,
          source_name: convo.participant_name,
          touchpoint_at: convo.last_message_at || new Date().toISOString(),
          interaction_type: (msgCount[0]?.count ?? 0) > 1 ? 'replied' : 'conversation_started',
        });
      }
    }

    // LinkedIn campaign invites
    const targets = await sql`
      SELECT git.id FROM growth_ops_invite_targets git
      WHERE LOWER(RTRIM(git.linkedin_url, '/')) = ${normalizedUrl}
    `;

    for (const target of targets) {
      const queueRows = await sql`
        SELECT giq.campaign_id, giq.status, giq.sent_at, giq.accepted_at, gic.name as campaign_name
        FROM growth_ops_invite_queue giq
        LEFT JOIN growth_ops_invite_campaigns gic ON gic.id = giq.campaign_id
        WHERE giq.target_id = ${target.id}
      `;

      for (const q of queueRows) {
        hasLinkedinCampaign = true;
        if (q.sent_at) {
          touchpoints.push({
            id: randomUUID(),
            user_id: event.user_id,
            channel: 'linkedin_campaign_invite',
            source_id: q.campaign_id,
            source_name: q.campaign_name,
            touchpoint_at: q.sent_at,
            interaction_type: 'sent',
          });
        }
        if (q.accepted_at) {
          touchpoints.push({
            id: randomUUID(),
            user_id: event.user_id,
            channel: 'linkedin_campaign_invite',
            source_id: q.campaign_id,
            source_name: q.campaign_name,
            touchpoint_at: q.accepted_at,
            interaction_type: 'accepted',
          });
        }
      }
    }
  }

  // Instantly touchpoint
  if (event.instantly_campaign_id) {
    touchpoints.push({
      id: randomUUID(),
      user_id: event.user_id,
      channel: 'instantly_email',
      source_id: event.instantly_campaign_id,
      source_name: event.instantly_campaign_name,
      touchpoint_at: new Date().toISOString(),
      interaction_type: 'sent',
    });
  }

  // Write touchpoints
  for (const tp of touchpoints) {
    await sql`
      INSERT INTO attribution_touchpoints (id, user_id, channel, source_id, source_name, touchpoint_at, interaction_type)
      VALUES (${tp.id}, ${tp.user_id}, ${tp.channel}, ${tp.source_id}, ${tp.source_name}, ${tp.touchpoint_at}, ${tp.interaction_type})
    `;
    touchpointsCreated++;
  }

  // Update attribution_events flags
  if (hasLinkedinOrganic || hasLinkedinCampaign) {
    await sql`
      UPDATE attribution_events
      SET has_linkedin_organic = ${hasLinkedinOrganic},
          has_linkedin_campaign = ${hasLinkedinCampaign},
          linkedin_conversation_count = ${linkedinConversationCount}
      WHERE user_id = ${event.user_id}
    `;
    eventsUpdated++;
  }

  if (touchpoints.length > 0) {
    console.log(`  ${event.email}: ${touchpoints.length} touchpoints (organic=${hasLinkedinOrganic}, campaign=${hasLinkedinCampaign})`);
  }
}

console.log(`\n=== Done ===`);
console.log(`  Touchpoints created: ${touchpointsCreated}`);
console.log(`  Events updated: ${eventsUpdated}`);
