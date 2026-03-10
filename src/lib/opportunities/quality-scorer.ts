/**
 * Lead Quality Scorer
 *
 * Hidden internal score (0–100). Not shown to partners — used for:
 * - Ranking leads in the admin dashboard
 * - Flagging weak leads before sharing
 * - Analytics on network health
 *
 * Tiers:
 *   Weak      40–59
 *   Adequate  60–74
 *   Good      75–89
 *   Strong    90–100
 */

export interface LeadQualityInput {
  title: string;
  description: string;
  evidence?: string | null;
  requiredCategories?: string[];
  requiredSkills?: string[];
  requiredIndustries?: string[];
  estimatedValue?: string | null;
  timeline?: string | null;
  clientDomain?: string | null;
  clientSizeBand?: string | null;
  clientType?: string | null;
  source?: string; // "call" | "email" | "manual"
  attachments?: { name: string; url?: string; type?: string; size?: number }[];
}

export interface LeadQualityResult {
  score: number; // 0–100
  tier: "weak" | "adequate" | "good" | "strong";
  breakdown: Record<string, number>;
}

export function scoreLeadQuality(lead: LeadQualityInput): LeadQualityResult {
  const breakdown: Record<string, number> = {};

  // ── Minimum bar (must-haves) ──────────────────────────
  // Title: always present (required field) — baseline credit
  breakdown.title = 10;

  // Description: meaningful length signals real context
  const descLen = lead.description?.trim().length ?? 0;
  breakdown.description = descLen >= 100 ? 15 : descLen >= 50 ? 8 : 3;

  // At least one category specified
  breakdown.categories = (lead.requiredCategories?.length ?? 0) > 0 ? 8 : 0;

  // At least one skill
  breakdown.skills = (lead.requiredSkills?.length ?? 0) > 0 ? 7 : 0;

  // ── Quality boosters ──────────────────────────────────
  // Evidence quote (the actual signal from the source)
  const evidenceLen = lead.evidence?.trim().length ?? 0;
  breakdown.evidence = evidenceLen >= 20 ? 10 : evidenceLen > 0 ? 4 : 0;

  // Industry context
  breakdown.industries = (lead.requiredIndustries?.length ?? 0) > 0 ? 5 : 0;

  // Budget range — strong signal of real intent
  breakdown.estimatedValue = lead.estimatedValue ? 10 : 0;

  // Timeline — urgency signal
  breakdown.timeline = lead.timeline && lead.timeline !== "exploratory" ? 8 : lead.timeline === "exploratory" ? 3 : 0;

  // Client company domain (we can look them up)
  breakdown.clientDomain = lead.clientDomain ? 7 : 0;

  // Client size band
  breakdown.clientSizeBand = lead.clientSizeBand ? 5 : 0;

  // Attached document (RFP, brief, SOW) — strongest quality signal
  breakdown.attachments = (lead.attachments?.length ?? 0) > 0 ? 15 : 0;

  // ── Source bonus ──────────────────────────────────────
  // AI-extracted from a call = more credible than a manually typed entry
  breakdown.sourceBonus = lead.source === "call" ? 5 : lead.source === "email" ? 3 : 0;

  const score = Math.min(100, Object.values(breakdown).reduce((sum, v) => sum + v, 0));

  const tier =
    score >= 90 ? "strong"
    : score >= 75 ? "good"
    : score >= 60 ? "adequate"
    : "weak";

  return { score, tier, breakdown };
}
