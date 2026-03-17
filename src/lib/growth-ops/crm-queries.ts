/**
 * CRM unified query layer.
 *
 * Aggregates company/person data from multiple source tables into
 * normalized UnifiedCompany / UnifiedPerson shapes.
 *
 * IMPORTANT: imported_companies (8.6M rows) and imported_contacts (1.97M rows)
 * are only queried when a search term is provided. The default browse view
 * uses only the manageable tables (serviceFirms, acqCompanies, expertProfiles,
 * acqContacts) which have <15K rows combined.
 */

import { db } from "@/lib/db";
import {
  serviceFirms,
  importedCompanies,
  acqCompanies,
  expertProfiles,
  importedContacts,
  acqContacts,
  acqDeals,
} from "@/lib/db/schema";
import { sql, eq, ilike, or, count, and, desc } from "drizzle-orm";
import type {
  UnifiedCompany,
  UnifiedPerson,
  CompanyEntityClass,
  PersonEntityClass,
  CrmCompanyFilters,
  CrmPersonFilters,
  CrmStats,
  PaginatedResult,
} from "./crm-types";

// ─── Helpers ─────────────────────────────────────────────────

function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .trim() || null;
}

// ─── Company Queries (SQL-level pagination) ──────────────────

export async function getUnifiedCompanies(
  filters: CrmCompanyFilters = {}
): Promise<PaginatedResult<UnifiedCompany>> {
  const {
    search,
    entityClass = "all",
    sort = "name",
    sortDir = "asc",
    page = 1,
    limit = 100,
  } = filters;

  const results: UnifiedCompany[] = [];

  // 1. Always query serviceFirms (1.1K rows — fast)
  if (entityClass === "all" || entityClass === "customer" || entityClass === "knowledge_graph") {
    const sfQuery = search
      ? or(
          ilike(serviceFirms.name, `%${search}%`),
          ilike(serviceFirms.website, `%${search}%`)
        )
      : undefined;

    const sfRows = await db
      .select({
        id: serviceFirms.id,
        name: serviceFirms.name,
        website: serviceFirms.website,
        description: serviceFirms.description,
        foundedYear: serviceFirms.foundedYear,
        sizeBand: serviceFirms.sizeBand,
        graphNodeId: serviceFirms.graphNodeId,
        organizationId: serviceFirms.organizationId,
        enrichmentStatus: serviceFirms.enrichmentStatus,
        profileCompleteness: serviceFirms.profileCompleteness,
        isCosCustomer: serviceFirms.isCosCustomer,
        isPlatformMember: serviceFirms.isPlatformMember,
        createdAt: serviceFirms.createdAt,
      })
      .from(serviceFirms)
      .where(sfQuery)
      .orderBy(serviceFirms.name);

    for (const r of sfRows) {
      const ec: CompanyEntityClass =
        r.isCosCustomer || r.isPlatformMember ? "customer" : "knowledge_graph";
      if (entityClass !== "all" && ec !== entityClass) continue;

      results.push({
        id: `sf_${r.id}`,
        sourceTable: "serviceFirms",
        sourceId: r.id,
        name: r.name,
        domain: normalizeDomain(r.website),
        industry: null,
        sizeEstimate: r.sizeBand,
        location: null,
        logoUrl: null,
        linkedinUrl: null,
        website: r.website,
        foundedYear: r.foundedYear,
        description: r.description,
        entityClass: ec,
        serviceFirmId: r.id,
        acqCompanyId: null,
        graphNodeId: r.graphNodeId,
        hubspotCompanyId: null,
        organizationId: r.organizationId,
        enrichmentStatus: r.enrichmentStatus,
        profileCompleteness: r.profileCompleteness,
        dealCount: 0,
        expertCount: 0,
        hasResearch: false,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // 2. Always query acqCompanies (7K rows — fast)
  if (entityClass === "all" || entityClass === "prospect") {
    const acqQuery = search
      ? or(
          ilike(acqCompanies.name, `%${search}%`),
          ilike(acqCompanies.domain, `%${search}%`)
        )
      : undefined;

    const acqRows = await db
      .select({
        id: acqCompanies.id,
        name: acqCompanies.name,
        domain: acqCompanies.domain,
        industry: acqCompanies.industry,
        sizeEstimate: acqCompanies.sizeEstimate,
        hubspotCompanyId: acqCompanies.hubspotCompanyId,
        cosOrgId: acqCompanies.cosOrgId,
        createdAt: acqCompanies.createdAt,
      })
      .from(acqCompanies)
      .where(acqQuery)
      .orderBy(acqCompanies.name);

    for (const r of acqRows) {
      results.push({
        id: `acq_${r.id}`,
        sourceTable: "acqCompanies",
        sourceId: r.id,
        name: r.name,
        domain: normalizeDomain(r.domain),
        industry: r.industry,
        sizeEstimate: r.sizeEstimate,
        location: null,
        logoUrl: null,
        linkedinUrl: null,
        website: r.domain ? `https://${r.domain}` : null,
        foundedYear: null,
        description: null,
        entityClass: "prospect",
        serviceFirmId: null,
        acqCompanyId: r.id,
        graphNodeId: null,
        hubspotCompanyId: r.hubspotCompanyId,
        organizationId: r.cosOrgId,
        enrichmentStatus: null,
        profileCompleteness: null,
        dealCount: 0,
        expertCount: 0,
        hasResearch: false,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // 3. Only query importedCompanies (8.6M rows!) when searching with >= 3 chars
  if (
    search && search.length >= 3 &&
    (entityClass === "all" || entityClass === "knowledge_graph")
  ) {
    const icRows = await db
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
      .where(
        or(
          ilike(importedCompanies.name, `%${search}%`),
          ilike(importedCompanies.domain, `%${search}%`)
        )
      )
      .limit(200); // Cap results from huge table

    for (const r of icRows) {
      results.push({
        id: `ic_${r.id}`,
        sourceTable: "importedCompanies",
        sourceId: r.id,
        name: r.name,
        domain: normalizeDomain(r.domain),
        industry: r.industry,
        sizeEstimate: r.employeeRange,
        location: r.location,
        logoUrl: r.logoUrl,
        linkedinUrl: r.linkedinUrl,
        website: r.websiteUrl,
        foundedYear: r.foundedYear,
        description: r.description,
        entityClass: "knowledge_graph",
        serviceFirmId: r.serviceFirmId,
        acqCompanyId: null,
        graphNodeId: r.graphNodeId,
        hubspotCompanyId: null,
        organizationId: null,
        enrichmentStatus: null,
        profileCompleteness: null,
        dealCount: 0,
        expertCount: 0,
        hasResearch: false,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // Sort
  results.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "created":
        cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        break;
      case "deals":
        cmp = a.dealCount - b.dealCount;
        break;
      case "enrichment":
        cmp = (a.profileCompleteness ?? 0) - (b.profileCompleteness ?? 0);
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const total = results.length;
  const start = (page - 1) * limit;
  const items = results.slice(start, start + limit);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Person Queries (SQL-level pagination) ───────────────────

export async function getUnifiedPeople(
  filters: CrmPersonFilters = {}
): Promise<PaginatedResult<UnifiedPerson>> {
  const {
    search,
    entityClass = "all",
    sort = "name",
    sortDir = "asc",
    page = 1,
    limit = 100,
  } = filters;

  const results: UnifiedPerson[] = [];

  // 1. Always query expertProfiles (4K rows — fast)
  if (entityClass === "all" || entityClass === "expert") {
    const epQuery = search
      ? or(
          ilike(expertProfiles.fullName, `%${search}%`),
          ilike(expertProfiles.email, `%${search}%`),
          ilike(expertProfiles.title, `%${search}%`)
        )
      : undefined;

    const epRows = await db
      .select({
        id: expertProfiles.id,
        firstName: expertProfiles.firstName,
        lastName: expertProfiles.lastName,
        fullName: expertProfiles.fullName,
        email: expertProfiles.email,
        title: expertProfiles.title,
        headline: expertProfiles.headline,
        linkedinUrl: expertProfiles.linkedinUrl,
        photoUrl: expertProfiles.photoUrl,
        location: expertProfiles.location,
        firmId: expertProfiles.firmId,
        userId: expertProfiles.userId,
        createdAt: expertProfiles.createdAt,
      })
      .from(expertProfiles)
      .where(epQuery)
      .orderBy(expertProfiles.fullName);

    for (const r of epRows) {
      results.push({
        id: `ep_${r.id}`,
        sourceTable: "expertProfiles",
        sourceId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        fullName: r.fullName ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"),
        email: r.email,
        title: r.title,
        linkedinUrl: r.linkedinUrl,
        photoUrl: r.photoUrl,
        location: r.location,
        headline: r.headline,
        entityClass: "expert",
        companyName: null,
        companyDomain: null,
        companyId: null,
        firmId: r.firmId,
        acqContactId: null,
        expertProfileId: r.id,
        userId: r.userId,
        dealCount: 0,
        hasLinkedInConversation: false,
        lastActivityAt: null,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // 2. Always query acqContacts (12K rows — fast)
  if (entityClass === "all" || entityClass === "prospect_contact") {
    const acQuery = search
      ? or(
          ilike(acqContacts.firstName, `%${search}%`),
          ilike(acqContacts.lastName, `%${search}%`),
          ilike(acqContacts.email, `%${search}%`)
        )
      : undefined;

    const acRows = await db
      .select({
        id: acqContacts.id,
        firstName: acqContacts.firstName,
        lastName: acqContacts.lastName,
        email: acqContacts.email,
        linkedinUrl: acqContacts.linkedinUrl,
        companyId: acqContacts.companyId,
        createdAt: acqContacts.createdAt,
      })
      .from(acqContacts)
      .where(acQuery)
      .orderBy(acqContacts.firstName);

    for (const r of acRows) {
      results.push({
        id: `ac_${r.id}`,
        sourceTable: "acqContacts",
        sourceId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        fullName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
        email: r.email,
        title: null,
        linkedinUrl: r.linkedinUrl,
        photoUrl: null,
        location: null,
        headline: null,
        entityClass: "prospect_contact",
        companyName: null,
        companyDomain: null,
        companyId: null,
        firmId: null,
        acqContactId: r.id,
        expertProfileId: null,
        userId: null,
        dealCount: 0,
        hasLinkedInConversation: false,
        lastActivityAt: null,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // 3. Only query importedContacts (1.97M rows!) when searching with >= 3 chars
  if (
    search && search.length >= 3 &&
    (entityClass === "all" || entityClass === "legacy_contact")
  ) {
    const icRows = await db
      .select({
        id: importedContacts.id,
        firstName: importedContacts.firstName,
        lastName: importedContacts.lastName,
        name: importedContacts.name,
        email: importedContacts.email,
        title: importedContacts.title,
        headline: importedContacts.headline,
        linkedinUrl: importedContacts.linkedinUrl,
        photoUrl: importedContacts.photoUrl,
        city: importedContacts.city,
        country: importedContacts.country,
        createdAt: importedContacts.createdAt,
      })
      .from(importedContacts)
      .where(
        or(
          ilike(importedContacts.name, `%${search}%`),
          ilike(importedContacts.email, `%${search}%`)
        )
      )
      .limit(200); // Cap results from huge table

    for (const r of icRows) {
      results.push({
        id: `imp_${r.id}`,
        sourceTable: "importedContacts",
        sourceId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        fullName: r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"),
        email: r.email,
        title: r.title,
        linkedinUrl: r.linkedinUrl,
        photoUrl: r.photoUrl,
        location: [r.city, r.country].filter(Boolean).join(", ") || null,
        headline: r.headline,
        entityClass: "legacy_contact",
        companyName: null,
        companyDomain: null,
        companyId: null,
        firmId: null,
        acqContactId: null,
        expertProfileId: null,
        userId: null,
        dealCount: 0,
        hasLinkedInConversation: false,
        lastActivityAt: null,
        createdAt: r.createdAt?.toISOString() ?? null,
      });
    }
  }

  // Sort
  results.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "name":
        cmp = a.fullName.localeCompare(b.fullName);
        break;
      case "created":
        cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        break;
      case "activity":
        cmp = (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "");
        break;
      case "deals":
        cmp = a.dealCount - b.dealCount;
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const total = results.length;
  const start = (page - 1) * limit;
  const items = results.slice(start, start + limit);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Stats ───────────────────────────────────────────────────

export async function getCrmStats(): Promise<CrmStats> {
  // Only count the manageable tables for the dashboard.
  // importedCompanies/importedContacts counts are cached approximations.
  const [sfCount, acqCoCount, epCount, acCount, dealCount] =
    await Promise.all([
      db.select({ c: count() }).from(serviceFirms).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(acqCompanies).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(expertProfiles).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(acqContacts).then((r) => r[0]?.c ?? 0),
      db
        .select({ c: count() })
        .from(acqDeals)
        .where(eq(acqDeals.status, "open"))
        .then((r) => r[0]?.c ?? 0),
    ]);

  // Use pg_class for fast approximate counts on the huge tables
  const approxCounts = await db.execute(sql`
    SELECT relname, reltuples::bigint AS estimate
    FROM pg_class
    WHERE relname IN ('imported_companies', 'imported_contacts')
  `);
  const approx: Record<string, number> = {};
  for (const row of approxCounts.rows as { relname: string; estimate: number }[]) {
    approx[row.relname] = Number(row.estimate);
  }

  const icCount = approx["imported_companies"] ?? 0;
  const impContactCount = approx["imported_contacts"] ?? 0;

  return {
    totalCompanies: Number(sfCount) + Number(acqCoCount) + icCount,
    customers: Number(sfCount),
    prospects: Number(acqCoCount),
    knowledgeGraph: icCount,
    clientsOfCustomers: 0, // importedClients is empty
    totalPeople: Number(epCount) + Number(acCount) + impContactCount,
    experts: Number(epCount),
    prospectContacts: Number(acCount),
    openDeals: Number(dealCount),
  };
}
