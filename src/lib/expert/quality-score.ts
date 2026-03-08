/**
 * Specialist Profile Quality Scorer
 *
 * Pure function — runs client-side (live preview) AND server-side (on save).
 * No imports from server-only modules.
 *
 * Point breakdown (100 total):
 *  15 pts — title is non-empty
 *  20 pts — bodyDescription >= 100 chars
 *   5 pts — bodyDescription >= 300 chars (bonus for depth)
 *  10 pts — has 1+ examples
 *  10 pts — has 2+ examples
 *  10 pts — has 3+ examples
 *   5 pts ea — each example has BOTH title AND subject filled (max 15 pts)
 *  15 pts — story coherence: ≥2/3 examples share industry/theme keywords with profile
 *
 * Buckets:
 *  80–100 → 'strong'     — searchable, eligible as primary face in search
 *  50–79  → 'partial'    — visible on profile, excluded from search
 *  20–49  → 'weak'       — shown with warning, not searchable
 *   0–19  → 'incomplete' — hidden from all views except editor
 */

export type QualityStatus = "strong" | "partial" | "weak" | "incomplete";

export interface ScoredExample {
  title?: string | null;
  subject?: string | null;
  companyIndustry?: string | null;
}

export interface ScoreInput {
  title?: string | null;
  bodyDescription?: string | null;
  industries?: string[] | null;
  examples?: ScoredExample[];
}

export interface ScoreResult {
  score: number;
  status: QualityStatus;
  breakdown: {
    title: number;
    bodyLength: number;
    bodyDepth: number;
    example1: number;
    example2: number;
    example3: number;
    exampleCompleteness: number;
    coherence: number;
  };
  hints: string[];
}

export function scoreSpecialistProfile(input: ScoreInput): ScoreResult {
  const { title, bodyDescription, industries = [], examples = [] } = input;

  const breakdown = {
    title: 0,
    bodyLength: 0,
    bodyDepth: 0,
    example1: 0,
    example2: 0,
    example3: 0,
    exampleCompleteness: 0,
    coherence: 0,
  };

  const hints: string[] = [];

  // 15 pts — title non-empty
  if (title?.trim()) {
    breakdown.title = 15;
  } else {
    hints.push("Add a specialist title (e.g. \"Fractional CMO for B2B SaaS\")");
  }

  // 20 pts — bodyDescription >= 100 chars
  const bodyLen = bodyDescription?.trim().length ?? 0;
  if (bodyLen >= 100) {
    breakdown.bodyLength = 20;
  } else {
    hints.push(`Description needs ${100 - bodyLen} more characters (minimum 100)`);
  }

  // 5 pts — bodyDescription >= 300 chars (bonus)
  if (bodyLen >= 300) {
    breakdown.bodyDepth = 5;
  } else if (bodyLen >= 100) {
    hints.push("Add more detail to your description (300+ chars earns a bonus)");
  }

  // 10 pts each for 1st, 2nd, 3rd example existing
  if (examples.length >= 1) breakdown.example1 = 10;
  else hints.push("Add at least one work example");

  if (examples.length >= 2) breakdown.example2 = 10;
  else if (examples.length >= 1) hints.push("Add a second work example for more credibility");

  if (examples.length >= 3) breakdown.example3 = 10;
  else if (examples.length >= 2) hints.push("Add a third work example to reach maximum score");

  // 5 pts each — example has BOTH title AND subject (max 15 pts)
  let completenessPoints = 0;
  for (const ex of examples.slice(0, 3)) {
    if (ex.title?.trim() && ex.subject?.trim()) {
      completenessPoints += 5;
    } else if (examples.indexOf(ex) < examples.length) {
      hints.push(`Fill in both title and description for example ${examples.indexOf(ex) + 1}`);
    }
  }
  breakdown.exampleCompleteness = Math.min(completenessPoints, 15);

  // 15 pts — coherence: ≥2/3 examples share industry/theme keywords with profile
  breakdown.coherence = computeCoherence(title, industries ?? [], examples);
  if (breakdown.coherence === 0 && examples.length >= 2) {
    hints.push("Your examples don't clearly align with your stated industries/specialty — add context");
  } else if (breakdown.coherence < 15 && examples.length >= 2) {
    hints.push("More of your examples should connect to your specialty area");
  }

  const score = Math.min(
    100,
    breakdown.title +
      breakdown.bodyLength +
      breakdown.bodyDepth +
      breakdown.example1 +
      breakdown.example2 +
      breakdown.example3 +
      breakdown.exampleCompleteness +
      breakdown.coherence
  );

  const status = scoreToStatus(score);

  return { score, status, breakdown, hints };
}

function scoreToStatus(score: number): QualityStatus {
  if (score >= 80) return "strong";
  if (score >= 50) return "partial";
  if (score >= 20) return "weak";
  return "incomplete";
}

/**
 * Coherence heuristic: extract keyword set from title + industries[].
 * Check how many of the examples share those keywords in subject, companyIndustry, or example title.
 * 2+ matches → 15 pts; 1 match → 7 pts; 0 → 0 pts.
 */
function computeCoherence(
  profileTitle: string | null | undefined,
  industries: string[],
  examples: ScoredExample[]
): number {
  if (examples.length < 2) return 0;

  // Build keyword set from profile title + industries
  const titleWords = tokenize(profileTitle ?? "");
  const industryWords = industries.flatMap((ind) => tokenize(ind));
  const keywords = new Set([...titleWords, ...industryWords]);

  if (keywords.size === 0) return 0;

  // Count examples that match at least one keyword
  let matchCount = 0;
  for (const ex of examples.slice(0, 3)) {
    const exWords = new Set([
      ...tokenize(ex.title ?? ""),
      ...tokenize(ex.subject ?? ""),
      ...tokenize(ex.companyIndustry ?? ""),
    ]);
    const hasMatch = [...keywords].some((kw) => exWords.has(kw));
    if (hasMatch) matchCount++;
  }

  if (matchCount >= 2) return 15;
  if (matchCount >= 1) return 7;
  return 0;
}

/** Tokenize a string into lowercase words, filtering stop words */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "for", "in", "of", "to", "at",
    "with", "by", "on", "as", "is", "it", "its", "was", "be",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}
