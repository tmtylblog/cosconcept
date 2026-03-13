import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL);
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

// Helper: sql.query returns array directly with neon serverless
async function query(text, params = []) {
  const result = await sql.query(text, params);
  return result.rows || result || [];
}

if (!TOKEN) { console.error("No HUBSPOT_ACCESS_TOKEN"); process.exit(1); }

// 1. Fetch HubSpot pipelines
const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
  headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
});
const data = await res.json();
const pipelines = data.results || [];
console.log("Pipelines found:", pipelines.map(p => `${p.label} (${p.stages?.length || 0} stages)`).join(", "));

// Find Self Sign Up pipeline
const primary = pipelines.find(p =>
  p.label?.toLowerCase().includes("self") ||
  p.label?.toLowerCase().includes("sign up") ||
  p.label?.toLowerCase().includes("signup")
) || pipelines[0];

if (!primary) { console.error("No pipeline found"); process.exit(1); }
console.log("\nPrimary pipeline:", primary.label);
console.log("Stages:", primary.stages.map(s => `${s.label} (order:${s.displayOrder})`).join(", "));

// 2. Seed stages from primary pipeline
const colors = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#ef4444"];
let seeded = 0;
for (const stage of primary.stages || []) {
  const isWon = stage.id?.includes("closedwon") || stage.label?.toLowerCase().includes("customer");
  const isLost = stage.id?.includes("closedlost") || stage.label?.toLowerCase().includes("lost");
  const id = crypto.randomUUID();

  const existing = await query("SELECT id FROM acq_pipeline_stages WHERE hubspot_stage_id = $1 LIMIT 1", [stage.id]);
  if (existing.length > 0) {
    await query(
      "UPDATE acq_pipeline_stages SET label = $1, display_order = $2, is_closed_won = $3, is_closed_lost = $4, updated_at = NOW() WHERE hubspot_stage_id = $5",
      [stage.label, stage.displayOrder, isWon, isLost, stage.id]
    );
    console.log("  Updated:", stage.label);
  } else {
    await query(
      "INSERT INTO acq_pipeline_stages (id, pipeline_id, label, display_order, is_closed_won, is_closed_lost, hubspot_stage_id, color) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, "default", stage.label, stage.displayOrder, isWon, isLost, stage.id, colors[seeded % colors.length]]
    );
    console.log("  Seeded:", stage.label);
  }
  seeded++;
}
console.log(`\nSeeded ${seeded} stages from "${primary.label}"`);

// 3. Build alias map for old pipeline stages
const seededStages = await query(
  "SELECT id, label, display_order, is_closed_won, is_closed_lost FROM acq_pipeline_stages WHERE pipeline_id = $1 ORDER BY display_order",
  ["default"]
);
console.log("\nCOS stages:", seededStages.map(s => s.label).join(", "));

const aliasMap = new Map();
for (const otherPipeline of pipelines) {
  if (otherPipeline.id === primary.id) continue;
  console.log("\nAliasing old pipeline:", otherPipeline.label);
  for (const oldStage of otherPipeline.stages || []) {
    const norm = oldStage.label.toLowerCase();
    let match = seededStages.find(s => s.label.toLowerCase() === norm);
    if (!match) {
      if (/prospect|lead|new/i.test(norm)) match = seededStages.find(s => /prospect|lead/i.test(s.label));
      else if (/contact|outreach/i.test(norm)) match = seededStages.find(s => /contact|outreach/i.test(s.label));
      else if (/qualif|discovery/i.test(norm)) match = seededStages.find(s => /qualif|discovery/i.test(s.label));
      else if (/demo|present|meeting|sales/i.test(norm)) match = seededStages.find(s => /demo|meeting|sales/i.test(s.label));
      else if (/proposal|negotiat/i.test(norm)) match = seededStages.find(s => /proposal/i.test(s.label));
      else if (/follow/i.test(norm)) match = seededStages.find(s => /follow/i.test(s.label));
      else if (/freemium|free/i.test(norm)) match = seededStages.find(s => /freemium|free/i.test(s.label));
      else if (/paid|customer|closed.?won|won/i.test(norm)) match = seededStages.find(s => s.is_closed_won || /paid/i.test(s.label));
      else if (/lost|closed.?lost|unresponsive/i.test(norm)) match = seededStages.find(s => s.is_closed_lost || /unresponsive/i.test(s.label));
      else match = seededStages[0];
    }
    if (match) {
      aliasMap.set(oldStage.id, match.id);
      console.log(`  ${oldStage.label} -> ${match.label}`);
    }
  }
}

// 4. Backfill stage_id on existing deals
const deals = await query("SELECT id, hubspot_stage_id FROM acq_deals WHERE hubspot_stage_id IS NOT NULL");
const stageMapRows = await query("SELECT id, hubspot_stage_id FROM acq_pipeline_stages WHERE hubspot_stage_id IS NOT NULL");
const stageMap = new Map(stageMapRows.map(s => [s.hubspot_stage_id, s.id]));

let backfilled = 0;
let unmapped = 0;
for (const deal of deals) {
  const cosStageId = stageMap.get(deal.hubspot_stage_id) || aliasMap.get(deal.hubspot_stage_id);
  if (cosStageId) {
    await query("UPDATE acq_deals SET stage_id = $1 WHERE id = $2", [cosStageId, deal.id]);
    backfilled++;
  } else {
    unmapped++;
    if (unmapped <= 5) console.log("  Unmapped stage:", deal.hubspot_stage_id);
  }
}
console.log(`\nBackfilled stage_id on ${backfilled}/${deals.length} deals (${unmapped} unmapped)`);
console.log("\nDone!");
