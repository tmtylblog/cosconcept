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
      subServices: o.subItems,
    });
  }

  // From Phase 2 pages
  for (const { extraction } of pageExtractions) {
    for (const o of extraction.offerings) {
      allOfferings.push({
        name: o.name,
        description: o.description,
        subServices: o.subItems,
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

  const caseStudyUrls = [...caseStudyUrlSet].slice(0, 50);

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

function deduplicateOfferings(offerings: ExtractedService[]): ExtractedService[] {
  const seen = new Map<string, ExtractedService>();

  for (const o of offerings) {
    if (!o.name || o.name.length < 2) continue;
    const key = normalizeForDedup(o.name);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, o);
    } else {
      // Keep the richer version
      if ((o.description?.length ?? 0) > (existing.description?.length ?? 0)) {
        seen.set(key, { ...o, subServices: mergeArrays(existing.subServices, o.subServices) });
      } else {
        seen.set(key, { ...existing, subServices: mergeArrays(existing.subServices, o.subServices) });
      }
    }
  }

  return [...seen.values()].filter((o) => o.name.length < 100).slice(0, 30);
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
