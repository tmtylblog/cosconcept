/**
 * Matching Engine Types
 *
 * Shared types for the three-layer cascading search:
 * Layer 1: Structured filtering (Neo4j + PostgreSQL)
 * Layer 2: Vector similarity (pgvector)
 * Layer 3: LLM deep ranking (Gemini Pro)
 */

// ─── Search Query ──────────────────────────────────────────

export interface SearchQuery {
  /** Raw natural language query from the user */
  rawQuery: string;
  /** Parsed structured filters */
  filters: SearchFilters;
  /** The searching firm's ID (for bidirectional matching) */
  searcherFirmId?: string;
  /** The searching firm's profile (for relevance scoring) */
  searcherProfile?: AbstractionProfile;
}

export interface SearchFilters {
  /** L2 skill names from taxonomy */
  skills?: string[];
  /** Industry verticals */
  industries?: string[];
  /** Geographic markets */
  markets?: string[];
  /** Firm categories (from 30 COS categories) */
  categories?: string[];
  /** Service keywords — partial-matched against Service.name via OFFERS_SERVICE edges */
  services?: string[];
  /** Firm size band (micro, small, medium, large) */
  sizeBand?: string;
  /** Languages spoken (e.g., "Spanish", "Mandarin") */
  languages?: string[];
  /** Minimum match score threshold (0-1) */
  minScore?: number;
  /** Restrict results to a specific entity type */
  entityType?: "firm" | "expert" | "case_study";
}

// ─── Abstraction Profile ───────────────────────────────────

export interface AbstractionProfile {
  id: string;
  entityType: "firm" | "expert" | "case_study";
  entityId: string;
  /** AI-generated 200-word normalized summary */
  hiddenNarrative: string;
  /** Top services this entity offers */
  topServices: string[];
  /** Top skills demonstrated */
  topSkills: string[];
  /** Industries served */
  topIndustries: string[];
  /** Typical client profile description */
  typicalClientProfile: string;
  /** Partnership readiness signals */
  partnershipReadiness: {
    openToPartnerships: boolean;
    preferredPartnerTypes: string[];
    partnershipGoals: string[];
  };
  /** Per-dimension confidence scores */
  confidenceScores: {
    services: number;
    skills: number;
    industries: number;
    clientProfile: number;
    overall: number;
  };
  /** What evidence was used */
  evidenceSources: {
    caseStudyCount: number;
    expertCount: number;
    websitePages: number;
    pdlAvailable: boolean;
  };
  /** 1536-dim OpenAI embedding (stored in pgvector) */
  embedding?: number[];
}

// ─── Match Result ──────────────────────────────────────────

export interface MatchCandidate {
  /** What kind of entity this result represents */
  entityType: "firm" | "expert" | "case_study";
  /** Neo4j node ID for the entity */
  entityId: string;
  /** Human-readable name / title */
  displayName: string;
  /** @deprecated use entityId — kept for backward compatibility */
  firmId: string;
  /** @deprecated use displayName — kept for backward compatibility */
  firmName: string;
  /** Combined score from all layers */
  totalScore: number;
  /** Layer 1 structured match score */
  structuredScore: number;
  /** Layer 2 vector similarity score */
  vectorScore: number;
  /** Layer 3 LLM ranking score */
  llmScore?: number;
  /** Why this match works (from LLM) */
  matchExplanation?: string;
  /** Bidirectional fit: does the other firm want what we offer? */
  bidirectionalFit?: {
    theyWantUs: number;
    weWantThem: number;
  };
  /** Key data for display */
  preview: {
    categories: string[];
    topServices: string[];
    topSkills: string[];
    industries: string[];
    markets?: string[];
    /** For firm: website URL; for expert: firm they work at; for case_study: client name */
    subtitle?: string;
    employeeCount?: number;
    website?: string;
    /** Expert + firm: number of associated case studies */
    caseStudyCount?: number;
    /** Expert: number of specialist profiles */
    specialistProfileCount?: number;
    /** Expert: title from first specialist profile */
    primarySpecialistTitle?: string;
    /** Expert + case study: name of associated firm */
    firmName?: string;
    /** Expert: spoken languages */
    languages?: string[];
    /** Case study: number of contributing persons */
    contributorCount?: number;
    /** Firm: team collective experience summary (notable companies worked at) */
    teamExperience?: string;
  };
}

export interface SearchResult {
  query: SearchQuery;
  candidates: MatchCandidate[];
  stats: {
    layer1Candidates: number;
    layer2Candidates: number;
    layer3Ranked: number;
    totalDurationMs: number;
    estimatedCostUsd: number;
  };
  /** Only present when debug: true is passed to executeSearch() */
  debugLayers?: {
    layer1: { count: number; topCandidates: MatchCandidate[] };
    layer2: { count: number; topCandidates: MatchCandidate[] };
    layer3: { count: number; results: MatchCandidate[] };
    parsedFilters: SearchFilters;
  };
}
