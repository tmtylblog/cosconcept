/**
 * Import legacy case studies from the JSON dump.
 *
 * Strategy: For each case study with a public link, find the matching firm
 * and queue full AI re-ingestion via Inngest. Skip studies without links.
 *
 * Usage:
 *   npx tsx scripts/import-legacy-case-studies.ts
 *   npx tsx scripts/import-legacy-case-studies.ts --dry-run
 */

import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const JSON_PATH = path.join(
  process.cwd(),
  "data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/case-studies.json"
);

function generateId(prefix = "cs"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Simple Levenshtein distance for fuzzy firm name matching */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

async function main() {
  console.log(`[LegacyImport] Starting${DRY_RUN ? " (DRY RUN)" : ""}...`);

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`[LegacyImport] File not found: ${JSON_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, "utf-8");
  const parsed = JSON.parse(raw);

  // Support both { data: { case_study: [...] } } and flat array shapes
  const caseStudies: unknown[] =
    parsed?.data?.case_study ??
    parsed?.case_study ??
    (Array.isArray(parsed) ? parsed : []);

  if (caseStudies.length === 0) {
    console.warn("[LegacyImport] No case studies found in JSON. Check file structure.");
    process.exit(0);
  }

  console.log(`[LegacyImport] Found ${caseStudies.length} case studies in dump`);

  // Load all firms for matching
  const allFirms = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      organizationId: serviceFirms.organizationId,
    })
    .from(serviceFirms);

  console.log(`[LegacyImport] Loaded ${allFirms.length} firms from DB`);

  const stats = {
    matched: 0,
    no_url: 0,
    firm_not_found: 0,
    duplicate: 0,
    queued: 0,
    errors: 0,
  };

  for (const cs of caseStudies as Record<string, unknown>[]) {
    try {
      // Extract public URLs
      const linkObjects = (cs.case_study_links as Array<{ link?: string }> | undefined) ?? [];
      const links = linkObjects.map((l) => l.link).filter((l): l is string => !!l?.trim());

      if (links.length === 0) {
        stats.no_url++;
        continue;
      }

      // Resolve company name
      const companyEntries = cs.case_study_companies as Array<{ company?: { name?: string } }> | undefined;
      const companyName = companyEntries?.[0]?.company?.name?.trim() ?? "";

      if (!companyName) {
        stats.firm_not_found++;
        continue;
      }

      const normalizedTarget = companyName.toLowerCase();

      // Exact match first, then fuzzy (Levenshtein ≤ 2)
      let matchedFirm = allFirms.find(
        (f) => (f.name ?? "").toLowerCase().trim() === normalizedTarget
      );

      if (!matchedFirm) {
        matchedFirm = allFirms.find((f) => {
          const fname = (f.name ?? "").toLowerCase().trim();
          return levenshtein(fname, normalizedTarget) <= 2;
        });
      }

      if (!matchedFirm) {
        console.log(`[LegacyImport] No firm match for: "${companyName}"`);
        stats.firm_not_found++;
        continue;
      }

      stats.matched++;

      for (const url of links) {
        // Idempotency — skip if URL already exists
        const existing = await db
          .select({ id: firmCaseStudies.id })
          .from(firmCaseStudies)
          .where(eq(firmCaseStudies.sourceUrl, url))
          .limit(1);

        if (existing.length > 0) {
          stats.duplicate++;
          continue;
        }

        if (DRY_RUN) {
          console.log(
            `[DRY RUN] Would queue: ${url} → firm: ${matchedFirm.name} (${matchedFirm.id})`
          );
          stats.queued++;
          continue;
        }

        // Create pending DB row
        const caseStudyId = generateId("cs_leg");

        await db.insert(firmCaseStudies).values({
          id: caseStudyId,
          firmId: matchedFirm.id,
          organizationId: matchedFirm.organizationId,
          sourceUrl: url,
          sourceType: "url",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Fire Inngest event to trigger the full pipeline
        await inngest.send({
          name: "enrich/firm-case-study-ingest",
          data: {
            caseStudyId,
            firmId: matchedFirm.id,
            organizationId: matchedFirm.organizationId,
            sourceUrl: url,
            sourceType: "url",
          },
        });

        stats.queued++;
        console.log(`[LegacyImport] Queued: ${url} → ${matchedFirm.name}`);
      }
    } catch (err) {
      console.error("[LegacyImport] Error processing entry:", err);
      stats.errors++;
    }
  }

  console.log("\n[LegacyImport] Summary:");
  console.table(stats);
}

main().catch(console.error).finally(() => process.exit(0));
