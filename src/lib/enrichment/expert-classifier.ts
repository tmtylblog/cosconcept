/**
 * Expert Classifier
 *
 * Classifies team members as "expert" (client-facing, would be offered on
 * the platform) vs "internal" (ops, admin, support) based on job title.
 *
 * Strategy:
 * 1. Rule-based keyword matching (free, instant)
 * 2. AI fallback for ambiguous titles (Gemini Flash)
 *
 * Used to show accurate expert counts on the firm profile overview.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Classification Keywords ────────────────────────────────

/** Titles that strongly indicate a platform-worthy expert */
const EXPERT_KEYWORDS = [
  "consultant",
  "strategist",
  "designer",
  "developer",
  "engineer",
  "architect",
  "director",
  "vp",
  "vice president",
  "head of",
  "chief",
  "cmo",
  "cto",
  "cfo",
  "coo",
  "ceo",
  "creative director",
  "analyst",
  "advisor",
  "principal",
  "partner",
  "founder",
  "co-founder",
  "lead",
  "specialist",
  "fractional",
  "interim",
  "manager",
  "planner",
  "producer",
  "copywriter",
  "writer",
  "editor",
  "researcher",
  "scientist",
  "data",
  "growth",
  "marketing",
  "brand",
  "product",
  "ux",
  "ui",
  "digital",
  "media",
  "communications",
  "public relations",
  "pr ",
  "seo",
  "sem",
  "content",
  "social media",
  "transformation",
  "innovation",
  "change management",
  "agile",
  "scrum",
  "devops",
  "cloud",
  "security",
  "cyber",
  "blockchain",
  "web3",
  "ai ",
  "machine learning",
  "m&a",
  "due diligence",
  "venture",
  "private equity",
  "investment",
];

/** Titles that strongly indicate internal/ops roles */
const INTERNAL_KEYWORDS = [
  "recruiter",
  "recruiting",
  "talent acquisition",
  "hr ",
  "human resources",
  "people operations",
  "office manager",
  "office administrator",
  "executive assistant",
  "personal assistant",
  "administrative",
  "admin assistant",
  "coordinator",
  "receptionist",
  "accounting",
  "bookkeeper",
  "bookkeeping",
  "payroll",
  "it support",
  "help desk",
  "desktop support",
  "intern",
  "sales representative",
  "sales rep",
  "business development rep",
  "bdr",
  "sdr",
  "inside sales",
  "facilities",
  "maintenance",
  "janitor",
  "custodial",
  "mailroom",
  "clerk",
  "data entry",
  "filing",
  "procurement",
  "purchasing",
  "accounts payable",
  "accounts receivable",
  "billing specialist",
  "collections",
  "compliance officer",
  "legal assistant",
  "paralegal",
  "secretary",
  "travel coordinator",
  "event coordinator",
];

// ─── Types ────────────────────────────────────────────────

export interface TeamMemberWithRole {
  name: string;
  role: string;
  [key: string]: unknown; // allow additional fields
}

export interface ClassificationResult {
  experts: TeamMemberWithRole[];
  internal: TeamMemberWithRole[];
  ambiguous: TeamMemberWithRole[];
  expertCount: number;
  internalCount: number;
  totalTeam: number;
}

// ─── Rule-based Classifier ──────────────────────────────────

/**
 * Classify a single title as expert, internal, or ambiguous.
 */
export function classifyTitle(title: string): "expert" | "internal" | "ambiguous" {
  const normalized = ` ${title.toLowerCase()} `;

  // Check internal first (more specific patterns)
  for (const keyword of INTERNAL_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return "internal";
    }
  }

  // Check expert keywords
  for (const keyword of EXPERT_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return "expert";
    }
  }

  return "ambiguous";
}

// ─── Main Classification Function ───────────────────────────

/**
 * Classify a list of team members with roles as expert vs internal.
 *
 * @param members - Array of objects with at least `name` and `role` fields
 * @param useAiFallback - Whether to use AI for ambiguous titles (default: true)
 * @returns Classification result with separated lists and counts
 */
export async function classifyTeamMembers(
  members: TeamMemberWithRole[],
  useAiFallback = true
): Promise<ClassificationResult> {
  const experts: TeamMemberWithRole[] = [];
  const internal: TeamMemberWithRole[] = [];
  const ambiguous: TeamMemberWithRole[] = [];

  // Phase 1: Rule-based classification
  for (const member of members) {
    const role = member.role?.trim();
    if (!role) {
      // No role info — default to expert (benefit of the doubt)
      experts.push(member);
      continue;
    }

    const classification = classifyTitle(role);
    if (classification === "expert") {
      experts.push(member);
    } else if (classification === "internal") {
      internal.push(member);
    } else {
      ambiguous.push(member);
    }
  }

  // Phase 2: AI classification for ambiguous titles
  if (useAiFallback && ambiguous.length > 0) {
    try {
      // Batch up to 30 ambiguous titles for AI classification
      const batch = ambiguous.slice(0, 30);
      const titles = batch.map((m) => m.role);

      const result = await generateObject({
        model: openrouter.chat("google/gemini-2.0-flash-001"),
        prompt: `You are classifying job titles for a professional services firm (agency, consultancy, or fractional leadership firm).

Classify each title as either:
- "expert": Someone who would be offered to clients as a consultant, specialist, or expert (e.g., strategists, designers, developers, leaders, subject matter experts)
- "internal": Someone who supports the firm internally (e.g., admin, HR, internal ops, sales reps, accounting)

If unsure, lean toward "expert" — professional services firms often have unconventional titles for client-facing roles.

Titles to classify:
${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
        schema: z.object({
          classifications: z.array(
            z.object({
              index: z.number(),
              classification: z.enum(["expert", "internal"]),
            })
          ),
        }),
      });

      // Apply AI classifications
      const aiResults = result.object.classifications;
      const resolved: Set<number> = new Set();

      for (const { index, classification } of aiResults) {
        const adjustedIndex = index - 1; // AI uses 1-based indexing
        if (adjustedIndex >= 0 && adjustedIndex < batch.length) {
          if (classification === "expert") {
            experts.push(batch[adjustedIndex]);
          } else {
            internal.push(batch[adjustedIndex]);
          }
          resolved.add(adjustedIndex);
        }
      }

      // Any remaining ambiguous not resolved by AI → default to expert
      for (let i = 0; i < batch.length; i++) {
        if (!resolved.has(i)) {
          experts.push(batch[i]);
        }
      }

      // If there were more than 30 ambiguous, default the rest to expert
      for (let i = 30; i < ambiguous.length; i++) {
        experts.push(ambiguous[i]);
      }
    } catch (error) {
      console.error("[ExpertClassifier] AI classification failed:", error);
      // Fallback: treat all ambiguous as experts
      experts.push(...ambiguous);
    }
  } else if (ambiguous.length > 0) {
    // No AI fallback — treat ambiguous as experts
    experts.push(...ambiguous);
  }

  return {
    experts,
    internal,
    ambiguous: [], // All resolved after AI pass
    expertCount: experts.length,
    internalCount: internal.length,
    totalTeam: members.length,
  };
}

/**
 * Quick classification without AI — rule-based only.
 * Useful for instant counts in the UI.
 */
export function classifyTeamMembersSync(
  members: TeamMemberWithRole[]
): ClassificationResult {
  const experts: TeamMemberWithRole[] = [];
  const internal: TeamMemberWithRole[] = [];
  const ambiguous: TeamMemberWithRole[] = [];

  for (const member of members) {
    const role = member.role?.trim();
    if (!role) {
      experts.push(member);
      continue;
    }

    const classification = classifyTitle(role);
    if (classification === "expert") {
      experts.push(member);
    } else if (classification === "internal") {
      internal.push(member);
    } else {
      // Ambiguous defaults to expert in sync mode
      experts.push(member);
      ambiguous.push(member);
    }
  }

  return {
    experts,
    internal,
    ambiguous,
    expertCount: experts.length,
    internalCount: internal.length,
    totalTeam: members.length,
  };
}
