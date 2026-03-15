/**
 * Import Legacy Work History into expert_profiles
 *
 * Joins legacy JSON files (user-basic, user-details, user-work-history)
 * with the legacyUsers table to create/update expert_profiles with:
 * - Name, email, title, location, LinkedIn URL
 * - Work history as pdlData.experience[]
 * - Skills from user-details
 * - enrichmentStatus based on data quality
 *
 * Usage:
 *   npx tsx scripts/import-legacy-work-history.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { expertProfiles, legacyUsers } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { normalizeLinkedInUrl } from "@/lib/utils";

// ── Load legacy JSON files ──────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data/legacy/Data Dump (JSON)");

interface LegacyWorkEntry {
  id: string;
  order: number;
  title: string;
  description: string | null;
  company: { id: string; name: string } | null;
  startAt: string | null;
  endAt: string | null;
  isCurrentPosition: boolean;
}

interface LegacyUserBasic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  organisation: {
    id: string;
    organisation_detail: { business_name: string };
  } | null;
}

interface LegacyUserDetails {
  id: string;
  user_basic_information: {
    city: string | null;
    country: string | null;
    stateOrProvince: string | null;
  } | null;
  user_professional_information: {
    linkedInUrl: string | null;
  } | null;
  user_skills: Array<{ skill: { name: string } }>;
  user_industry_experiences: Array<{ industry: { name: string } }>;
}

interface LegacyWorkHistory {
  id: string;
  work_history: LegacyWorkEntry[];
}

function loadJson<T>(subpath: string): T {
  const fullPath = path.join(DATA_DIR, subpath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

// ── Transform helpers ───────────────────────────────────────────

function buildLocation(info: LegacyUserDetails["user_basic_information"]): string | null {
  if (!info) return null;
  const parts = [info.city, info.stateOrProvince, info.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildExperience(entries: LegacyWorkEntry[]): Array<{
  company: { name: string; website: string | null; industry: string | null };
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  summary: string | null;
}> {
  return entries
    .filter((e) => e.title && e.company?.name)
    .map((e) => ({
      company: {
        name: e.company!.name,
        website: null,
        industry: null,
      },
      title: e.title,
      startDate: e.startAt || null,
      endDate: e.endAt || null,
      isCurrent: e.isCurrentPosition ?? false,
      summary: e.description || null,
    }));
}

function calcCompleteness(opts: {
  fullName: boolean;
  title: boolean;
  linkedinUrl: boolean;
  location: boolean;
  skills: boolean;
  workHistory: boolean;
  photo: boolean;
}): number {
  const fields = [opts.fullName, opts.title, opts.linkedinUrl, opts.location, opts.skills, opts.workHistory, opts.photo];
  return fields.filter(Boolean).length / fields.length;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN ===" : "=== LIVE IMPORT ===");

  // Load legacy data
  console.log("Loading legacy JSON files...");
  const basicData = loadJson<{ data: { user_meta: LegacyUserBasic[] } }>(
    "Step 3_ Organization Content Data/user-basic.json"
  );
  const detailsData = loadJson<{ data: { user_meta: LegacyUserDetails[] } }>(
    "Step 4_ User Profile Data/user-details.json"
  );
  const workData = loadJson<{ data: { user_meta: LegacyWorkHistory[] } }>(
    "Step 4_ User Profile Data/user-work-history.json"
  );

  // Index by user ID
  const basicById = new Map(basicData.data.user_meta.map((u) => [u.id, u]));
  const detailsById = new Map(detailsData.data.user_meta.map((u) => [u.id, u]));
  const workById = new Map(workData.data.user_meta.map((u) => [u.id, u]));

  console.log(`Loaded: ${basicById.size} basic, ${detailsById.size} details, ${workById.size} work history`);

  // Load legacy user → firm mapping from DB
  console.log("Loading legacy user→firm mapping from DB...");
  const legacyMappings = await db
    .select({
      legacyUserId: legacyUsers.legacyUserId,
      firmId: legacyUsers.firmId,
    })
    .from(legacyUsers)
    .where(isNotNull(legacyUsers.firmId));

  const firmByLegacyUser = new Map(
    legacyMappings.map((m) => [m.legacyUserId, m.firmId!])
  );
  console.log(`Found ${firmByLegacyUser.size} legacy users with firm mappings`);

  // Load existing expert profiles to avoid duplicates
  const existingExperts = await db
    .select({ id: expertProfiles.id, firmId: expertProfiles.firmId })
    .from(expertProfiles);
  const existingIds = new Set(existingExperts.map((e) => e.id));
  console.log(`Existing expert profiles: ${existingIds.size}`);

  // Process each user with work history
  let created = 0;
  let updated = 0;
  let skippedNoFirm = 0;
  let skippedNoName = 0;
  let totalWorkEntries = 0;
  let withLinkedIn = 0;
  let withSkills = 0;

  const allUserIds = new Set([
    ...basicById.keys(),
    ...workById.keys(),
  ]);

  console.log(`Processing ${allUserIds.size} unique users...`);

  for (const userId of allUserIds) {
    const basic = basicById.get(userId);
    if (!basic) continue;

    // Must have firm mapping
    const firmId = firmByLegacyUser.get(userId);
    if (!firmId) {
      skippedNoFirm++;
      continue;
    }

    const fullName = `${basic.firstName || ""} ${basic.lastName || ""}`.trim();
    if (!fullName) {
      skippedNoName++;
      continue;
    }

    const details = detailsById.get(userId);
    const work = workById.get(userId);

    const linkedinUrl = normalizeLinkedInUrl(
      details?.user_professional_information?.linkedInUrl ?? null
    );
    const location = buildLocation(details?.user_basic_information ?? null);
    const skills = (details?.user_skills ?? []).map((s) => s.skill?.name).filter(Boolean);
    const experience = work?.work_history ? buildExperience(work.work_history) : [];

    totalWorkEntries += experience.length;
    if (linkedinUrl) withLinkedIn++;
    if (skills.length > 0) withSkills++;

    // Build pdlData with experience + skills
    const pdlData: Record<string, unknown> = {
      source: "legacy_import",
      experience,
      skills,
    };

    // Determine enrichment status
    let enrichmentStatus: string;
    if (experience.length > 0) {
      enrichmentStatus = "enriched"; // Has work history = consider enriched
    } else if (linkedinUrl) {
      enrichmentStatus = "needs_linkedin"; // Has LinkedIn but no work history — can be PDL-enriched later
    } else {
      enrichmentStatus = "roster"; // Basic data only
    }

    const completeness = calcCompleteness({
      fullName: true,
      title: !!basic.title,
      linkedinUrl: !!linkedinUrl,
      location: !!location,
      skills: skills.length > 0,
      workHistory: experience.length > 0,
      photo: false,
    });

    const expertId = `exp_leg_${userId.replace(/-/g, "").slice(0, 20)}`;

    if (dryRun) {
      if (created + updated < 5) {
        console.log(`  [${existingIds.has(expertId) ? "UPDATE" : "CREATE"}] ${fullName} @ ${firmId} | ${experience.length} jobs | LinkedIn: ${linkedinUrl ? "yes" : "no"} | Skills: ${skills.length}`);
      }
      if (existingIds.has(expertId)) updated++;
      else created++;
      continue;
    }

    try {
      await db
        .insert(expertProfiles)
        .values({
          id: expertId,
          firmId,
          firstName: basic.firstName || null,
          lastName: basic.lastName || null,
          fullName,
          title: basic.title || (experience.length > 0 ? experience[0].title : null),
          email: basic.email || null,
          linkedinUrl,
          location,
          topSkills: skills.slice(0, 10),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pdlData: pdlData as any,
          enrichmentStatus,
          isPublic: experience.length > 0,
          profileCompleteness: completeness,
        })
        .onConflictDoUpdate({
          target: expertProfiles.id,
          set: {
            // Only update fields if they add data (don't overwrite PDL-enriched data)
            title: basic.title || undefined,
            email: basic.email || undefined,
            linkedinUrl: linkedinUrl || undefined,
            location: location || undefined,
            topSkills: skills.length > 0 ? skills.slice(0, 10) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pdlData: pdlData as any,
            enrichmentStatus,
            profileCompleteness: completeness,
            updatedAt: new Date(),
          },
        });

      if (existingIds.has(expertId)) updated++;
      else created++;
    } catch (err) {
      console.error(`  Failed: ${fullName} (${expertId}):`, (err as Error).message?.slice(0, 100));
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no firm): ${skippedNoFirm}`);
  console.log(`Skipped (no name): ${skippedNoName}`);
  console.log(`Total work entries imported: ${totalWorkEntries}`);
  console.log(`With LinkedIn URL: ${withLinkedIn}`);
  console.log(`With skills: ${withSkills}`);

  if (dryRun) {
    console.log("\n(Dry run — no changes written to DB)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
