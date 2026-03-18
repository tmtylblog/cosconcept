/**
 * GET /api/admin/growth-ops/crm/companies/:id
 *
 * Returns a single company by synthetic CRM ID (e.g. sf_xxx, acq_xxx, ic_xxx).
 * Resolves the source table and fetches full detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  serviceFirms,
  acqCompanies,
  importedCompanies,
  companyResearch,
  expertProfiles,
  acqContacts,
  acqDeals,
  growthOpsConversations,
  firmServices,
  firmCaseStudies,
  abstractionProfiles,
  partnerPreferences,
} from "@/lib/db/schema";
import { eq, ilike, or, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").trim() || null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  // Parse synthetic ID: "sf_xxx" | "acq_xxx" | "ic_xxx" | "icl_xxx"
  const underscoreIdx = id.indexOf("_");
  if (underscoreIdx === -1) {
    return NextResponse.json({ error: "Invalid company ID format" }, { status: 400 });
  }
  const prefix = id.substring(0, underscoreIdx);
  const sourceId = id.substring(underscoreIdx + 1);

  try {
    let company: Record<string, unknown> | null = null;

    if (prefix === "sf") {
      const [row] = await db
        .select()
        .from(serviceFirms)
        .where(eq(serviceFirms.id, sourceId))
        .limit(1);

      if (row) {
        const domain = normalizeDomain(row.website);

        // Extract rich data from enrichmentData JSONB
        const ed = row.enrichmentData as Record<string, unknown> | null;
        const companyData = (ed?.companyData ?? {}) as Record<string, unknown>;
        const classification = (ed?.classification ?? {}) as Record<string, unknown>;
        const extracted = (ed?.extracted ?? {}) as Record<string, unknown>;

        // Fetch related data in parallel
        const [research, services, caseStudies, abstraction, preferences] = await Promise.all([
          domain
            ? db.select().from(companyResearch).where(eq(companyResearch.domain, domain)).limit(1).then(r => r[0] || null)
            : Promise.resolve(null),
          db.select({ id: firmServices.id, name: firmServices.name, description: firmServices.description, sourceUrl: firmServices.sourceUrl, subServices: firmServices.subServices })
            .from(firmServices).where(eq(firmServices.firmId, row.id)).orderBy(firmServices.displayOrder),
          db.select({ id: firmCaseStudies.id, title: firmCaseStudies.title, summary: firmCaseStudies.summary, sourceUrl: firmCaseStudies.sourceUrl, status: firmCaseStudies.status, autoTags: firmCaseStudies.autoTags })
            .from(firmCaseStudies).where(and(eq(firmCaseStudies.firmId, row.id), eq(firmCaseStudies.status, "active"))),
          db.select({ hiddenNarrative: abstractionProfiles.hiddenNarrative, topServices: abstractionProfiles.topServices, topSkills: abstractionProfiles.topSkills, topIndustries: abstractionProfiles.topIndustries, confidenceScores: abstractionProfiles.confidenceScores, evidenceSources: abstractionProfiles.evidenceSources })
            .from(abstractionProfiles).where(and(eq(abstractionProfiles.entityId, row.id), eq(abstractionProfiles.entityType, "firm"))).limit(1).then(r => r[0] || null),
          db.select({ preferredFirmTypes: partnerPreferences.preferredFirmTypes, preferredIndustries: partnerPreferences.preferredIndustries, preferredMarkets: partnerPreferences.preferredMarkets, partnershipModels: partnerPreferences.partnershipModels, dealBreakers: partnerPreferences.dealBreakers, growthGoals: partnerPreferences.growthGoals })
            .from(partnerPreferences).where(eq(partnerPreferences.firmId, row.id)).limit(1).then(r => r[0] || null),
        ]);

        company = {
          id,
          sourceTable: "serviceFirms",
          sourceId,
          name: row.name,
          domain,
          industry: (companyData.industry as string) ?? (classification.categories as string[] | undefined)?.[0] ?? null,
          sizeEstimate: row.sizeBand || (companyData.size as string) || null,
          location: (companyData.location as string) || null,
          logoUrl: (ed?.logoUrl as string) || null,
          linkedinUrl: (companyData.linkedinUrl as string) || null,
          website: row.website,
          foundedYear: row.foundedYear ?? (companyData.founded as number) ?? null,
          description: row.description,
          entityClass: row.isCosCustomer || row.isPlatformMember ? "customer" : "knowledge_graph",
          serviceFirmId: row.id,
          acqCompanyId: null,
          graphNodeId: row.graphNodeId,
          hubspotCompanyId: null,
          organizationId: row.organizationId,
          enrichmentStatus: row.enrichmentStatus,
          profileCompleteness: row.profileCompleteness,
          firmType: row.firmType,
          employeeCount: companyData.employeeCount ?? null,
          // Classification taxonomy
          categories: classification.categories ?? [],
          skills: classification.skills ?? [],
          industries: classification.industries ?? [],
          markets: classification.markets ?? [],
          classificationConfidence: classification.confidence ?? null,
          // Extracted ground truth
          clients: extracted.clients ?? [],
          extractedServices: extracted.services ?? [],
          // Related entities
          research,
          services,
          caseStudies,
          abstraction,
          preferences,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    } else if (prefix === "acq") {
      const [row] = await db
        .select()
        .from(acqCompanies)
        .where(eq(acqCompanies.id, sourceId))
        .limit(1);

      if (row) {
        let research = null;
        if (row.domain) {
          const [r] = await db
            .select()
            .from(companyResearch)
            .where(eq(companyResearch.domain, row.domain))
            .limit(1);
          research = r || null;
        }

        company = {
          id,
          sourceTable: "acqCompanies",
          sourceId,
          name: row.name,
          domain: normalizeDomain(row.domain),
          industry: row.industry,
          sizeEstimate: row.sizeEstimate,
          location: null,
          logoUrl: null,
          linkedinUrl: null,
          website: row.domain ? `https://${row.domain}` : null,
          foundedYear: null,
          description: null,
          entityClass: "prospect",
          serviceFirmId: null,
          acqCompanyId: row.id,
          graphNodeId: null,
          hubspotCompanyId: row.hubspotCompanyId,
          organizationId: row.cosOrgId,
          enrichmentStatus: null,
          profileCompleteness: null,
          research,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    } else if (prefix === "ic") {
      const [row] = await db
        .select({
          id: importedCompanies.id,
          name: importedCompanies.name,
          domain: importedCompanies.domain,
          industry: importedCompanies.industry,
          location: importedCompanies.location,
          logoUrl: importedCompanies.logoUrl,
          linkedinUrl: importedCompanies.linkedinUrl,
          websiteUrl: importedCompanies.websiteUrl,
          foundedYear: importedCompanies.foundedYear,
          description: importedCompanies.description,
          employeeRange: importedCompanies.employeeRange,
          graphNodeId: importedCompanies.graphNodeId,
          serviceFirmId: importedCompanies.serviceFirmId,
          createdAt: importedCompanies.createdAt,
        })
        .from(importedCompanies)
        .where(eq(importedCompanies.id, sourceId))
        .limit(1);

      if (row) {
        company = {
          id,
          sourceTable: "importedCompanies",
          sourceId,
          name: row.name,
          domain: normalizeDomain(row.domain),
          industry: row.industry,
          sizeEstimate: row.employeeRange,
          location: row.location,
          logoUrl: row.logoUrl,
          linkedinUrl: row.linkedinUrl,
          website: row.websiteUrl,
          foundedYear: row.foundedYear,
          description: row.description,
          entityClass: "knowledge_graph",
          serviceFirmId: row.serviceFirmId,
          acqCompanyId: null,
          graphNodeId: row.graphNodeId,
          hubspotCompanyId: null,
          organizationId: null,
          enrichmentStatus: null,
          profileCompleteness: null,
          research: null,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    }

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // ─── Fetch related data in parallel ──────────────────────
    const sfId = company.serviceFirmId as string | null;
    const acqCoId = company.acqCompanyId as string | null;
    const domain = company.domain as string | null;

    const [people, deals, conversations] = await Promise.all([
      // People: experts from the firm + acqContacts from the acqCompany
      (async () => {
        const results: Record<string, unknown>[] = [];
        if (sfId) {
          const experts = await db
            .select({
              id: expertProfiles.id,
              fullName: expertProfiles.fullName,
              email: expertProfiles.email,
              title: expertProfiles.title,
              headline: expertProfiles.headline,
              linkedinUrl: expertProfiles.linkedinUrl,
              photoUrl: expertProfiles.photoUrl,
              division: expertProfiles.division,
            })
            .from(expertProfiles)
            .where(eq(expertProfiles.firmId, sfId))
            .limit(50);
          for (const e of experts) {
            results.push({ ...e, source: "expert", crmId: `ep_${e.id}` });
          }
        }
        if (acqCoId) {
          const contacts = await db
            .select({
              id: acqContacts.id,
              firstName: acqContacts.firstName,
              lastName: acqContacts.lastName,
              email: acqContacts.email,
              linkedinUrl: acqContacts.linkedinUrl,
            })
            .from(acqContacts)
            .where(eq(acqContacts.companyId, acqCoId))
            .limit(50);
          for (const c of contacts) {
            results.push({
              ...c,
              fullName: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
              source: "prospect_contact",
              crmId: `ac_${c.id}`,
            });
          }
        }
        return results;
      })(),

      // Deals linked to this acqCompany
      acqCoId
        ? db
            .select({
              id: acqDeals.id,
              name: acqDeals.name,
              stageLabel: acqDeals.stageLabel,
              dealValue: acqDeals.dealValue,
              status: acqDeals.status,
              source: acqDeals.source,
              priority: acqDeals.priority,
              lastActivityAt: acqDeals.lastActivityAt,
              createdAt: acqDeals.createdAt,
            })
            .from(acqDeals)
            .where(eq(acqDeals.companyId, acqCoId))
            .orderBy(desc(acqDeals.createdAt))
            .limit(50)
        : Promise.resolve([]),

      // LinkedIn conversations matching domain in participant headline/profileUrl
      domain
        ? db
            .select({
              id: growthOpsConversations.id,
              participantName: growthOpsConversations.participantName,
              participantHeadline: growthOpsConversations.participantHeadline,
              participantProfileUrl: growthOpsConversations.participantProfileUrl,
              lastMessageAt: growthOpsConversations.lastMessageAt,
              lastMessagePreview: growthOpsConversations.lastMessagePreview,
            })
            .from(growthOpsConversations)
            .where(
              or(
                ilike(growthOpsConversations.participantHeadline, `%${domain}%`),
                ilike(growthOpsConversations.participantProfileUrl, `%${domain}%`)
              )
            )
            .orderBy(desc(growthOpsConversations.lastMessageAt))
            .limit(20)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ...company,
      people,
      deals,
      conversations,
    });
  } catch (error) {
    console.error("[CRM] Company detail error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** PATCH /api/admin/growth-ops/crm/companies/:id — Update an acq_company */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: rawId } = await params;
    // Only acq_companies (acq_ prefix) are editable
    if (!rawId.startsWith("acq_")) {
      return NextResponse.json({ error: "Only prospect companies can be edited" }, { status: 400 });
    }
    const realId = rawId.slice(4);
    const body = await req.json();
    const allowedFields = ["name", "domain", "website", "industry", "sizeEstimate", "location", "linkedinUrl", "description", "notes"] as const;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = typeof body[field] === "string" ? body[field].trim() || null : body[field];
      }
    }
    // name must stay non-null
    if ("name" in updates && !updates.name) {
      return NextResponse.json({ error: "Company name cannot be empty" }, { status: 400 });
    }

    await db.update(acqCompanies).set(updates).where(eq(acqCompanies.id, realId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CRM] Company update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
