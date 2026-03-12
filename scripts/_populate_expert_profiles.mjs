/**
 * Populate expert_profiles from enrichment_data.extracted.teamMembers
 * for enriched firms that don't yet have any expert_profiles rows.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const sql = neon(env.DATABASE_URL);

function uid() {
  return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Get enriched firms with teamMembers in enrichment_data but no expert_profiles
const firms = await sql`
  SELECT sf.id as firm_id, sf.organization_id,
    sf.enrichment_data->'extracted'->'teamMembers' as team_members
  FROM service_firms sf
  WHERE sf.enrichment_status = 'enriched'
    AND jsonb_array_length(COALESCE(sf.enrichment_data->'extracted'->'teamMembers','[]'::jsonb)) > 0
    AND NOT EXISTS (SELECT 1 FROM expert_profiles ep WHERE ep.firm_id = sf.id)
`;

console.log(`Populating expert_profiles for ${firms.length} firms...`);

let inserted = 0;
for (const firm of firms) {
  const members = firm.team_members || [];
  if (!Array.isArray(members) || members.length === 0) continue;

  for (let i = 0; i < members.length && i < 10; i++) {
    const m = members[i];
    const name = typeof m === "string" ? m : (m?.name || m?.full_name);
    const title = typeof m === "object" ? (m?.title || m?.role || null) : null;
    if (!name || name.length > 200) continue;

    await sql`
      INSERT INTO expert_profiles (
        id, firm_id, organization_id,
        full_name, title,
        source, created_at, updated_at
      ) VALUES (
        ${uid()}, ${firm.firm_id}, ${firm.organization_id},
        ${name.slice(0, 200)},
        ${title ? title.slice(0, 200) : null},
        'enrichment_data',
        NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
    `;
    inserted++;
  }

  process.stdout.write(`\r  ${inserted} experts inserted for ${firms.indexOf(firm) + 1}/${firms.length} firms`);
}

console.log(`\nDone. ${inserted} expert_profiles rows created.`);

// Verify
const final = await sql`SELECT COUNT(*) as t, COUNT(DISTINCT firm_id) as f FROM expert_profiles`;
console.log(`expert_profiles table: ${final[0].t} total rows, ${final[0].f} firms covered`);
