/**
 * Handler: team-ingest
 *
 * Pulls current employees for a firm from PDL Person Search and upserts
 * them into expert_profiles. Classifies each person as a billable expert
 * (outward-facing) or an internal role based on PDL's job_title_role field.
 *
 * Cost: 1 PDL credit per person returned.
 * Free tier limit: 5 people (teaser).
 * Paid tier limit: up to 500 people (full roster).
 */

import { eq, and, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { searchPeopleAtCompany } from "@/lib/enrichment/pdl";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";

// ── Role classification ──────────────────────────────────────────────────────
// PDL's job_title_role field gives a structured role category.
// We use it to split experts into billable (client-facing) vs internal.

/** Roles that produce client-deliverable work — shown on public profile */
const BILLABLE_ROLES = new Set([
  "engineering",
  "design",
  "data_science",
  "marketing",
  "creative",
  "product_management",
  "research",
  "media",
  "consulting",
  "education",
  "information_technology",
]);

/** Roles that are internal ops — excluded from public expert roster */
const INTERNAL_ROLES = new Set([
  "finance",
  "human_resources",
  "legal",
  "operations",
  "administrative",
  "sales",
  "business_development",
  "customer_success",
  "support",
]);

function classifyRole(role: string | null): "billable" | "internal" | "unknown" {
  if (!role) return "unknown";
  if (BILLABLE_ROLES.has(role)) return "billable";
  if (INTERNAL_ROLES.has(role)) return "internal";
  return "unknown"; // management, communications, etc. — needs AI review
}

function calcCompleteness(person: {
  fullName: string;
  jobTitle: string;
  linkedinUrl: string | null;
  location: string | null;
  headline: string | null;
  skills: string[];
  photoUrl: string | null;
}): number {
  const fields = [
    person.fullName,
    person.jobTitle,
    person.linkedinUrl,
    person.location,
    person.headline,
    person.skills.length > 0 ? "yes" : null,
    person.photoUrl,
  ];
  const filled = fields.filter(Boolean).length;
  return filled / fields.length;
}

// ── Payload ──────────────────────────────────────────────────────────────────

interface Payload {
  firmId: string;
  /** Bare domain, e.g. "agency.com" — no protocol */
  domain: string;
  /** Max people to pull. Free=5, Paid=up to 500. */
  limit: number;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleTeamIngest(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { firmId, domain, limit } = payload as unknown as Payload;

  if (!firmId || !domain) {
    throw new Error("[TeamIngest] Missing firmId or domain in payload");
  }

  // Skip if ingested within the last 30 days (avoid burning credits on re-runs)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentProfiles = await db
    .select({ id: expertProfiles.id })
    .from(expertProfiles)
    .where(
      and(
        eq(expertProfiles.firmId, firmId),
        gte(expertProfiles.pdlEnrichedAt, thirtyDaysAgo)
      )
    )
    .limit(1);

  if (recentProfiles.length > 0) {
    console.log(`[TeamIngest] ${firmId} already ingested within 30 days — skipping.`);
    return { skipped: true, reason: "recently_ingested" };
  }

  console.log(`[TeamIngest] Fetching up to ${limit} employees at ${domain}...`);

  // PDL caps at 100 per request — paginate if limit > 100
  const MAX_PER_PAGE = 100;
  const effectiveLimit = Math.min(limit < 0 ? 500 : limit, 500);

  let allPeople: Awaited<ReturnType<typeof searchPeopleAtCompany>>["people"] = [];
  let total = 0;
  let from = 0;

  while (allPeople.length < effectiveLimit) {
    const batchSize = Math.min(MAX_PER_PAGE, effectiveLimit - allPeople.length);
    const result = await searchPeopleAtCompany({ domain, limit: batchSize, from });

    total = result.total;
    if (result.people.length === 0) break;
    allPeople = allPeople.concat(result.people);
    from += result.people.length;

    if (result.people.length < batchSize) break; // no more results
    if (allPeople.length >= effectiveLimit) break;
  }

  console.log(`[TeamIngest] PDL returned ${allPeople.length} of ${total} total at ${domain}`);

  // Upsert each person into expert_profiles
  let upserted = 0;
  let skippedCount = 0;

  for (const person of allPeople) {
    if (!person.id || !person.fullName) {
      skippedCount++;
      continue;
    }

    const classified = classifyRole(person.jobTitleRole);
    const completeness = calcCompleteness(person);
    const expertId = `exp_pdl_${person.id}`;

    // Store PDL role metadata in the jsonb column alongside standard fields
    const pdlPayload = {
      id: person.id,
      skills: person.skills,
      titleRole: person.jobTitleRole,
      titleSubRole: person.jobTitleSubRole,
      titleLevels: person.jobTitleLevels,
      classifiedAs: classified,
    };

    try {
      await db
        .insert(expertProfiles)
        .values({
          id: expertId,
          firmId,
          firstName: person.firstName || null,
          lastName: person.lastName || null,
          fullName: person.fullName || null,
          title: person.jobTitle || null,
          headline: person.headline || null,
          linkedinUrl: person.linkedinUrl || null,
          location: person.location || null,
          photoUrl: person.photoUrl || null,
          pdlId: person.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pdlData: pdlPayload as any,
          pdlEnrichedAt: new Date(),
          topSkills: person.skills.slice(0, 10),
          // Only billable experts are public by default; unknown/internal hidden
          isPublic: classified === "billable",
          profileCompleteness: completeness,
        })
        .onConflictDoUpdate({
          target: expertProfiles.id,
          set: {
            title: person.jobTitle || null,
            headline: person.headline || null,
            linkedinUrl: person.linkedinUrl || null,
            photoUrl: person.photoUrl || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pdlData: pdlPayload as any,
            pdlEnrichedAt: new Date(),
            topSkills: person.skills.slice(0, 10),
            isPublic: classified === "billable",
            profileCompleteness: completeness,
            updatedAt: new Date(),
          },
        });
      upserted++;
    } catch (err) {
      console.error(`[TeamIngest] Failed to upsert ${person.fullName}: ${err}`);
      skippedCount++;
    }
  }

  const summary = {
    domain,
    pdlTotal: total,
    fetched: allPeople.length,
    upserted,
    skipped: skippedCount,
    billable: allPeople.filter((p) => classifyRole(p.jobTitleRole) === "billable").length,
    internal: allPeople.filter((p) => classifyRole(p.jobTitleRole) === "internal").length,
    unknown: allPeople.filter((p) => classifyRole(p.jobTitleRole) === "unknown").length,
  };

  await logEnrichmentStep({
    firmId,
    phase: "team-ingest",
    source: "api.peopledatalabs.com",
    rawInput: `domain=${domain}, limit=${limit}`,
    extractedData: summary,
    status: "success",
  });

  console.log(`[TeamIngest] Done: ${upserted} upserted, ${summary.billable} billable, ${summary.internal} internal, ${summary.unknown} unknown`);

  return summary;
}
