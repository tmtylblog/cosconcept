#!/usr/bin/env node
/**
 * Backfill summaries for case studies that have skills/industries but no summary.
 *
 * Phase 1: Generate synthetic summaries from graph data (skills, industries, client, firm).
 *          Fast, no AI needed — just assembles a sentence from available context.
 *
 * Phase 2: For case studies with a scrapable sourceUrl, re-scrape and extract.
 *          Uses Jina Reader API with rate limiting. Slower but produces real summaries.
 *
 * Usage:
 *   node scripts/backfill-case-study-summaries.mjs              # Phase 1 only (fast)
 *   node scripts/backfill-case-study-summaries.mjs --rescrape   # Phase 1 + Phase 2
 *   node scripts/backfill-case-study-summaries.mjs --cleanup    # Delete ghost case studies
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

const BATCH_SIZE = 100;
const RESCRAPE_DELAY_MS = 2000; // Rate limit for Jina
const args = process.argv.slice(2);
const doRescrape = args.includes("--rescrape");
const doCleanup = args.includes("--cleanup");

// ─── Phase 1: Synthetic summaries from graph data ─────────

async function phase1() {
  console.log("\n=== Phase 1: Generate synthetic summaries ===\n");

  const session = driver.session();
  let processed = 0;
  let updated = 0;

  try {
    // Get all case studies without summary that have some graph data
    const result = await session.run(`
      MATCH (cs:CaseStudy)
      WHERE (cs.summary IS NULL OR trim(cs.summary) = '')
      WITH cs,
        [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..8] AS skills,
        [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..4] AS industries,
        [(cs)-[:FOR_CLIENT]->(cl:Company) | cl.name][0] AS clientName,
        [(cs)<-[:HAS_CASE_STUDY]-(sf:Company:ServiceFirm) | sf.name][0] AS firmName
      WHERE size(skills) > 0 OR size(industries) > 0 OR clientName IS NOT NULL
      RETURN cs.legacyId AS legacyId, skills, industries, clientName, firmName
    `);

    const records = result.records;
    console.log(`Found ${records.length} case studies with graph data but no summary`);

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const updates = [];

      for (const rec of batch) {
        const legacyId = rec.get("legacyId");
        const skills = rec.get("skills") || [];
        const industries = rec.get("industries") || [];
        const clientName = rec.get("clientName");
        const firmName = rec.get("firmName");

        const summary = synthesizeSummary(skills, industries, clientName, firmName);
        if (summary) {
          updates.push({ legacyId, summary });
        }
      }

      if (updates.length > 0) {
        const writeSession = driver.session();
        try {
          await writeSession.run(
            `UNWIND $updates AS u
             MATCH (cs:CaseStudy {legacyId: u.legacyId})
             SET cs.summary = u.summary, cs.summarySource = 'synthetic'`,
            { updates }
          );
          updated += updates.length;
        } finally {
          await writeSession.close();
        }
      }

      processed += batch.length;
      if (processed % 500 === 0 || processed === records.length) {
        console.log(`  Processed ${processed}/${records.length}, updated ${updated}`);
      }
    }
  } finally {
    await session.close();
  }

  console.log(`\nPhase 1 complete: ${updated} case studies now have synthetic summaries`);
  return updated;
}

function synthesizeSummary(skills, industries, clientName, firmName) {
  const parts = [];

  if (clientName) {
    parts.push(`Project for ${clientName}`);
  } else if (firmName) {
    parts.push(`Project by ${firmName}`);
  } else {
    parts.push("Project");
  }

  if (skills.length > 0) {
    parts.push(`demonstrating ${skills.slice(0, 4).join(", ")}`);
  }

  if (industries.length > 0) {
    parts.push(`in the ${industries.slice(0, 2).join(" and ")} ${industries.length === 1 ? "sector" : "sectors"}`);
  }

  // Don't create a summary if we only have "Project" with nothing else
  if (parts.length <= 1 && !clientName && !firmName) return null;

  return parts.join(" ") + ".";
}

// ─── Phase 2: Re-scrape URLs with Jina ───────────────────

async function phase2() {
  if (!doRescrape) return;

  const JINA_API_KEY = process.env.JINA_API_KEY;
  if (!JINA_API_KEY) {
    console.log("\n⚠ Skipping Phase 2: JINA_API_KEY not set");
    return;
  }

  console.log("\n=== Phase 2: Re-scrape case studies with URLs ===\n");

  const session = driver.session();
  let processed = 0;
  let updated = 0;

  try {
    const result = await session.run(`
      MATCH (cs:CaseStudy)
      WHERE (cs.summary IS NULL OR trim(cs.summary) = '' OR cs.summarySource = 'synthetic')
        AND cs.sourceUrl IS NOT NULL
        AND NOT cs.sourceUrl STARTS WITH 'manual:'
        AND NOT cs.sourceUrl STARTS WITH 'uploaded:'
      RETURN cs.legacyId AS legacyId, cs.sourceUrl AS sourceUrl
      LIMIT 500
    `);

    const records = result.records;
    console.log(`Found ${records.length} case studies with scrapable URLs`);

    for (const rec of records) {
      const legacyId = rec.get("legacyId");
      const sourceUrl = rec.get("sourceUrl");
      processed++;

      try {
        const response = await fetch(`https://r.jina.ai/${sourceUrl}`, {
          headers: {
            "Authorization": `Bearer ${JINA_API_KEY}`,
            "Accept": "text/plain",
            "X-Return-Format": "text",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          console.log(`  [${processed}] ✗ ${sourceUrl} — HTTP ${response.status}`);
          continue;
        }

        const text = await response.text();
        if (!text || text.length < 50) {
          console.log(`  [${processed}] ✗ ${sourceUrl} — too short (${text.length} chars)`);
          continue;
        }

        // Extract first meaningful paragraph as summary (skip headers, navs, etc.)
        const lines = text.split("\n").filter(l => l.trim().length > 40);
        const summary = lines.slice(0, 3).join(" ").slice(0, 500).trim();

        if (summary.length > 40) {
          const writeSession = driver.session();
          try {
            await writeSession.run(
              `MATCH (cs:CaseStudy {legacyId: $legacyId})
               SET cs.summary = $summary, cs.summarySource = 'scraped'`,
              { legacyId, summary }
            );
            updated++;
            console.log(`  [${processed}] ✓ ${sourceUrl} — ${summary.slice(0, 80)}...`);
          } finally {
            await writeSession.close();
          }
        } else {
          console.log(`  [${processed}] ✗ ${sourceUrl} — no usable content`);
        }
      } catch (err) {
        console.log(`  [${processed}] ✗ ${sourceUrl} — ${err.message}`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, RESCRAPE_DELAY_MS));

      if (processed % 50 === 0) {
        console.log(`\n  Progress: ${processed}/${records.length}, updated ${updated}\n`);
      }
    }
  } finally {
    await session.close();
  }

  console.log(`\nPhase 2 complete: ${updated} case studies got scraped summaries`);
}

// ─── Phase 3: Cleanup ghost case studies ──────────────────

async function phase3() {
  if (!doCleanup) return;

  console.log("\n=== Phase 3: Clean up ghost case studies ===\n");

  const session = driver.session();
  try {
    // Count ghosts first
    const countResult = await session.run(`
      MATCH (cs:CaseStudy)
      WHERE (cs.summary IS NULL OR trim(cs.summary) = '')
        AND NOT EXISTS { (cs)-[:DEMONSTRATES_SKILL]->() }
        AND NOT EXISTS { (cs)-[:IN_INDUSTRY]->() }
        AND NOT EXISTS { (cs)-[:FOR_CLIENT]->() }
        AND cs.title IS NULL
        AND (cs.sourceUrl IS NULL OR cs.sourceUrl STARTS WITH 'manual:')
      RETURN count(cs) AS ghostCount
    `);
    const ghostCount = countResult.records[0].get("ghostCount").toNumber();
    console.log(`Found ${ghostCount} ghost case studies (no data at all)`);

    if (ghostCount > 0) {
      // Delete in batches to avoid timeout
      let deleted = 0;
      while (deleted < ghostCount) {
        const writeSession = driver.session();
        try {
          const delResult = await writeSession.run(`
            MATCH (cs:CaseStudy)
            WHERE (cs.summary IS NULL OR trim(cs.summary) = '')
              AND NOT EXISTS { (cs)-[:DEMONSTRATES_SKILL]->() }
              AND NOT EXISTS { (cs)-[:IN_INDUSTRY]->() }
              AND NOT EXISTS { (cs)-[:FOR_CLIENT]->() }
              AND cs.title IS NULL
              AND (cs.sourceUrl IS NULL OR cs.sourceUrl STARTS WITH 'manual:')
            WITH cs LIMIT 200
            DETACH DELETE cs
            RETURN count(*) AS deletedCount
          `);
          const batchDeleted = delResult.records[0].get("deletedCount").toNumber();
          deleted += batchDeleted;
          console.log(`  Deleted ${deleted}/${ghostCount} ghosts`);
          if (batchDeleted === 0) break;
        } finally {
          await writeSession.close();
        }
      }
      console.log(`\nPhase 3 complete: removed ${deleted} ghost case studies`);
    }
  } finally {
    await session.close();
  }
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log("Case Study Summary Backfill");
  console.log("==========================");
  console.log(`Mode: Phase 1 (synthetic)${doRescrape ? " + Phase 2 (rescrape)" : ""}${doCleanup ? " + Phase 3 (cleanup)" : ""}`);

  try {
    await phase1();
    await phase2();
    await phase3();

    // Final stats
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (cs:CaseStudy)
        RETURN
          count(cs) AS total,
          count(CASE WHEN cs.summary IS NOT NULL AND trim(cs.summary) <> '' THEN 1 END) AS withSummary,
          count(CASE WHEN cs.summarySource = 'synthetic' THEN 1 END) AS synthetic,
          count(CASE WHEN cs.summarySource = 'scraped' THEN 1 END) AS scraped
      `);
      const rec = result.records[0];
      console.log("\n=== Final Stats ===");
      console.log(`Total case studies: ${rec.get("total").toNumber()}`);
      console.log(`With summary: ${rec.get("withSummary").toNumber()}`);
      console.log(`  Synthetic: ${rec.get("synthetic").toNumber()}`);
      console.log(`  Scraped: ${rec.get("scraped").toNumber()}`);
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  driver.close().then(() => process.exit(1));
});
