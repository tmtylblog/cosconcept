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
  /** Firm size band (micro, small, medium, large) */
  sizeBand?: string;
  /** Minimum match score threshold (0-1) */
  minScore?: number;
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
  firmId: string;
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
    employeeCount?: number;
    website?: string;
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
}
