/**
 * Backfill Neo4j with case study summaries from PostgreSQL
 * and generate hidden expert summaries from job history.
 *
 * Case studies: summaries already exist in PG but were never written to Neo4j.
 * Experts: generate a hidden AI summary from PDL work history data.
 *
 * Usage: npx tsx scripts/backfill-neo4j-summaries.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/lib/db";
import { firmCaseStudies, expertProfiles, specialistProfiles } from "../src/lib/db/schema";
import { neo4jWrite, neo4jRead } from "../src/lib/neo4j";
import { eq, isNotNull, and } from "drizzle-orm";

// ─── Case Study Summary Backfill ─────────────────────────

async function backfillCaseStudySummaries() {
  console.log("\n=== Case Study Summary Backfill ===\n");

  // Get all case studies that have a summary in PG and a graphNodeId
  const rows = await db
    .select({
      id: firmCaseStudies.id,
      graphNodeId: firmCaseStudies.graphNodeId,
      summary: firmCaseStudies.summary,
      title: firmCaseStudies.title,
      sourceUrl: firmCaseStudies.sourceUrl,
    })
    .from(firmCaseStudies)
    .where(
      and(
        isNotNull(firmCaseStudies.graphNodeId),
        isNotNull(firmCaseStudies.summary)
      )
    );

  console.log(`Found ${rows.length} case studies with summaries in PG`);

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.graphNodeId || !row.summary) continue;

    try {
      await neo4jWrite(
        `MATCH (cs:CaseStudy {id: $id})
         SET cs.summary = $summary,
             cs.title = CASE WHEN cs.title IS NULL THEN $title ELSE cs.title END,
             cs.sourceUrl = CASE WHEN cs.sourceUrl IS NULL THEN $sourceUrl ELSE cs.sourceUrl END`,
        {
          id: row.graphNodeId,
          summary: row.summary,
          title: row.title ?? null,
          sourceUrl: row.sourceUrl ?? null,
        }
      );
      updated++;
    } catch (err) {
      console.error(`  Failed for ${row.graphNodeId}:`, err);
      errors++;
    }
  }

  console.log(`Updated: ${updated}, Errors: ${errors}`);

  // Also handle legacy case studies that might have summaries from the old import
  const legacyCount = await neo4jRead<{ count: number }>(
    `MATCH (cs:CaseStudy) WHERE cs.summary IS NOT NULL RETURN count(cs) AS count`
  );
  console.log(`Neo4j case studies with summaries after backfill: ${legacyCount[0]?.count ?? 0}`);

  // Count those still missing
  const missingCount = await neo4jRead<{ count: number }>(
    `MATCH (cs:CaseStudy) WHERE cs.summary IS NULL RETURN count(cs) AS count`
  );
  console.log(`Neo4j case studies still missing summaries: ${missingCount[0]?.count ?? 0}`);
}

// ─── Expert Hidden Summary Backfill ──────────────────────

async function backfillExpertSummaries() {
  console.log("\n=== Expert Hidden Summary Backfill ===\n");

  // Get enriched experts with PDL data (job history)
  const experts = await db
    .select({
      id: expertProfiles.id,
      fullName: expertProfiles.fullName,
      title: expertProfiles.title,
      headline: expertProfiles.headline,
      pdlData: expertProfiles.pdlData,
      topSkills: expertProfiles.topSkills,
      topIndustries: expertProfiles.topIndustries,
      personNodeId: expertProfiles.personNodeId,
    })
    .from(expertProfiles)
    .where(eq(expertProfiles.enrichmentStatus, "enriched"));

  console.log(`Found ${experts.length} enriched experts`);

  // Get specialist profiles grouped by expert
  const spRows = await db
    .select({
      expertProfileId: specialistProfiles.expertProfileId,
      title: specialistProfiles.title,
      skills: specialistProfiles.skills,
    })
    .from(specialistProfiles);

  const spByExpert = new Map<string, typeof spRows>();
  for (const sp of spRows) {
    const existing = spByExpert.get(sp.expertProfileId) ?? [];
    existing.push(sp);
    spByExpert.set(sp.expertProfileId, existing);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const expert of experts) {
    const nodeId = expert.personNodeId ?? expert.id;
    if (!nodeId) { skipped++; continue; }

    try {
      // Build summary from available data
      const parts: string[] = [];
      const name = expert.fullName ?? "This expert";

      // Current role
      if (expert.title) {
        parts.push(`${name} is a ${expert.title}.`);
      } else if (expert.headline) {
        parts.push(`${name}: ${expert.headline}.`);
      }

      // Specialist profiles
      const sps = spByExpert.get(expert.id) ?? [];
      if (sps.length > 0) {
        const titles = sps.map(s => s.title).filter(Boolean);
        if (titles.length > 0) {
          parts.push(`Specialist in ${titles.join(", ")}.`);
        }
      }

      // Work history from PDL
      const pdl = expert.pdlData;
      if (pdl?.experience?.length) {
        const recent = pdl.experience
          .filter(e => e.title && e.company?.name)
          .slice(0, 4);
        if (recent.length > 0) {
          const historyLines = recent.map(e => {
            const duration = e.isCurrent ? "current" : (e.endDate ?? "prior");
            return `${e.title} at ${e.company.name} (${duration})`;
          });
          parts.push(`Career: ${historyLines.join("; ")}.`);
        }

        // Industry coverage from work history
        const industries = [...new Set(
          pdl.experience
            .map(e => e.company?.industry)
            .filter(Boolean) as string[]
        )].slice(0, 4);
        if (industries.length > 0) {
          parts.push(`Industry experience: ${industries.join(", ")}.`);
        }
      }

      // Skills
      const skills = (expert.topSkills as string[]) ?? [];
      if (skills.length > 0) {
        parts.push(`Key skills: ${skills.slice(0, 6).join(", ")}.`);
      }

      if (parts.length === 0) {
        skipped++;
        continue;
      }

      const hiddenSummary = parts.join(" ");

      await neo4jWrite(
        `MATCH (p:Person {id: $id})
         SET p.hiddenSummary = $hiddenSummary`,
        { id: nodeId, hiddenSummary }
      );
      updated++;
    } catch (err) {
      console.error(`  Failed for ${expert.id}:`, err);
      errors++;
    }
  }

  console.log(`Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);

  // Verify
  const withSummary = await neo4jRead<{ count: number }>(
    `MATCH (p:Person) WHERE p.hiddenSummary IS NOT NULL RETURN count(p) AS count`
  );
  console.log(`Experts with hidden summaries in Neo4j: ${withSummary[0]?.count ?? 0}`);
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("Starting Neo4j summary backfill...\n");

  await backfillCaseStudySummaries();
  await backfillExpertSummaries();

  console.log("\n✓ Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
