/**
 * CRM unified query layer.
 *
 * Aggregates company/person data from multiple source tables into
 * normalized UnifiedCompany / UnifiedPerson shapes. Deduplicates
 * by domain (companies) or email/linkedinUrl (people).
 */

import { db } from "@/lib/db";
import {
  serviceFirms,
  importedCompanies,
  importedClients,
  acqCompanies,
  expertProfiles,
  importedContacts,
  acqContacts,
  acqDeals,
  companyResearch,
} from "@/lib/db/schema";
import { sql, eq, ilike, or, count, and } from "drizzle-orm";
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

// ─── Company Queries ─────────────────────────────────────────

interface RawCompanyRow {
  id: string;
  sourceTable: UnifiedCompany["sourceTable"];
  name: string;
  domain: string | null;
  industry: string | null;
  sizeEstimate: string | null;
  location: string | null;
  logoUrl: string | null;
  linkedinUrl: string | null;
  website: string | null;
  foundedYear: number | null;
  description: string | null;
  entityClass: CompanyEntityClass;
  serviceFirmId: string | null;
  acqCompanyId: string | null;
  graphNodeId: string | null;
  hubspotCompanyId: string | null;
  organizationId: string | null;
  enrichmentStatus: string | null;
  profileCompleteness: number | null;
  createdAt: string | null;
}

async function fetchServiceFirms(): Promise<RawCompanyRow[]> {
  const rows = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      website: serviceFirms.website,
      description: serviceFirms.description,
      foundedYear: serviceFirms.foundedYear,
      sizeBand: serviceFirms.sizeBand,
      firmType: serviceFirms.firmType,
      graphNodeId: serviceFirms.graphNodeId,
      organizationId: serviceFirms.organizationId,
      enrichmentStatus: serviceFirms.enrichmentStatus,
      profileCompleteness: serviceFirms.profileCompleteness,
      isCosCustomer: serviceFirms.isCosCustomer,
      isPlatformMember: serviceFirms.isPlatformMember,
      createdAt: serviceFirms.createdAt,
    })
    .from(serviceFirms);

  return rows.map((r) => ({
    id: `sf_${r.id}`,
    sourceTable: "serviceFirms" as const,
    name: r.name,
    domain: normalizeDomain(r.website),
    industry: null, // classification is in enrichmentData JSONB
    sizeEstimate: r.sizeBand,
    location: null,
    logoUrl: null,
    linkedinUrl: null,
    website: r.website,
    foundedYear: r.foundedYear,
    description: r.description,
    entityClass: (r.isCosCustomer || r.isPlatformMember ? "customer" : "knowledge_graph") as CompanyEntityClass,
    serviceFirmId: r.id,
    acqCompanyId: null,
    graphNodeId: r.graphNodeId,
    hubspotCompanyId: null,
    organizationId: r.organizationId,
    enrichmentStatus: r.enrichmentStatus,
    profileCompleteness: r.profileCompleteness,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

async function fetchAcqCompanies(): Promise<RawCompanyRow[]> {
  const rows = await db
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
    .from(acqCompanies);

  return rows.map((r) => ({
    id: `acq_${r.id}`,
    sourceTable: "acqCompanies" as const,
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
    entityClass: "prospect" as CompanyEntityClass,
    serviceFirmId: null,
    acqCompanyId: r.id,
    graphNodeId: null,
    hubspotCompanyId: r.hubspotCompanyId,
    organizationId: r.cosOrgId,
    enrichmentStatus: null,
    profileCompleteness: null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

async function fetchImportedCompanies(): Promise<RawCompanyRow[]> {
  const rows = await db
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
    .from(importedCompanies);

  return rows.map((r) => ({
    id: `ic_${r.id}`,
    sourceTable: "importedCompanies" as const,
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
    entityClass: "knowledge_graph" as CompanyEntityClass,
    serviceFirmId: r.serviceFirmId,
    acqCompanyId: null,
    graphNodeId: r.graphNodeId,
    hubspotCompanyId: null,
    organizationId: null,
    enrichmentStatus: null,
    profileCompleteness: null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

async function fetchImportedClients(): Promise<RawCompanyRow[]> {
  const rows = await db
    .select({
      id: importedClients.id,
      name: importedClients.name,
      domain: importedClients.domain,
      industry: importedClients.industry,
      location: importedClients.location,
      logoUrl: importedClients.logoUrl,
      linkedinUrl: importedClients.linkedinUrl,
      website: importedClients.website,
      foundedYear: importedClients.foundedYear,
      description: importedClients.description,
      employeeRange: importedClients.employeeRange,
      createdAt: importedClients.createdAt,
    })
    .from(importedClients);

  return rows.map((r) => ({
    id: `icl_${r.id}`,
    sourceTable: "importedClients" as const,
    name: r.name,
    domain: normalizeDomain(r.domain),
    industry: r.industry,
    sizeEstimate: r.employeeRange,
    location: r.location,
    logoUrl: r.logoUrl,
    linkedinUrl: r.linkedinUrl,
    website: r.website,
    foundedYear: r.foundedYear,
    description: r.description,
    entityClass: "client_of_customer" as CompanyEntityClass,
    serviceFirmId: null,
    acqCompanyId: null,
    graphNodeId: null,
    hubspotCompanyId: null,
    organizationId: null,
    enrichmentStatus: null,
    profileCompleteness: null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

/** Priority order for merging duplicates by domain. Lower index = higher priority. */
const SOURCE_PRIORITY: UnifiedCompany["sourceTable"][] = [
  "serviceFirms",
  "acqCompanies",
  "importedCompanies",
  "importedClients",
];

function mergeCompanies(allRows: RawCompanyRow[]): UnifiedCompany[] {
  const byDomain = new Map<string, RawCompanyRow[]>();
  const noDomain: RawCompanyRow[] = [];

  for (const row of allRows) {
    if (row.domain) {
      const existing = byDomain.get(row.domain) || [];
      existing.push(row);
      byDomain.set(row.domain, existing);
    } else {
      noDomain.push(row);
    }
  }

  const merged: UnifiedCompany[] = [];

  for (const [, rows] of byDomain) {
    // Sort by priority
    rows.sort(
      (a, b) =>
        SOURCE_PRIORITY.indexOf(a.sourceTable) - SOURCE_PRIORITY.indexOf(b.sourceTable)
    );

    const primary = rows[0];
    // Merge cross-references from all rows
    const company: UnifiedCompany = {
      ...primary,
      dealCount: 0,
      expertCount: 0,
      hasResearch: false,
    };

    for (const row of rows) {
      if (!company.serviceFirmId && row.serviceFirmId) company.serviceFirmId = row.serviceFirmId;
      if (!company.acqCompanyId && row.acqCompanyId) company.acqCompanyId = row.acqCompanyId;
      if (!company.graphNodeId && row.graphNodeId) company.graphNodeId = row.graphNodeId;
      if (!company.hubspotCompanyId && row.hubspotCompanyId) company.hubspotCompanyId = row.hubspotCompanyId;
      if (!company.organizationId && row.organizationId) company.organizationId = row.organizationId;
      if (!company.industry && row.industry) company.industry = row.industry;
      if (!company.location && row.location) company.location = row.location;
      if (!company.logoUrl && row.logoUrl) company.logoUrl = row.logoUrl;
      if (!company.linkedinUrl && row.linkedinUrl) company.linkedinUrl = row.linkedinUrl;
      if (!company.description && row.description) company.description = row.description;
      if (!company.foundedYear && row.foundedYear) company.foundedYear = row.foundedYear;
      if (!company.sizeEstimate && row.sizeEstimate) company.sizeEstimate = row.sizeEstimate;
    }

    // Upgrade entityClass if cross-referenced
    if (company.serviceFirmId) company.entityClass = "customer";
    else if (company.acqCompanyId) company.entityClass = "prospect";

    merged.push(company);
  }

  // Add no-domain entries as-is
  for (const row of noDomain) {
    merged.push({ ...row, dealCount: 0, expertCount: 0, hasResearch: false });
  }

  return merged;
}

export async function getUnifiedCompanies(
  filters: CrmCompanyFilters = {}
): Promise<PaginatedResult<UnifiedCompany>> {
  const { search, entityClass = "all", sort = "name", sortDir = "asc", page = 1, limit = 100 } = filters;

  // Fetch all sources in parallel
  const [sf, acq, ic, icl] = await Promise.all([
    fetchServiceFirms(),
    fetchAcqCompanies(),
    fetchImportedCompanies(),
    fetchImportedClients(),
  ]);

  let companies = mergeCompanies([...sf, ...acq, ...ic, ...icl]);

  // Filter by entityClass
  if (entityClass && entityClass !== "all") {
    companies = companies.filter((c) => c.entityClass === entityClass);
  }

  // Text search
  if (search) {
    const q = search.toLowerCase();
    companies = companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.domain && c.domain.includes(q)) ||
        (c.industry && c.industry.toLowerCase().includes(q))
    );
  }

  // Sort
  companies.sort((a, b) => {
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

  const total = companies.length;
  const start = (page - 1) * limit;
  const items = companies.slice(start, start + limit);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Person Queries ──────────────────────────────────────────

interface RawPersonRow {
  id: string;
  sourceTable: UnifiedPerson["sourceTable"];
  sourceId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  location: string | null;
  headline: string | null;
  entityClass: PersonEntityClass;
  companyName: string | null;
  companyDomain: string | null;
  firmId: string | null;
  acqContactId: string | null;
  expertProfileId: string | null;
  userId: string | null;
  createdAt: string | null;
}

async function fetchExperts(): Promise<RawPersonRow[]> {
  const rows = await db
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
    .from(expertProfiles);

  return rows.map((r) => ({
    id: `ep_${r.id}`,
    sourceTable: "expertProfiles" as const,
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
    entityClass: "expert" as PersonEntityClass,
    companyName: null, // would need join, set later if needed
    companyDomain: null,
    firmId: r.firmId,
    acqContactId: null,
    expertProfileId: r.id,
    userId: r.userId,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

async function fetchAcqContactRows(): Promise<RawPersonRow[]> {
  const rows = await db
    .select({
      id: acqContacts.id,
      firstName: acqContacts.firstName,
      lastName: acqContacts.lastName,
      email: acqContacts.email,
      linkedinUrl: acqContacts.linkedinUrl,
      companyId: acqContacts.companyId,
      createdAt: acqContacts.createdAt,
    })
    .from(acqContacts);

  return rows.map((r) => ({
    id: `ac_${r.id}`,
    sourceTable: "acqContacts" as const,
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
    entityClass: "prospect_contact" as PersonEntityClass,
    companyName: null,
    companyDomain: null,
    firmId: null,
    acqContactId: r.id,
    expertProfileId: null,
    userId: null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

async function fetchImportedContactRows(): Promise<RawPersonRow[]> {
  const rows = await db
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
    .from(importedContacts);

  return rows.map((r) => ({
    id: `imp_${r.id}`,
    sourceTable: "importedContacts" as const,
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
    entityClass: "legacy_contact" as PersonEntityClass,
    companyName: null,
    companyDomain: null,
    firmId: null,
    acqContactId: null,
    expertProfileId: null,
    userId: null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

const PERSON_SOURCE_PRIORITY: UnifiedPerson["sourceTable"][] = [
  "expertProfiles",
  "acqContacts",
  "importedContacts",
];

function mergePeople(allRows: RawPersonRow[]): UnifiedPerson[] {
  // Dedup by email first, then by linkedinUrl for those without email
  const byEmail = new Map<string, RawPersonRow[]>();
  const byLinkedin = new Map<string, RawPersonRow[]>();
  const noKey: RawPersonRow[] = [];

  for (const row of allRows) {
    if (row.email) {
      const key = row.email.toLowerCase();
      const existing = byEmail.get(key) || [];
      existing.push(row);
      byEmail.set(key, existing);
    } else if (row.linkedinUrl) {
      const key = row.linkedinUrl.toLowerCase();
      const existing = byLinkedin.get(key) || [];
      existing.push(row);
      byLinkedin.set(key, existing);
    } else {
      noKey.push(row);
    }
  }

  const merged: UnifiedPerson[] = [];
  const processedLinkedins = new Set<string>();

  // Process email-keyed groups
  for (const [, rows] of byEmail) {
    rows.sort(
      (a, b) =>
        PERSON_SOURCE_PRIORITY.indexOf(a.sourceTable) -
        PERSON_SOURCE_PRIORITY.indexOf(b.sourceTable)
    );
    const primary = rows[0];
    const person: UnifiedPerson = {
      ...primary,
      companyId: null,
      dealCount: 0,
      hasLinkedInConversation: false,
      lastActivityAt: null,
    };

    for (const row of rows) {
      if (!person.linkedinUrl && row.linkedinUrl) person.linkedinUrl = row.linkedinUrl;
      if (!person.photoUrl && row.photoUrl) person.photoUrl = row.photoUrl;
      if (!person.title && row.title) person.title = row.title;
      if (!person.headline && row.headline) person.headline = row.headline;
      if (!person.location && row.location) person.location = row.location;
      if (!person.firmId && row.firmId) person.firmId = row.firmId;
      if (!person.acqContactId && row.acqContactId) person.acqContactId = row.acqContactId;
      if (!person.expertProfileId && row.expertProfileId) person.expertProfileId = row.expertProfileId;
      if (!person.userId && row.userId) person.userId = row.userId;
      // Track processed linkedinUrls to avoid double-counting
      if (row.linkedinUrl) processedLinkedins.add(row.linkedinUrl.toLowerCase());
    }

    merged.push(person);
  }

  // Process linkedin-keyed groups (skip those already merged via email)
  for (const [key, rows] of byLinkedin) {
    if (processedLinkedins.has(key)) continue;
    rows.sort(
      (a, b) =>
        PERSON_SOURCE_PRIORITY.indexOf(a.sourceTable) -
        PERSON_SOURCE_PRIORITY.indexOf(b.sourceTable)
    );
    const primary = rows[0];
    const person: UnifiedPerson = {
      ...primary,
      companyId: null,
      dealCount: 0,
      hasLinkedInConversation: false,
      lastActivityAt: null,
    };

    for (const row of rows) {
      if (!person.email && row.email) person.email = row.email;
      if (!person.photoUrl && row.photoUrl) person.photoUrl = row.photoUrl;
      if (!person.title && row.title) person.title = row.title;
      if (!person.headline && row.headline) person.headline = row.headline;
      if (!person.firmId && row.firmId) person.firmId = row.firmId;
      if (!person.acqContactId && row.acqContactId) person.acqContactId = row.acqContactId;
      if (!person.expertProfileId && row.expertProfileId) person.expertProfileId = row.expertProfileId;
    }

    merged.push(person);
  }

  // Add no-key entries
  for (const row of noKey) {
    merged.push({
      ...row,
      companyId: null,
      dealCount: 0,
      hasLinkedInConversation: false,
      lastActivityAt: null,
    });
  }

  return merged;
}

export async function getUnifiedPeople(
  filters: CrmPersonFilters = {}
): Promise<PaginatedResult<UnifiedPerson>> {
  const { search, entityClass = "all", companyDomain, sort = "name", sortDir = "asc", page = 1, limit = 100 } = filters;

  const [experts, contacts, imported] = await Promise.all([
    fetchExperts(),
    fetchAcqContactRows(),
    fetchImportedContactRows(),
  ]);

  let people = mergePeople([...experts, ...contacts, ...imported]);

  if (entityClass && entityClass !== "all") {
    people = people.filter((p) => p.entityClass === entityClass);
  }

  if (companyDomain) {
    const d = normalizeDomain(companyDomain);
    if (d) {
      people = people.filter((p) => p.companyDomain === d);
    }
  }

  if (search) {
    const q = search.toLowerCase();
    people = people.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.companyName && p.companyName.toLowerCase().includes(q))
    );
  }

  people.sort((a, b) => {
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

  const total = people.length;
  const start = (page - 1) * limit;
  const items = people.slice(start, start + limit);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── Stats ───────────────────────────────────────────────────

export async function getCrmStats(): Promise<CrmStats> {
  // Run count queries in parallel for speed
  const [sfCount, acqCoCount, icCount, iclCount, epCount, acCount, dealCount] =
    await Promise.all([
      db.select({ c: count() }).from(serviceFirms).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(acqCompanies).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(importedCompanies).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(importedClients).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(expertProfiles).then((r) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(acqContacts).then((r) => r[0]?.c ?? 0),
      db
        .select({ c: count() })
        .from(acqDeals)
        .where(eq(acqDeals.status, "open"))
        .then((r) => r[0]?.c ?? 0),
    ]);

  return {
    totalCompanies: Number(sfCount) + Number(acqCoCount) + Number(icCount) + Number(iclCount),
    customers: Number(sfCount),
    prospects: Number(acqCoCount),
    knowledgeGraph: Number(icCount),
    clientsOfCustomers: Number(iclCount),
    totalPeople: Number(epCount) + Number(acCount),
    experts: Number(epCount),
    prospectContacts: Number(acCount),
    openDeals: Number(dealCount),
  };
}
