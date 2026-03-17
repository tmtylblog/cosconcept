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
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
        // Try to fetch research by domain
        const domain = normalizeDomain(row.website);
        let research = null;
        if (domain) {
          const [r] = await db
            .select()
            .from(companyResearch)
            .where(eq(companyResearch.domain, domain))
            .limit(1);
          research = r || null;
        }

        company = {
          id,
          sourceTable: "serviceFirms",
          sourceId,
          name: row.name,
          domain,
          industry: null,
          sizeEstimate: row.sizeBand,
          location: null,
          logoUrl: null,
          linkedinUrl: null,
          website: row.website,
          foundedYear: row.foundedYear,
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
          enrichmentData: row.enrichmentData,
          research,
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

    return NextResponse.json(company);
  } catch (error) {
    console.error("[CRM] Company detail error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
