/**
 * COS Data Types — Canonical schemas for case studies and expert profiles.
 *
 * Case studies: COS does NOT store case study content. Case studies live
 * wherever they already live (website, Google Slides, PDFs, Google Drive).
 * COS discovers them, ingests/analyzes them, and adds the COS "perspective"
 * (taxonomy tags) that makes them indexable and matchable. We always link
 * back to the original source.
 */

// ─── Case Studies ─────────────────────────────────────────

export type CaseStudySourceType =
  | "website"
  | "google_slides"
  | "pdf"
  | "google_drive"
  | "other";

/**
 * A case study is a REFERENCE to an external source + the COS analysis.
 * The original content stays where it is — we just index it.
 */
export interface CaseStudy {
  /** Unique identifier */
  id: string;
  /** Title (extracted from the source) */
  title: string;
  /** URL to the original source (website page, Google Slides link, PDF, etc.) */
  sourceUrl: string;
  /** What kind of source this is */
  sourceType: CaseStudySourceType;
  /** The firm that owns this case study */
  firmId?: string;
  /** When this case study was discovered (e.g., by Jina scrape) */
  discoveredAt: string;
  /** When COS finished ingesting and analyzing this case study (null = pending) */
  ingestedAt: string | null;
  /** COS analysis — taxonomy tags that make it indexable. Null until ingested. */
  cosAnalysis: CaseStudyCosAnalysis | null;
}

/** The COS "perspective" on a case study — what makes it searchable/matchable */
export interface CaseStudyCosAnalysis {
  /** AI-generated 2-3 sentence summary */
  summary: string;
  /** Client mentioned (if identifiable) */
  clientMentioned: string | null;
  /** Services demonstrated in this case study */
  services: string[];
  /** Skills demonstrated (L2 from COS taxonomy) */
  skills: string[];
  /** Industries relevant to this case study */
  industries: string[];
  /** Outcomes / results achieved */
  outcomes: string[];
  /** AI confidence score (0-1) */
  confidence: number;
}

// ─── Expert Profiles ──────────────────────────────────────
//
// Architecture: Overview + Specialist Sub-Profiles
//
// An Expert has ONE overview profile (the person: bio, job history, general info)
// and ZERO or MORE specialist profiles (focused expertise combos, like
// "Fractional CMO for SaaS" or "Brand Strategy for CPG").
//
// Each specialist profile is independently searchable and rankable —
// think of it as an SEO-optimized landing page for a specific expertise niche.
//
// Search logic:
//   1. If a specialist profile matches better → show the specialist
//   2. If no specialist profiles exist → show the overview
//   3. Specialist profiles are heavily weighted in search

export type ExpertDivision =
  | "Collective Member"
  | "Expert"
  | "Trusted Expert"
  | "Unknown";

/**
 * Expert = the PERSON (overview profile).
 * Contains identity info + general bio + optional specialist sub-profiles.
 */
export interface Expert {
  /** Unique identifier */
  id: string;
  /** Full name */
  name: string;
  /** Email address */
  email: string;
  /** Primary job title / role */
  role: string;
  /** General skills (union of all specialist skills + any extras) */
  skills: string[];
  /** General industries (union of all specialist industries + any extras) */
  industries: string[];
  /** Hourly rate in USD (null if not disclosed) */
  hourlyRate: number | null;
  /** Availability status (e.g., "Available", "Booked", "Part-time") */
  availability: string;
  /** Link to COS profile */
  profileUrl?: string;
  /** Profile photo URL */
  photoUrl?: string;
  /** Division category */
  division: ExpertDivision;
  /** Hex color code for division badge UI */
  divisionColor: string;
  /** LinkedIn URL */
  linkedinUrl?: string;
  /** Bio / summary (overview-level) */
  bio?: string;
  /** Location */
  location?: string;
  /** The firm this expert belongs to */
  firmId?: string;
  /** PDL expert tier classification */
  expertTier?: "expert" | "potential_expert" | "not_expert" | null;
  /** Whether this expert has been fully enriched (has work history from PDL) */
  isFullyEnriched?: boolean;
  /** Enrichment status: roster (basic PDL data) | enriched (full work history) */
  enrichmentStatus?: "roster" | "enriched";
  /** Roster status: active | prior | incorrect */
  rosterStatus?: "active" | "prior" | "incorrect";
  /** User ID if expert has claimed their profile */
  userId?: string | null;
  /** Last updated timestamp */
  updatedAt?: string | null;
  /** Specialist sub-profiles — focused expertise combos */
  specialistProfiles?: ExpertSpecialistProfile[];
}

/**
 * A specialist sub-profile is a focused "landing page" for a specific
 * expertise niche. Heavily weighted in search — if this profile is a
 * better match than the overview, COS shows this one.
 *
 * Example: Sarah Chen might have specialist profiles for:
 *   - "Fractional CMO for B2B SaaS"
 *   - "Go-to-Market Strategy for Fintech"
 */
export interface ExpertSpecialistProfile {
  /** Unique identifier for this specialist profile */
  id: string;
  /** Specialist title (e.g., "Fractional CMO for B2B SaaS") */
  title: string;
  /** Focused bio for this specialty */
  summary: string;
  /** 150–500 word description for this specialty (new field) */
  bodyDescription?: string;
  /** Skills specific to this specialty */
  skills: string[];
  /** Industries specific to this specialty */
  industries: string[];
  /** Services this specialist profile covers */
  services: string[];
  /** Quality score 0–100 (new field) */
  qualityScore?: number;
  /** Quality status bucket (new field) */
  qualityStatus?: "strong" | "partial" | "weak" | "incomplete";
  /** Whether this profile appears in search results (new field) */
  isSearchable?: boolean;
  /** Whether this is the primary face for search (new field) */
  isPrimary?: boolean;
  /** Source of the profile (new field) */
  source?: "ai_generated" | "user_created" | "ai_suggested_user_confirmed";
  /** Work examples proving the expertise (new field) */
  examples?: Array<{
    id?: string;
    title?: string;
    subject?: string;
    companyName?: string;
    companyIndustry?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }>;
  /** Case study IDs that demonstrate this specialty */
  relevantCaseStudyIds?: string[];
  /** SEO / search keywords for this specialty */
  searchKeywords?: string[];
}

// ─── Division color mapping ───────────────────────────────

export const DIVISION_COLORS: Record<ExpertDivision, string> = {
  "Collective Member": "#4A90E2",
  Expert: "#F5A623",
  "Trusted Expert": "#7ED321",
  Unknown: "#9B9B9B",
};

export function getDivisionColor(division: ExpertDivision): string {
  return DIVISION_COLORS[division] ?? DIVISION_COLORS.Unknown;
}

// ─── Legacy Case Study ────────────────────────────────────

/**
 * A case study from the legacy COS platform, imported from JSON.
 * Distinct from the enrichment-pipeline `CaseStudy` type which
 * has sourceUrl / cosAnalysis fields.
 */
export interface LegacyCaseStudy {
  /** Stable identifier (e.g., "legacy-cs-42") */
  id: string;
  /** Extracted title — from summary, HTML bold, first sentence, or client names */
  title: string;
  /** Plain-text body, HTML stripped, truncated to ~500 chars */
  aboutText: string;
  /** Publication status: "published" | "draft" */
  status: string;
  /** Tagged skills (e.g., "Performance Marketing", "SEO") */
  skills: string[];
  /** Tagged industries (e.g., "Health & Wellness", "E-Commerce") */
  industries: string[];
  /** Client company names (excluding the firm itself) */
  clients: string[];
  /** External links (presentation URLs, website links) */
  links: string[];
  /** Market country codes (e.g., "US", "GB") */
  markets: string[];
  /** Names of contributing experts */
  contributorNames: string[];
}
