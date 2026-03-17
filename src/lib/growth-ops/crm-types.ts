/**
 * CRM unified entity types.
 *
 * These interfaces normalize company/person data from multiple source tables
 * into a single shape for the Growth Ops CRM views.
 */

// ─── Company Types ───────────────────────────────────────────

export type CompanyEntityClass =
  | "customer"           // serviceFirms with isCosCustomer or isPlatformMember
  | "prospect"           // acqCompanies (pipeline prospect)
  | "client_of_customer" // importedClients (client of a COS member firm)
  | "knowledge_graph";   // importedCompanies (enriched, not prospect/customer)

export interface UnifiedCompany {
  /** Synthetic ID: "sf_<id>" | "acq_<id>" | "ic_<id>" | "icl_<id>" */
  id: string;
  sourceTable: "serviceFirms" | "importedCompanies" | "importedClients" | "acqCompanies";
  sourceId: string;

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

  // Cross-references
  serviceFirmId: string | null;
  acqCompanyId: string | null;
  graphNodeId: string | null;
  hubspotCompanyId: string | null;
  organizationId: string | null;

  // Aggregated signals
  enrichmentStatus: string | null;
  profileCompleteness: number | null;
  dealCount: number;
  expertCount: number;
  hasResearch: boolean;

  createdAt: string | null;
}

// ─── Person Types ────────────────────────────────────────────

export type PersonEntityClass =
  | "expert"           // expertProfiles
  | "prospect_contact" // acqContacts
  | "platform_user"    // users with org membership
  | "legacy_contact";  // importedContacts only

export interface UnifiedPerson {
  /** Synthetic ID: "ep_<id>" | "ac_<id>" | "imp_<id>" */
  id: string;
  sourceTable: "expertProfiles" | "acqContacts" | "importedContacts";
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

  // Company link
  companyName: string | null;
  companyDomain: string | null;
  companyId: string | null; // synthetic company CRM ID

  // Cross-references
  firmId: string | null;
  acqContactId: string | null;
  expertProfileId: string | null;
  userId: string | null;

  // Activity signals
  dealCount: number;
  hasLinkedInConversation: boolean;
  lastActivityAt: string | null;

  createdAt: string | null;
}

// ─── Query Types ─────────────────────────────────────────────

export interface CrmCompanyFilters {
  search?: string;
  entityClass?: CompanyEntityClass | "all";
  sort?: "name" | "created" | "deals" | "enrichment";
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CrmPersonFilters {
  search?: string;
  entityClass?: PersonEntityClass | "all";
  companyDomain?: string;
  sort?: "name" | "created" | "activity" | "deals";
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CrmStats {
  totalCompanies: number;
  customers: number;
  prospects: number;
  knowledgeGraph: number;
  clientsOfCustomers: number;
  totalPeople: number;
  experts: number;
  prospectContacts: number;
  openDeals: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
