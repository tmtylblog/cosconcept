const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

async function paginate(path) {
  const results = [];
  let after;
  let page = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const url = 'https://api.hubapi.com' + path + sep + 'limit=100' + (after ? '&after=' + after : '');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const data = await res.json();
    results.push(...(data.results || []));
    after = data.paging && data.paging.next && data.paging.next.after;
    console.log('Page', page, '- fetched', (data.results || []).length, 'total so far:', results.length, after ? '(more...)' : '(done)');
    if (!after) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

(async () => {
  const deals = await paginate('/crm/v3/objects/deals?properties=dealname,dealstage,pipeline');
  console.log('Total deals fetched:', deals.length);
  const byPipeline = {};
  for (const d of deals) {
    const pip = (d.properties && d.properties.pipeline) || 'unknown';
    byPipeline[pip] = (byPipeline[pip] || 0) + 1;
  }
  console.log('By pipeline:', byPipeline);

  const byStage = {};
  for (const d of deals) {
    const stage = (d.properties && d.properties.dealstage) || 'unknown';
    byStage[stage] = (byStage[stage] || 0) + 1;
  }
  console.log('By stage:', byStage);
})().catch(e => console.error(e));
