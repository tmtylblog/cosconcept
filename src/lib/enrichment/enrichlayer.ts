/**
 * EnrichLayer.com — Cheaper person enrichment provider.
 *
 * Used as PRIMARY provider for person enrichment (work history),
 * with PDL as fallback when EnrichLayer has no credits or no match.
 *
 * Base URL: https://enrichlayer.com/api/v2
 * Auth: Authorization: Bearer <ENRICHLAYER_API_KEY>
 * Pricing: ~$0.02/lookup vs PDL's $0.28/lookup
 *
 * Error codes:
 * - 404: Not found (no charge)
 * - 403: No credits remaining (no charge)
 * - 429: Rate limit exceeded
 */

import type { PdlPerson, PdlExperience, PdlEducation } from "./pdl";

const ENRICHLAYER_BASE = "https://enrichlayer.com/api/v2";

function getEnrichLayerKey(): string {
  const key = process.env.ENRICHLAYER_API_KEY;
  if (!key) throw new Error("ENRICHLAYER_API_KEY is not configured");
  return key;
}

// ─── Raw API Types ───────────────────────────────────────

interface EnrichLayerExperience {
  company_name?: string;
  company_domain?: string;
  company_industry?: string;
  company_size?: string;
  title?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  description?: string;
  location?: string;
}

interface EnrichLayerEducation {
  school_name?: string;
  school_domain?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
}

interface EnrichLayerPerson {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  headline?: string;
  summary?: string;
  industry?: string;
  job_title?: string;
  job_company_name?: string;
  job_company_domain?: string;
  location_name?: string;
  location_country?: string;
  location_region?: string;
  location_locality?: string;
  skills?: string[];
  experience?: EnrichLayerExperience[];
  education?: EnrichLayerEducation[];
}

// ─── Error Types ─────────────────────────────────────────

export class EnrichLayerNoCreditsError extends Error {
  constructor() {
    super("EnrichLayer: No credits remaining (403)");
    this.name = "EnrichLayerNoCreditsError";
  }
}

export class EnrichLayerRateLimitError extends Error {
  constructor() {
    super("EnrichLayer: Rate limit exceeded (429)");
    this.name = "EnrichLayerRateLimitError";
  }
}

// ─── Person Lookup ───────────────────────────────────────

/**
 * Look up a person via EnrichLayer.
 * Returns raw response or null on 404 (no charge).
 * Throws typed error on 403 (no credits) and 429 (rate limit).
 */
export async function enrichLayerPerson(params: {
  linkedinUrl?: string;
  name?: string;
  company?: string;
}): Promise<EnrichLayerPerson | null> {
  const key = getEnrichLayerKey();

  const query = new URLSearchParams();
  query.set("use_cache", "if-recent");

  if (params.linkedinUrl) query.set("linkedin_url", params.linkedinUrl);
  if (params.name) query.set("name", params.name);
  if (params.company) query.set("company", params.company);

  if (!params.linkedinUrl && !params.name) {
    throw new Error("EnrichLayer requires linkedinUrl or name");
  }

  const response = await fetch(
    `${ENRICHLAYER_BASE}/person/enrich?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    }
  );

  if (response.status === 404) {
    console.log(`[EnrichLayer] No person match for ${JSON.stringify(params)}`);
    return null;
  }

  if (response.status === 403) {
    throw new EnrichLayerNoCreditsError();
  }

  if (response.status === 429) {
    throw new EnrichLayerRateLimitError();
  }

  if (!response.ok) {
    throw new Error(
      `EnrichLayer person lookup failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return (data.data ?? data) as EnrichLayerPerson;
}

// ─── Normalize to PdlPerson ─────────────────────────────

/**
 * Maps EnrichLayer response to the PdlPerson interface used throughout the codebase.
 * This allows downstream consumers to remain provider-agnostic.
 */
export function normalizeToEnrichedPerson(raw: EnrichLayerPerson): PdlPerson {
  const experience: PdlExperience[] = (raw.experience ?? []).map((exp) => ({
    company: {
      name: exp.company_name ?? "",
      website: exp.company_domain ?? null,
      industry: exp.company_industry ?? null,
      size: exp.company_size ?? null,
    },
    title: exp.title ?? "",
    startDate: exp.start_date ?? null,
    endDate: exp.end_date ?? null,
    isCurrent: exp.is_current ?? false,
    summary: exp.description ?? null,
    locationName: exp.location ?? null,
  }));

  const education: PdlEducation[] = (raw.education ?? []).map((edu) => ({
    school: {
      name: edu.school_name ?? "",
      website: edu.school_domain ?? null,
    },
    degrees: edu.degree ? [edu.degree] : [],
    majors: edu.field_of_study ? [edu.field_of_study] : [],
    startDate: edu.start_date ?? null,
    endDate: edu.end_date ?? null,
  }));

  return {
    id: raw.id ?? "",
    fullName: raw.full_name ?? "",
    firstName: raw.first_name ?? "",
    lastName: raw.last_name ?? "",
    linkedinUrl: raw.linkedin_url ?? null,
    headline: raw.headline ?? "",
    summary: raw.summary ?? "",
    industry: raw.industry ?? "",
    jobTitle: raw.job_title ?? "",
    jobCompanyName: raw.job_company_name ?? "",
    jobCompanyWebsite: raw.job_company_domain ?? null,
    jobTitleLevels: [],
    jobTitleClass: null,
    location: raw.location_name
      ? {
          name: raw.location_name ?? "",
          locality: raw.location_locality ?? "",
          region: raw.location_region ?? "",
          country: raw.location_country ?? "",
        }
      : null,
    skills: raw.skills ?? [],
    experience,
    education,
    likelihood: 0,
  };
}

// ─── Health Check ────────────────────────────────────────

/**
 * Check EnrichLayer connectivity and credit status.
 * Uses a lookup for a non-existent person (404 = free, no charge).
 */
export async function checkEnrichLayerHealth(): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const key = process.env.ENRICHLAYER_API_KEY;
    if (!key) {
      return { ok: false, message: "ENRICHLAYER_API_KEY not set", latencyMs: 0 };
    }

    const res = await fetch(
      `${ENRICHLAYER_BASE}/person/enrich?name=test_nonexistent_person_xyz&use_cache=if-recent`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      }
    );
    const latencyMs = Date.now() - start;

    if (res.status === 404) {
      return { ok: true, message: "Connected (test lookup returned 404 as expected)", latencyMs };
    }

    if (res.status === 403) {
      return { ok: false, message: "No credits remaining (403)", latencyMs };
    }

    if (res.status === 429) {
      return { ok: false, message: "Rate limited (429)", latencyMs };
    }

    return { ok: true, message: `Connected (HTTP ${res.status})`, latencyMs };
  } catch (err) {
    return { ok: false, message: String(err), latencyMs: Date.now() - start };
  }
}
