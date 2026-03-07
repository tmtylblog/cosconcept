import {
  getOrgPlan,
  getMatchesThisWeek,
  getAiPerfectMatchesThisMonth,
  getOpportunityResponsesThisMonth,
} from "./usage-checker";
import { PLAN_LIMITS } from "./plan-limits";

export class FeatureGateError extends Error {
  public readonly code: string;
  public readonly requiredPlan: string;

  constructor(message: string, code: string, requiredPlan: string = "pro") {
    super(message);
    this.name = "FeatureGateError";
    this.code = code;
    this.requiredPlan = requiredPlan;
  }
}

type BooleanFeature =
  | "canSearchNetwork"
  | "enhancedProfile"
  | "unlimitedMessaging"
  | "canAccessCallIntelligence"
  | "canAccessEmailAgent"
  | "canExportData";

type UsageFeature =
  | "potentialMatches"
  | "aiPerfectMatches"
  | "opportunityResponses";

/**
 * Check if an org's plan allows a boolean feature.
 * Throws FeatureGateError if not.
 */
export async function requireFeature(
  organizationId: string,
  feature: BooleanFeature
): Promise<void> {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan];

  if (!limits[feature]) {
    // [ANALYTICS] trackEvent("feature_gate_hit", { organizationId, feature, plan })
    const requiredPlan =
      feature === "canAccessEmailAgent" ? "enterprise" : "pro";
    throw new FeatureGateError(
      `Your current plan (${plan}) does not include this feature. Upgrade to ${requiredPlan} to unlock it.`,
      `feature_gated:${feature}`,
      requiredPlan
    );
  }
}

/**
 * Check if an org has remaining usage quota for a metered feature.
 * Throws FeatureGateError if the limit is reached.
 */
export async function requireUsage(
  organizationId: string,
  feature: UsageFeature
): Promise<void> {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan];

  let current: number;
  let limit: number;
  let label: string;

  switch (feature) {
    case "potentialMatches":
      current = await getMatchesThisWeek(organizationId);
      limit = limits.potentialMatchesPerWeek;
      label = "potential matches this week";
      break;
    case "aiPerfectMatches":
      current = await getAiPerfectMatchesThisMonth(organizationId);
      limit = limits.aiPerfectMatchesPerMonth;
      label = "AI Perfect Matches this month";
      break;
    case "opportunityResponses":
      current = await getOpportunityResponsesThisMonth(organizationId);
      limit = limits.opportunityResponsesPerMonth;
      label = "opportunity responses this month";
      break;
  }

  if (limit !== Infinity && current >= limit) {
    // [ANALYTICS] trackEvent("usage_limit_hit", { organizationId, feature, plan, current, limit })
    throw new FeatureGateError(
      `You've used all ${limit} ${label}. Upgrade your plan for more.`,
      `usage_limit:${feature}`,
      plan === "free" ? "pro" : "enterprise"
    );
  }
}
