/**
 * Handler: firm-abstraction
 *
 * Generates a normalized abstraction profile for a firm by:
 * 1. Loading all available evidence from Postgres (services, case studies, experts, classification)
 * 2. Running AI to create a structured hiddenNarrative + taxonomy
 * 3. Generating an OpenAI embedding of the hiddenNarrative
 * 4. Storing everything in abstraction_profiles
 *
 * Triggered automatically after deep-crawl completes.
 * Can also be triggered manually via the backfill admin endpoint.
 */

import { db } from "@/lib/db";
import {
  serviceFirms,
  firmServices,
  firmCaseStudies,
  expertProfiles,
  enrichmentAuditLog,
  abstractionProfiles,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { generateFirmAbstraction } from "@/lib/matching/abstraction-generator";
import { generateFirmEmbedding } from "@/lib/matching/vector-search";

interface Payload {
  firmId: string;
  organizationId: string;
}

export async function handleFirmAbstraction(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { firmId, organizationId } = payload as unknown as Payload;

  // ── 1. Load firm base data ─────────────────────────────
  const firm = await db.query.serviceFirms.findFirst({
    where: eq(serviceFirms.id, firmId),
  });
  if (!firm) return { skipped: true, reason: "Firm not found" };

  // ── 2. Load services ───────────────────────────────────
  const services = await db
    .select({ name: firmServices.name })
    .from(firmServices)
    .where(eq(firmServices.firmId, firmId));

  // ── 3. Load active case studies ────────────────────────
  const caseStudies = await db
    .select({
      title: firmCaseStudies.title,
      autoTags: firmCaseStudies.autoTags,
      summary: firmCaseStudies.summary,
      cosAnalysis: firmCaseStudies.cosAnalysis,
    })
    .from(firmCaseStudies)
    .where(
      and(
        eq(firmCaseStudies.firmId, firmId),
        eq(firmCaseStudies.status, "active")
      )
    );

  // ── 4. Load expert profiles ────────────────────────────
  const experts = await db
    .select({
      fullName: expertProfiles.fullName,
      headline: expertProfiles.headline,
      topSkills: expertProfiles.topSkills,
    })
    .from(expertProfiles)
    .where(eq(expertProfiles.firmId, firmId))
    .limit(20);

  // ── 5. Load latest classifier result from audit log ───
  const classifierLog = await db.query.enrichmentAuditLog.findFirst({
    where: and(
      eq(enrichmentAuditLog.firmId, firmId),
      eq(enrichmentAuditLog.phase, "classifier")
    ),
    orderBy: desc(enrichmentAuditLog.createdAt),
  });

  const classifierData =
    (classifierLog?.extractedData as Record<string, unknown> | null) ?? {};

  // ── 6. Parse enrichmentData from firm record ──────────
  const enrichmentData =
    (firm.enrichmentData as Record<string, unknown> | null) ?? {};

  // Skills/industries may come from enrichmentData (written by graph-writer)
  // or can be partially reconstructed from case study autoTags
  const csSkills = [
    ...new Set(
      caseStudies.flatMap(
        (cs) => (cs.autoTags as { skills?: string[] } | null)?.skills ?? []
      )
    ),
  ];
  const csIndustries = [
    ...new Set(
      caseStudies.flatMap(
        (cs) => (cs.autoTags as { industries?: string[] } | null)?.industries ?? []
      )
    ),
  ];

  // ── 7. Build evidence object ───────────────────────────
  const evidence = {
    firmId,
    name: firm.name,
    website: firm.website ?? undefined,
    services: services.map((s) => s.name),
    aboutPitch:
      (enrichmentData.aboutPitch as string) ?? firm.description ?? "",
    categories:
      (classifierData.categories as string[]) ??
      (enrichmentData.categories as string[]) ??
      [],
    skills:
      (enrichmentData.skills as string[]) ??
      csSkills,
    industries:
      (enrichmentData.industries as string[]) ??
      csIndustries,
    markets: (enrichmentData.markets as string[]) ?? [],
    caseStudies: caseStudies.map((cs) => {
      const tags = cs.autoTags as { skills?: string[]; industries?: string[]; clientName?: string | null; services?: string[] } | null;
      const analysis = cs.cosAnalysis as { summary?: string; outcomes?: string[]; services?: string[] } | null;
      return {
        title: cs.title ?? "Untitled case study",
        clientName: tags?.clientName ?? undefined,
        skills: tags?.skills ?? [],
        industries: tags?.industries ?? [],
        outcomes: analysis?.outcomes ?? [],
        summary: analysis?.summary ?? cs.summary ?? undefined,
        servicesUsed: analysis?.services ?? tags?.services ?? [],
      };
    }),
    experts: experts.map((e) => ({
      name: e.fullName ?? "Unknown",
      headline: e.headline ?? undefined,
      skills: (e.topSkills as string[]) ?? [],
    })),
    pdl: enrichmentData.pdl
      ? {
          industry: (enrichmentData.pdl as Record<string, unknown>).industry as string ?? "",
          size: (enrichmentData.pdl as Record<string, unknown>).size as string ?? "",
          employeeCount:
            ((enrichmentData.pdl as Record<string, unknown>).employeeCount as number) ?? 0,
          summary:
            ((enrichmentData.pdl as Record<string, unknown>).summary as string) ?? "",
        }
      : undefined,
  };

  // ── 8. Generate abstraction profile ───────────────────
  const profile = await generateFirmAbstraction(evidence);

  // ── 9. Generate and store embedding ───────────────────
  let embeddingStored = false;
  const embeddingInput = [
    profile.hiddenNarrative,
    profile.topServices.join(", "),
    profile.topSkills.join(", "),
    profile.topIndustries.join(", "),
    profile.typicalClientProfile,
  ]
    .filter(Boolean)
    .join("\n\n");

  const embedding = await generateFirmEmbedding(embeddingInput);

  if (embedding.length > 0) {
    await db
      .update(abstractionProfiles)
      .set({ embedding })
      .where(eq(abstractionProfiles.id, `abs_${firmId}`));
    embeddingStored = true;
  }

  return {
    firmId,
    firmName: firm.name,
    evidenceQuality: {
      services: services.length,
      caseStudies: caseStudies.length,
      experts: experts.length,
      hasClassification: Object.keys(classifierData).length > 0,
    },
    confidence: profile.confidenceScores.overall,
    embeddingStored,
  };
}
