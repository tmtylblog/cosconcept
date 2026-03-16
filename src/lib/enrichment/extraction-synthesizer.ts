/**
 * Phase 3: Extraction Synthesis
 *
 * Merges all extractions from Phase 1 (homepage) + Phase 2 (sub-pages)
 * into a single DeepCrawlResult. Purely programmatic — no LLM calls.
 *
 * Operations:
 * - Deduplicate offerings by normalized name, keep richest descriptions
 * - Merge evidence of work, deduplicate by title similarity
 * - Consolidate client signals with confidence scoring
 * - Deduplicate team members by name
 * - Collect case study URLs for downstream deep ingestion
 */

import type { FirmIntelligence } from "./firm-intelligence";
import type { UnifiedPageExtraction } from "./targeted-extractor";
import type { JinaScrapeResult } from "./jina-scraper";
import type {
  DeepCrawlResult,
  CrawledPage,
  ExtractedService,
  ExtractedCaseStudy,
  ExtractedTeamMember,
} from "./deep-crawler";
import type { ClientSignal, ClientSource } from "./client-extractor";

// ─── Confidence map for client signal contexts ──────────────

const CONTEXT_CONFIDENCE: Record<string, number> = {
  case_study: 0.9,
  client_list: 0.85,
  logo_section: 0.8,
  testimonial: 0.7,
  body_mention: 0.5,
};

const CONTEXT_TO_SOURCE: Record<string, ClientSource> = {
  case_study: "case_study_ai",
  client_list: "client_section",
  logo_section: "logo_alt",
  testimonial: "testimonial",
  body_mention: "case_study_title",
};

// ─── Main Function ──────────────────────────────────────────

export function synthesizeExtractions(params: {
  firmId: string;
  domain: string;
  intelligence: FirmIntelligence;
  pageExtractions: Array<{ url: string; extraction: UnifiedPageExtraction }>;
  pages: CrawledPage[];
  rawContent: string;
  startTime: number;
}): DeepCrawlResult {
  const { firmId, domain, intelligence, pageExtractions, pages, rawContent, startTime } = params;

  // ── Offerings ───────────────────────────────────────────
  const allOfferings: ExtractedService[] = [];

  // From Phase 1 homepage
  for (const o of intelligence.homepageExtractions.offerings) {
    allOfferings.push({
      name: o.name,
      description: o.description,
      subServices: o.solutions,
      offeringType: o.offeringType,
      skills: o.skills,
      industries: o.industries,
    });
  }

  // From Phase 2 pages
  for (const { extraction } of pageExtractions) {
    for (const o of extraction.offerings) {
      allOfferings.push({
        name: o.name,
        description: o.description,
        subServices: o.solutions,
        offeringType: o.offeringType,
        skills: o.skills,
        industries: o.industries,
      });
    }
  }

  const services = deduplicateOfferings(allOfferings);

  // ── Evidence of Work ────────────────────────────────────
  const allEvidence: ExtractedCaseStudy[] = [];

  // From Phase 1 homepage
  for (const e of intelligence.homepageExtractions.evidenceOfWork) {
    allEvidence.push({
      title: e.title,
      clientName: e.clientName,
      outcomes: e.outcome ? [e.outcome] : [],
      servicesUsed: [],
      skills: [],
      industries: [],
      sourceUrl: e.sourceUrl || "",
    });
  }

  // From Phase 2 pages
  for (const { url, extraction } of pageExtractions) {
    for (const e of extraction.evidenceOfWork) {
      allEvidence.push({
        title: e.title,
        clientName: e.clientName,
        challenge: e.challenge,
        solution: e.solution,
        outcomes: e.outcomes,
        servicesUsed: e.servicesUsed,
        skills: e.skills,
        industries: e.industries,
        sourceUrl: url,
      });
    }
  }

  const caseStudies = deduplicateCaseStudies(allEvidence);

  // ── Client Signals ──────────────────────────────────────
  const allClientSignals: ClientSignal[] = [];

  // From Phase 1 homepage
  for (const name of intelligence.homepageExtractions.clientSignals) {
    allClientSignals.push({
      name,
      confidence: 0.75, // homepage mentions are moderate confidence
      source: "client_section",
    });
  }

  // From Phase 2 pages
  for (const { extraction } of pageExtractions) {
    for (const cs of extraction.clientSignals) {
      const confidence = CONTEXT_CONFIDENCE[cs.context] ?? 0.5;
      const source = CONTEXT_TO_SOURCE[cs.context] ?? "case_study_title";
      allClientSignals.push({ name: cs.name, confidence, source });
    }
  }

  // Also extract client names from case studies
  for (const cs of caseStudies) {
    if (cs.clientName) {
      allClientSignals.push({
        name: cs.clientName,
        confidence: 0.9,
        source: "case_study_ai",
      });
    }
  }

  const mergedClients = mergeClientSignals(allClientSignals);
  const clients = mergedClients.map((s) => s.name);

  // ── Team Members ────────────────────────────────────────
  const allTeam: ExtractedTeamMember[] = [];

  for (const tm of intelligence.homepageExtractions.teamMentions) {
    allTeam.push({ name: tm.name, role: tm.role });
  }

  for (const { extraction } of pageExtractions) {
    for (const tm of extraction.teamMembers) {
      allTeam.push({
        name: tm.name,
        role: tm.role,
        linkedinUrl: tm.linkedinUrl,
        bio: tm.bio,
      });
    }
  }

  const teamMembers = deduplicateTeam(allTeam);

  // ── Case Study URLs ─────────────────────────────────────
  const caseStudyUrlSet = new Set<string>();

  // Collect offering URLs so we don't ingest service pages as case studies
  const offeringPageUrls = new Set<string>();
  for (const item of params.intelligence.scrapePlan) {
    if (item.expectedContent === "offerings") {
      offeringPageUrls.add(item.url);
    }
  }

  // From case studies that have source URLs
  for (const cs of caseStudies) {
    if (cs.sourceUrl && cs.sourceUrl.startsWith("http")) {
      caseStudyUrlSet.add(cs.sourceUrl);
    }
  }

  // From Phase 2 extracted links
  for (const { extraction } of pageExtractions) {
    for (const link of extraction.caseStudyLinks) {
      if (link.startsWith("http")) {
        caseStudyUrlSet.add(link);
      }
    }
  }

  // From Phase 1 evidence sourceUrls
  for (const e of intelligence.homepageExtractions.evidenceOfWork) {
    if (e.sourceUrl && e.sourceUrl.startsWith("http")) {
      caseStudyUrlSet.add(e.sourceUrl);
    }
  }

  // Filter out URLs that are clearly NOT case studies
  const caseStudyUrls = [...caseStudyUrlSet]
    .filter((url) => {
      const lower = url.toLowerCase();
      // Exclude blog posts (but not /blog/ listing page itself used by WordPress for case studies)
      if (/\/blog\/[^/]+/.test(lower)) return false;
      // Exclude common blog variants
      if (/\/(news|insights|perspectives|articles|posts)\/[^/]+/.test(lower)) return false;
      // Exclude team/person profile pages
      if (/\/(team|people|leadership|our-team|our-collective|staff|experts?|authors?)\//i.test(lower)) return false;
      // Exclude individual person profile pages (common WordPress pattern: /first-last/ with no other path)
      // But be careful not to exclude case study slugs
      if (/\/(about|contact|careers|jobs|privacy|terms|legal|faq|login|signup|pricing)\b/i.test(lower)) return false;
      // Exclude service/offering pages that we already captured
      if (offeringPageUrls.has(url)) return false;
      // Exclude pages with service-like URL patterns
      if (/\/(services|our-services|capabilities|solutions|our-approach|our-practices|practices)\//i.test(lower)) return false;
      return true;
    })
    .slice(0, 500);

  // ── About Pitch ─────────────────────────────────────────
  const aboutPitch = intelligence.understanding.summary || "";

  // ── Build Result ────────────────────────────────────────
  return {
    firmId,
    domain,
    pages,
    extracted: {
      caseStudies,
      teamMembers,
      services,
      clients,
      clientSignals: mergedClients,
      aboutPitch,
      caseStudyUrls,
      clientsNdaProtected: false, // TODO: detect from content
    },
    rawContent,
    stats: {
      urlsDiscovered: pages.length,
      pagesCrawled: pages.length,
      pagesClassified: pages.length,
      durationMs: Date.now() - startTime,
    },
  };
}

// ─── Deduplication Helpers ──────────────────────────────────

function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/** Check if two offering names refer to the same thing */
function isSameOffering(a: string, b: string): boolean {
  const normA = normalizeForDedup(a);
  const normB = normalizeForDedup(b);
  if (normA === normB) return true;
  // One contains the other: "Brand" matches "Brand Strategy & Positioning"
  if (normA.includes(normB) || normB.includes(normA)) return true;
  // Handle parenthetical variants: "Experience (Customer Experience)" → "Customer Experience"
  const stripParens = (s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
  if (stripParens(a) === stripParens(b)) return true;
  // Handle "X Practice Area" → "X"
  const stripSuffix = (s: string) => s.replace(/\s*(practice area|services?|solutions?|group|division|pod)\s*$/i, "").trim().toLowerCase();
  if (stripSuffix(a) === stripSuffix(b)) return true;
  if (normalizeForDedup(stripSuffix(a)) === normB || normA === normalizeForDedup(stripSuffix(b))) return true;
  return false;
}

function deduplicateOfferings(offerings: ExtractedService[]): ExtractedService[] {
  const result: ExtractedService[] = [];

  for (const o of offerings) {
    if (!o.name || o.name.length < 2 || o.name.length > 100) continue;
    // Skip vague navigation-like entries
    if (/^(lead|deliver|recruit)$/i.test(o.name) && !o.description) continue;

    // Find existing match
    const existingIdx = result.findIndex((r) => isSameOffering(r.name, o.name));

    if (existingIdx === -1) {
      result.push(o);
    } else {
      const existing = result[existingIdx];
      // Merge: keep the version with the better description, merge sub-items
      const merged: ExtractedService = {
        // Prefer the more specific name (longer but not overly long)
        name: o.name.length > existing.name.length && o.name.length < 60 ? o.name : existing.name,
        // Prefer the longer/richer description
        description: (o.description?.length ?? 0) > (existing.description?.length ?? 0) ? o.description : existing.description,
        subServices: mergeArrays(existing.subServices, o.subServices),
        // Prefer "solution" over "service" if either says so
        offeringType: o.offeringType === "solution" || existing.offeringType === "solution" ? "solution" : existing.offeringType,
        skills: mergeArrays(existing.skills ?? [], o.skills ?? []),
        industries: mergeArrays(existing.industries ?? [], o.industries ?? []),
      };
      result[existingIdx] = merged;
    }
  }

  return result.slice(0, 30);
}

function deduplicateCaseStudies(studies: ExtractedCaseStudy[]): ExtractedCaseStudy[] {
  const seen = new Map<string, ExtractedCaseStudy>();

  for (const cs of studies) {
    if (!cs.title) continue;
    const key = normalizeForDedup(cs.title);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, cs);
    } else {
      // Merge fields from duplicate
      seen.set(key, {
        ...existing,
        clientName: existing.clientName || cs.clientName,
        challenge: existing.challenge || cs.challenge,
        solution: existing.solution || cs.solution,
        outcomes: mergeArrays(existing.outcomes, cs.outcomes),
        servicesUsed: mergeArrays(existing.servicesUsed, cs.servicesUsed),
        skills: mergeArrays(existing.skills, cs.skills),
        industries: mergeArrays(existing.industries, cs.industries),
      });
    }
  }

  return [...seen.values()].slice(0, 50);
}

function deduplicateTeam(members: ExtractedTeamMember[]): ExtractedTeamMember[] {
  const seen = new Map<string, ExtractedTeamMember>();

  for (const m of members) {
    if (!m.name || m.name.split(" ").length < 2) continue; // Skip single-word names
    const key = normalizeForDedup(m.name);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, m);
    } else {
      // Keep the richer version
      seen.set(key, {
        name: existing.name.length >= m.name.length ? existing.name : m.name,
        role: existing.role || m.role,
        linkedinUrl: existing.linkedinUrl || m.linkedinUrl,
        bio: (existing.bio?.length ?? 0) >= (m.bio?.length ?? 0) ? existing.bio : m.bio,
      });
    }
  }

  return [...seen.values()].slice(0, 50);
}

function mergeClientSignals(signals: ClientSignal[]): ClientSignal[] {
  if (signals.length === 0) return [];

  // Group by normalized name
  const groups = new Map<string, ClientSignal[]>();
  for (const signal of signals) {
    const key = normalizeForDedup(signal.name);
    if (!key || key.length < 2) continue;
    const existing = groups.get(key) || [];
    existing.push(signal);
    groups.set(key, existing);
  }

  // Score each group
  const scored: ClientSignal[] = [];
  for (const [, groupSignals] of groups) {
    const bestName = groupSignals.reduce((best, s) =>
      s.name.length > best.name.length ? s : best
    ).name;

    const uniqueSources = new Set(groupSignals.map((s) => s.source)).size;
    const maxConfidence = Math.max(...groupSignals.map((s) => s.confidence));
    const finalConfidence = Math.min(1.0, maxConfidence + 0.1 * (uniqueSources - 1));

    const bestSource = groupSignals.reduce((best, s) =>
      s.confidence > best.confidence ? s : best
    ).source;

    scored.push({ name: bestName, confidence: finalConfidence, source: bestSource });
  }

  return scored
    .filter((s) => s.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 30);
}

function mergeArrays(a: string[], b: string[]): string[] {
  const set = new Set([...a, ...b]);
  return [...set];
}
