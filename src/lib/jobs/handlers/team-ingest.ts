/**
 * Handler: team-ingest
 *
 * Pulls current employees for a firm from PDL Person Search and upserts
 * them into expert_profiles. Classifies each person into one of three tiers:
 *
 *   - expert: Client-facing roles (marketing, engineering, consulting, etc.)
 *   - potential_expert: Ambiguous roles (management, communications, etc.)
 *   - not_expert: Internal ops roles (HR, finance, legal, etc.)
 *
 * After classification, optionally queues enrichment jobs for high-confidence
 * experts (via the expert-linkedin handler).
 *
 * Cost: 1 PDL credit per person returned (search).
 *       1 PDL credit per person enriched (selective, only experts).
 */

import { eq, and, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { searchPeopleAtCompany } from "@/lib/enrichment/pdl";
import { classifyTitle } from "@/lib/enrichment/expert-classifier";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { enqueue } from "@/lib/jobs/queue";

// ── Three-tier expert classification ─────────────────────────────────────────

export type ExpertTier = "expert" | "potential_expert" | "not_expert";

/** Roles that produce client-deliverable work — high confidence experts */
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

/** Roles that are internal ops — high confidence NOT experts */
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

/**
 * Three-tier classification using PDL's structured role field as primary signal
 * and keyword-based title classification as secondary signal for unknowns.
 */
function classifyTeamMember(
  jobTitleRole: string | null,
  jobTitle: string
): ExpertTier {
  // Primary signal: PDL's structured job_title_role
  if (jobTitleRole && BILLABLE_ROLES.has(jobTitleRole)) return "expert";
  if (jobTitleRole && INTERNAL_ROLES.has(jobTitleRole)) return "not_expert";

  // Secondary signal: keyword-based title classification (for unknowns)
  if (jobTitle) {
    const titleClass = classifyTitle(jobTitle);
    if (titleClass === "expert") return "expert";
    if (titleClass === "internal") return "not_expert";
  }

  return "potential_expert";
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
  /** Max people to pull. -1 or 500 = full roster. */
  limit: number;
  /**
   * How many "expert" tier people to auto-enrich after search.
   * -1 = all experts (pro), 5 = first 5 (free), 0 = none (default).
   */
  autoEnrichLimit?: number;
  /** Company name for PDL person enrich matching */
  companyName?: string;
  /** Force re-import even if recently ingested */
  force?: boolean;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleTeamIngest(
  payload: Record<string, unknown>
): Promise<unknown> {
  const {
    firmId,
    domain,
    limit,
    autoEnrichLimit = 0,
    companyName,
    force = false,
  } = payload as unknown as Payload;

  if (!firmId || !domain) {
    throw new Error("[TeamIngest] Missing firmId or domain in payload");
  }

  // Skip if ingested within the last 30 days (avoid burning credits on re-runs)
  if (!force) {
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
  }

  console.log(`[TeamIngest] Fetching up to ${limit} employees at ${domain}...`);

  // PDL caps at 100 per request — paginate if limit > 100
  const MAX_PER_PAGE = 100;
  const effectiveLimit = Math.min(limit < 0 ? 500 : limit, 500);

  let allPeople: Awaited<ReturnType<typeof searchPeopleAtCompany>>["people"] = [];
  let total = 0;
  let scrollToken: string | null = null;

  while (allPeople.length < effectiveLimit) {
    const batchSize = Math.min(MAX_PER_PAGE, effectiveLimit - allPeople.length);
    const result = await searchPeopleAtCompany({
      domain,
      limit: batchSize,
      scrollToken: scrollToken ?? undefined,
    });

    total = result.total;
    if (result.people.length === 0) break;
    allPeople = allPeople.concat(result.people);
    scrollToken = result.scrollToken;

    if (result.people.length < batchSize) break; // no more results
    if (!scrollToken) break; // no more pages available
    if (allPeople.length >= effectiveLimit) break;
  }

  console.log(`[TeamIngest] PDL returned ${allPeople.length} of ${total} total at ${domain}`);

  // Classify and upsert each person into expert_profiles
  let upserted = 0;
  let skippedCount = 0;
  const tierCounts = { expert: 0, potential_expert: 0, not_expert: 0 };
  const expertIdsForEnrich: { expertId: string; fullName: string; linkedinUrl: string }[] = [];

  for (const person of allPeople) {
    if (!person.id || !person.fullName) {
      skippedCount++;
      continue;
    }

    const tier = classifyTeamMember(person.jobTitleRole, person.jobTitle);
    tierCounts[tier]++;

    const completeness = calcCompleteness(person);
    const expertId = `exp_pdl_${person.id}`;

    // Store PDL role metadata in the jsonb column alongside standard fields
    const pdlPayload = {
      id: person.id,
      skills: person.skills,
      titleRole: person.jobTitleRole,
      titleSubRole: person.jobTitleSubRole,
      titleLevels: person.jobTitleLevels,
      classifiedAs: tier,
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
          // Only expert tier is public by default
          isPublic: tier === "expert",
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
            isPublic: tier === "expert",
            profileCompleteness: completeness,
            updatedAt: new Date(),
          },
        });
      upserted++;

      // Track expert-tier people with LinkedIn for auto-enrichment
      if (tier === "expert" && person.linkedinUrl) {
        expertIdsForEnrich.push({
          expertId,
          fullName: person.fullName,
          linkedinUrl: person.linkedinUrl,
        });
      }
    } catch (err) {
      console.error(`[TeamIngest] Failed to upsert ${person.fullName}: ${err}`);
      skippedCount++;
    }
  }

  // ── Auto-enrich expert-tier people ──────────────────────────────────────
  let autoEnrichQueued = 0;
  if (autoEnrichLimit !== 0 && expertIdsForEnrich.length > 0) {
    const toEnrich = autoEnrichLimit === -1
      ? expertIdsForEnrich
      : expertIdsForEnrich.slice(0, autoEnrichLimit);

    console.log(`[TeamIngest] Queuing ${toEnrich.length} expert enrichment jobs (limit: ${autoEnrichLimit})...`);

    for (let i = 0; i < toEnrich.length; i++) {
      const { expertId, fullName, linkedinUrl } = toEnrich[i];
      try {
        await enqueue(
          "expert-linkedin",
          {
            expertId,
            firmId,
            fullName,
            linkedinUrl,
            companyName: companyName || undefined,
            companyWebsite: domain,
          },
          { delayMs: i * 3000 } // stagger 3s apart to avoid PDL rate limiting
        );
        autoEnrichQueued++;
      } catch (err) {
        console.error(`[TeamIngest] Failed to queue enrich for ${fullName}: ${err}`);
      }
    }
  }

  const summary = {
    domain,
    pdlTotal: total,
    fetched: allPeople.length,
    upserted,
    skipped: skippedCount,
    experts: tierCounts.expert,
    potentialExperts: tierCounts.potential_expert,
    notExperts: tierCounts.not_expert,
    autoEnrichQueued,
  };

  await logEnrichmentStep({
    firmId,
    phase: "team-ingest",
    source: "api.peopledatalabs.com",
    rawInput: `domain=${domain}, limit=${limit}, autoEnrichLimit=${autoEnrichLimit}`,
    extractedData: summary,
    status: "success",
  });

  console.log(
    `[TeamIngest] Done: ${upserted} upserted — ${tierCounts.expert} experts, ` +
    `${tierCounts.potential_expert} potential, ${tierCounts.not_expert} not expert — ` +
    `${autoEnrichQueued} enrichment jobs queued`
  );

  return summary;
}
