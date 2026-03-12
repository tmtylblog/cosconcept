/**
 * People Data Labs (PDL) — structured firmographic and person data.
 *
 * PDL provides two complementary datasets:
 *
 * 1. COMPANY ENRICHMENT — firmographics, headcount, industry, funding,
 *    location, social profiles. The "company card" data.
 *    Endpoint: GET https://api.peopledatalabs.com/v5/company/enrich
 *
 * 2. PERSON ENRICHMENT — job history, education, skills, social profiles.
 *    Used for expert profiles when individuals are added to the platform.
 *    Endpoint: GET https://api.peopledatalabs.com/v5/person/enrich
 *
 * PDL tells you WHAT a company IS. Jina tells you what they've DONE.
 */

const PDL_BASE = "https://api.peopledatalabs.com/v5";

function getPdlKey(): string {
  const key = process.env.PDL_API_KEY;
  if (!key) throw new Error("PDL_API_KEY is not configured");
  return key;
}

// ─── Company Enrichment ───────────────────────────────────

export interface PdlCompany {
  id: string;
  name: string;
  displayName: string;
  website: string;
  industry: string;
  size: string;
  employeeCount: number;
  employeeCountByCountry: Record<string, number>;
  founded: number | null;
  summary: string;
  headline: string;
  tags: string[];
  location: {
    name: string;
    locality: string;
    region: string;
    country: string;
    continent: string;
  } | null;
  linkedinUrl: string | null;
  linkedinSlug: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  // Funding
  totalFundingRaised: number | null;
  latestFundingStage: string | null;
  lastFundingDate: string | null;
  numberOfFundingRounds: number | null;
  // Revenue
  inferredRevenue: string | null;
  // Metadata
  type: string | null; // public, private, nonprofit, etc.
  likelihood: number;
}

/**
 * Enrich a company using PDL.
 * Requires at least one of: website, name, or LinkedIn profile.
 */
export async function enrichCompany(params: {
  website?: string;
  name?: string;
  profile?: string;
}): Promise<PdlCompany | null> {
  const query = new URLSearchParams();
  query.set("api_key", getPdlKey());
  query.set("titlecase", "true");

  if (params.website) query.set("website", params.website);
  if (params.name) query.set("name", params.name);
  if (params.profile) query.set("profile", params.profile);

  // Need at least one identifier
  if (!params.website && !params.name && !params.profile) {
    throw new Error("PDL company enrichment requires website, name, or profile");
  }

  const response = await fetch(
    `${PDL_BASE}/company/enrich?${query.toString()}`,
    { method: "GET" }
  );

  if (response.status === 404) {
    console.log(`[PDL] No company match found for ${JSON.stringify(params)}`);
    return null; // not found — free, no charge
  }

  if (!response.ok) {
    throw new Error(
      `PDL company enrichment failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return {
    id: data.id ?? "",
    name: data.name ?? "",
    displayName: data.display_name ?? data.name ?? "",
    website: data.website ?? "",
    industry: data.industry ?? "",
    size: data.size ?? "",
    employeeCount: data.employee_count ?? 0,
    employeeCountByCountry: data.employee_count_by_country ?? {},
    founded: data.founded ?? null,
    summary: data.summary ?? "",
    headline: data.headline ?? "",
    tags: data.tags ?? [],
    location: data.location
      ? {
          name: data.location.name ?? "",
          locality: data.location.locality ?? "",
          region: data.location.region ?? "",
          country: data.location.country ?? "",
          continent: data.location.continent ?? "",
        }
      : null,
    linkedinUrl: data.linkedin_url ?? null,
    linkedinSlug: data.linkedin_slug ?? null,
    facebookUrl: data.facebook_url ?? null,
    twitterUrl: data.twitter_url ?? null,
    totalFundingRaised: data.total_funding_raised ?? null,
    latestFundingStage: data.latest_funding_stage ?? null,
    lastFundingDate: data.last_funding_date ?? null,
    numberOfFundingRounds: data.number_funding_rounds ?? null,
    inferredRevenue: data.inferred_revenue ?? null,
    type: data.type ?? null,
    likelihood: data.likelihood ?? 0,
  };
}

// ─── Person Enrichment ────────────────────────────────────

export interface PdlPerson {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string | null;
  headline: string;
  summary: string;
  industry: string;
  jobTitle: string;
  jobCompanyName: string;
  jobCompanyWebsite: string | null;
  /** PDL seniority levels: "cxo", "owner", "vp", "director", "partner", "senior", "manager", "entry", "training" */
  jobTitleLevels: string[];
  /** PDL expense line category: "sales_and_marketing", "research_and_development", etc. */
  jobTitleClass: string | null;
  location: {
    name: string;
    locality: string;
    region: string;
    country: string;
  } | null;
  skills: string[];
  /** Full job history — the key data for expert profiles */
  experience: PdlExperience[];
  education: PdlEducation[];
  likelihood: number;
}

export interface PdlExperience {
  company: {
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
  };
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  summary: string | null;
  locationName: string | null;
}

export interface PdlEducation {
  school: { name: string; website: string | null };
  degrees: string[];
  majors: string[];
  startDate: string | null;
  endDate: string | null;
}

// ─── Person Search (Team Roster) ──────────────────────────

/**
 * Structured result from PDL Person Search.
 * Omits work history (experience) to keep costs down — use enrichPerson() for that.
 */
export interface PdlPersonSearchResult {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  /** PDL's structured role category — key for expert classification */
  jobTitleRole: string | null;
  jobTitleSubRole: string | null;
  jobTitleLevels: string[];
  linkedinUrl: string | null;
  linkedinId: string | null;
  location: string | null;
  headline: string | null;
  skills: string[];
  photoUrl: string | null;
}

/**
 * Search for current employees at a company by domain.
 * Uses PDL Person Search endpoint (POST /v5/person/search).
 *
 * Charges 1 credit per record returned — NOT per API call.
 * Only fetches current jobs (job_is_primary=true).
 * Does NOT request experience/education to keep payload slim (cost is the same).
 *
 * @param domain  Bare domain, e.g. "agency.com" (no protocol/www)
 * @param limit   Max records to return. Default 5. PDL max per page is 100.
 * @param from    Offset for pagination.
 */
export async function searchPeopleAtCompany(params: {
  domain: string;
  limit?: number;
  from?: number;
}): Promise<{ people: PdlPersonSearchResult[]; total: number }> {
  const domain = params.domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

  const body = {
    query: {
      bool: {
        must: [
          { term: { job_company_website: domain } },
          { term: { job_is_primary: true } },
        ],
      },
    },
    size: params.limit ?? 5,
    from: params.from ?? 0,
    dataset: "resume",
    // Select only the fields we need — cost is per record regardless, but
    // keeping the select list small reduces payload size and avoids storing
    // sensitive contact info.
    select: [
      "id",
      "full_name",
      "first_name",
      "last_name",
      "job_title",
      "job_title_role",
      "job_title_sub_role",
      "job_title_levels",
      "linkedin_url",
      "linkedin_id",
      "location_name",
      "headline",
      "skills",
      "photo_url",
    ],
  };

  const response = await fetch(`${PDL_BASE}/person/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": getPdlKey(),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 404) {
    return { people: [], total: 0 };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PDL person search failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  return {
    total: data.total ?? 0,
    people: (data.data ?? []).map((p: Record<string, unknown>) => ({
      id: (p.id as string) ?? "",
      fullName: (p.full_name as string) ?? "",
      firstName: (p.first_name as string) ?? "",
      lastName: (p.last_name as string) ?? "",
      jobTitle: (p.job_title as string) ?? "",
      jobTitleRole: (p.job_title_role as string) ?? null,
      jobTitleSubRole: (p.job_title_sub_role as string) ?? null,
      jobTitleLevels: (p.job_title_levels as string[]) ?? [],
      linkedinUrl: (p.linkedin_url as string) ?? null,
      linkedinId: (p.linkedin_id as string) ?? null,
      location: (p.location_name as string) ?? null,
      headline: (p.headline as string) ?? null,
      skills: (p.skills as string[]) ?? [],
      photoUrl: (p.photo_url as string) ?? null,
    })),
  };
}

// ─── Person Enrichment ────────────────────────────────────

/**
 * Enrich a person using PDL.
 * Used when adding experts to the platform — pulls job history, skills, education.
 * Requires at least name + company, or LinkedIn URL, or email.
 */
export async function enrichPerson(params: {
  name?: string;
  companyName?: string;
  companyWebsite?: string;
  linkedinUrl?: string;
  email?: string;
}): Promise<PdlPerson | null> {
  const query = new URLSearchParams();
  query.set("api_key", getPdlKey());
  query.set("titlecase", "true");

  if (params.name) {
    // Split into first/last for better matching
    const parts = params.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      query.set("first_name", parts[0]);
      query.set("last_name", parts.slice(1).join(" "));
    } else {
      query.set("name", params.name);
    }
  }
  if (params.companyName) query.set("company", params.companyName);
  if (params.companyWebsite) query.set("company_domain", params.companyWebsite);
  if (params.linkedinUrl) query.set("profile", params.linkedinUrl);
  if (params.email) query.set("email", params.email);

  const response = await fetch(
    `${PDL_BASE}/person/enrich?${query.toString()}`,
    { method: "GET" }
  );

  if (response.status === 404) {
    console.log(`[PDL] No person match found for ${JSON.stringify(params)}`);
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `PDL person enrichment failed: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.json();
  // PDL wraps person data inside { status, likelihood, data: { ...fields } }
  const data = raw.data ?? raw;

  return {
    id: data.id ?? "",
    fullName: data.full_name ?? "",
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    linkedinUrl: data.linkedin_url ?? null,
    headline: data.headline ?? "",
    summary: data.summary ?? "",
    industry: data.industry ?? "",
    jobTitle: data.job_title ?? "",
    jobCompanyName: data.job_company_name ?? "",
    jobCompanyWebsite: data.job_company_website ?? null,
    jobTitleLevels: data.job_title_levels ?? [],
    jobTitleClass: data.job_title_class ?? null,
    location: data.location_name
      ? {
          name: data.location_name ?? "",
          locality: data.location_locality ?? "",
          region: data.location_region ?? "",
          country: data.location_country ?? "",
        }
      : null,
    skills: data.skills ?? [],
    experience: (data.experience ?? []).map(
      (exp: Record<string, unknown>) => ({
        company: {
          name: (exp.company as Record<string, unknown>)?.name ?? "",
          website: (exp.company as Record<string, unknown>)?.website ?? null,
          industry: (exp.company as Record<string, unknown>)?.industry ?? null,
          size: (exp.company as Record<string, unknown>)?.size ?? null,
        },
        title: (exp.title as Record<string, unknown>)?.name ?? exp.title ?? "",
        startDate: exp.start_date ?? null,
        endDate: exp.end_date ?? null,
        isCurrent: exp.is_primary ?? false,
        summary: exp.summary ?? null,
        locationName: exp.location_name ?? null,
      })
    ),
    education: (data.education ?? []).map(
      (edu: Record<string, unknown>) => ({
        school: {
          name: (edu.school as Record<string, unknown>)?.name ?? "",
          website: (edu.school as Record<string, unknown>)?.website ?? null,
        },
        degrees: edu.degrees ?? [],
        majors: edu.majors ?? [],
        startDate: edu.start_date ?? null,
        endDate: edu.end_date ?? null,
      })
    ),
    likelihood: raw.likelihood ?? data.likelihood ?? 0,
  };
}
