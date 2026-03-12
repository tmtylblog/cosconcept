/**
 * GET /api/discover/[firmId] — Rich firm profile for the Discover view
 * Returns public profile data for a firm including services, case studies,
 * experts, and abstraction profile data.
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  serviceFirms,
  firmServices,
  firmCaseStudies,
  expertProfiles,
  abstractionProfiles,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// ─── Type definitions ─────────────────────────────────────

interface EnrichmentClassification {
  categories?: string[];
  skills?: string[];
  industries?: string[];
  markets?: string[];
  languages?: string[];
}

interface EnrichmentExtracted {
  clients?: { name: string }[];
}

interface EnrichmentCompanyData {
  location?: string;
  employeeCount?: number;
  size?: string;
  founded?: number;
  inferredRevenue?: string;
}

interface EnrichmentData {
  classification?: EnrichmentClassification;
  extracted?: EnrichmentExtracted;
  companyData?: EnrichmentCompanyData;
  logoUrl?: string;
}

// ─── GET handler ──────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firmId } = await params;

  try {
    // ── Fetch base firm ────────────────────────────────────
    const [firm] = await db
      .select()
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);

    if (!firm) {
      return Response.json({ error: "Firm not found" }, { status: 404 });
    }

    // ── Parallel data fetches ──────────────────────────────
    const [services, caseStudies, experts, abstractionRows] = await Promise.all([
      // Services — non-hidden only
      db
        .select({
          id: firmServices.id,
          name: firmServices.name,
          description: firmServices.description,
          subServices: firmServices.subServices,
        })
        .from(firmServices)
        .where(
          and(
            eq(firmServices.firmId, firmId),
            eq(firmServices.isHidden, false)
          )
        )
        .orderBy(firmServices.displayOrder),

      // Case studies — active, non-hidden, up to 8
      db
        .select({
          id: firmCaseStudies.id,
          title: firmCaseStudies.title,
          sourceUrl: firmCaseStudies.sourceUrl,
          thumbnailUrl: firmCaseStudies.thumbnailUrl,
          autoTags: firmCaseStudies.autoTags,
        })
        .from(firmCaseStudies)
        .where(
          and(
            eq(firmCaseStudies.firmId, firmId),
            eq(firmCaseStudies.status, "active"),
            eq(firmCaseStudies.isHidden, false),
            ne(firmCaseStudies.status, "deleted")
          )
        )
        .limit(8),

      // Experts — public only, up to 12
      db
        .select({
          id: expertProfiles.id,
          fullName: expertProfiles.fullName,
          title: expertProfiles.title,
          headline: expertProfiles.headline,
          photoUrl: expertProfiles.photoUrl,
          location: expertProfiles.location,
          topSkills: expertProfiles.topSkills,
        })
        .from(expertProfiles)
        .where(
          and(
            eq(expertProfiles.firmId, firmId),
            eq(expertProfiles.isPublic, true)
          )
        )
        .limit(12),

      // Abstraction profile for this firm
      db
        .select({
          hiddenNarrative: abstractionProfiles.hiddenNarrative,
          typicalClientProfile: abstractionProfiles.typicalClientProfile,
          partnershipReadiness: abstractionProfiles.partnershipReadiness,
        })
        .from(abstractionProfiles)
        .where(
          and(
            eq(abstractionProfiles.entityId, firmId),
            eq(abstractionProfiles.entityType, "firm")
          )
        )
        .limit(1),
    ]);

    // ── Extract from enrichmentData JSONB ──────────────────
    const enrichment = (firm.enrichmentData ?? {}) as EnrichmentData;
    const classification = enrichment.classification ?? {};
    const extracted = enrichment.extracted ?? {};
    const companyData = enrichment.companyData ?? {};

    const categories = classification.categories ?? [];
    const skills = classification.skills ?? [];
    const industries = classification.industries ?? [];
    const markets = classification.markets ?? [];
    const languages = classification.languages ?? [];
    const clients = (extracted.clients ?? []).map((c) => c.name).filter(Boolean);
    const logoUrl = enrichment.logoUrl ?? null;

    // ── Abstraction profile ────────────────────────────────
    const abstraction = abstractionRows[0] ?? null;

    // ── Shape the response ─────────────────────────────────
    return Response.json({
      id: firm.id,
      name: firm.name,
      website: firm.website ?? undefined,
      description: firm.description ?? undefined,
      location: companyData.location ?? undefined,
      foundedYear: companyData.founded ?? firm.foundedYear ?? undefined,
      sizeBand: firm.sizeBand ?? undefined,
      firmType: firm.firmType ?? undefined,
      employeeCount: companyData.employeeCount ?? undefined,
      logoUrl: logoUrl ?? undefined,
      isCosCustomer: firm.isCosCustomer ?? false,

      // Classification
      categories,
      skills,
      industries,
      markets,
      languages,
      clients,

      // Services
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? undefined,
        subServices: s.subServices ?? undefined,
      })),

      // Case studies
      caseStudies: caseStudies
        .filter((cs) => cs.title) // only show titled ones
        .map((cs) => ({
          id: cs.id,
          title: cs.title!,
          sourceUrl: cs.sourceUrl,
          thumbnailUrl: cs.thumbnailUrl ?? undefined,
          skills: cs.autoTags?.skills ?? [],
          industries: cs.autoTags?.industries ?? [],
          clientName: cs.autoTags?.clientName ?? undefined,
        })),

      // Team
      experts: experts.map((e) => ({
        id: e.id,
        fullName: e.fullName ?? "",
        title: e.title ?? undefined,
        headline: e.headline ?? undefined,
        photoUrl: e.photoUrl ?? undefined,
        location: e.location ?? undefined,
        topSkills: e.topSkills ?? undefined,
      })),

      // Abstraction profile
      narrative: abstraction?.hiddenNarrative ?? undefined,
      typicalClientProfile: abstraction?.typicalClientProfile ?? undefined,
      partnershipReadiness: abstraction?.partnershipReadiness ?? undefined,
    });
  } catch (err) {
    console.error("[/api/discover/[firmId]]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
