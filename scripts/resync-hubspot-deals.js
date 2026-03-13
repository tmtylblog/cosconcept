/**
 * Quick script to re-sync all HubSpot deals into COS.
 * Skips the slow per-deal association lookups — just gets the deal data in.
 */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const crypto = require('crypto');

async function hubspotReq(method, path, body) {
  const res = await fetch('https://api.hubapi.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} -> ${res.status}`);
  return res.json();
}

async function paginate(path) {
  const results = [];
  let after;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const url = path + sep + 'limit=100' + (after ? '&after=' + after : '');
    const data = await hubspotReq('GET', url);
    results.push(...(data.results || []));
    after = data.paging && data.paging.next && data.paging.next.after;
    if (!after) break;
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

(async () => {
  console.log('Fetching HubSpot pipelines...');
  const pipelines = await hubspotReq('GET', '/crm/v3/pipelines/deals');

  // Build stage map
  const stageMap = {};
  for (const p of pipelines.results) {
    for (const s of p.stages) {
      stageMap[s.id] = { label: s.label, pipelineId: p.id, pipelineLabel: p.label };
    }
  }

  // Load COS stage mappings
  const cosStages = await sql.query('SELECT id, label, hubspot_stage_id FROM acq_pipeline_stages');
  const cosStageByHsId = {};
  const cosStageByLabel = {};
  for (const s of cosStages) {
    if (s.hubspot_stage_id) cosStageByHsId[s.hubspot_stage_id] = s.id;
    cosStageByLabel[s.label.toLowerCase().trim()] = s.id;
  }

  console.log('Fetching all deals...');
  const deals = await paginate('/crm/v3/objects/deals?properties=dealname,dealstage,pipeline,amount,closedate');
  console.log(`Got ${deals.length} deals. Upserting...`);

  const now = new Date().toISOString();
  let upserted = 0;
  let errors = 0;

  for (const d of deals) {
    const p = d.properties || {};
    const stageInfo = stageMap[p.dealstage] || null;

    const isWon = (p.dealstage || '').includes('closedwon') ||
      (stageInfo && stageInfo.label && (stageInfo.label.toLowerCase().includes('paid') || stageInfo.label.toLowerCase().includes('customer')));
    const isLost = (p.dealstage || '').includes('closedlost') ||
      (stageInfo && stageInfo.label && (stageInfo.label.toLowerCase().includes('declined') || stageInfo.label.toLowerCase().includes('disqualified') || stageInfo.label.toLowerCase().includes('churned')));

    let cosStageId = cosStageByHsId[p.dealstage] || null;
    if (!cosStageId && stageInfo && stageInfo.label) {
      cosStageId = cosStageByLabel[stageInfo.label.toLowerCase().trim()] || null;
    }

    try {
      await sql.query(`
        INSERT INTO acq_deals (id, name, stage_id, hubspot_deal_id, hubspot_pipeline_id, hubspot_stage_id, stage_label, deal_value, status, source, source_channel, closed_at, hubspot_synced_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        ON CONFLICT (hubspot_deal_id) DO UPDATE SET
          name = $2, stage_id = $3, hubspot_pipeline_id = $5, hubspot_stage_id = $6, stage_label = $7, deal_value = $8, status = $9, closed_at = $12, hubspot_synced_at = $13, updated_at = $14
      `, [
        crypto.randomUUID(),
        p.dealname || 'Untitled Deal',
        cosStageId,
        d.id,
        (stageInfo && stageInfo.pipelineId) || p.pipeline || null,
        p.dealstage || null,
        (stageInfo && stageInfo.label) || p.dealstage || '',
        p.amount || null,
        isWon ? 'won' : isLost ? 'lost' : 'open',
        'hubspot_sync',
        'hubspot',
        p.closedate || null,
        now,
        now,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error('Error upserting deal', d.id, ':', e.message);
    }

    if (upserted % 100 === 0) {
      console.log(`  ${upserted} / ${deals.length} upserted...`);
    }
  }

  console.log(`\nDone! ${upserted} deals upserted, ${errors} errors.`);

  // Verify final count
  const count = await sql.query('SELECT count(*) as total FROM acq_deals');
  console.log('Total deals in COS now:', count[0].total);

  const byStage = await sql.query('SELECT stage_id, stage_label, count(*) as cnt FROM acq_deals GROUP BY stage_id, stage_label ORDER BY cnt DESC');
  console.log('By stage:');
  for (const row of byStage) {
    console.log(`  ${row.stage_label}: ${row.cnt}${row.stage_id ? '' : ' (no COS stage)'}`);
  }
})().catch(e => console.error(e));
