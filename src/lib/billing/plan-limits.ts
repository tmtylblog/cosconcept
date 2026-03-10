/**
 * Central plan configuration.
 * Aligned with joincollectiveos.com/pricing.
 *
 * Free  — $0/mo   "Explore the Network"
 * Pro   — $199/mo  "Harness the Network"
 * Enterprise — custom pricing (contact us)
 */

export type PlanId = "free" | "pro" | "enterprise";

export interface PlanLimits {
  /** Max team members (seats) */
  members: number;
  /** Potential matches surfaced per week */
  potentialMatchesPerWeek: number;
  /** AI Perfect Matches per month */
  aiPerfectMatchesPerMonth: number;
  /** Opportunity responses per month */
  opportunityResponsesPerMonth: number;
  /** Unlimited messaging */
  unlimitedMessaging: boolean;
  /** Can search the network (all plans — metered for free) */
  canSearchNetwork: boolean;
  /** Monthly network search limit (-1 = unlimited) */
  monthlySearches: number;
  /** Enhanced profile listing */
  enhancedProfile: boolean;
  /** Can access call intelligence (future) */
  canAccessCallIntelligence: boolean;
  /** Can access email agent (future) */
  canAccessEmailAgent: boolean;
  /** Can export data */
  canExportData: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    members: 1,
    potentialMatchesPerWeek: 5,
    aiPerfectMatchesPerMonth: 1, // trial
    opportunityResponsesPerMonth: 0,
    unlimitedMessaging: false,
    canSearchNetwork: true,
    monthlySearches: 10,
    enhancedProfile: false,
    canAccessCallIntelligence: false,
    canAccessEmailAgent: false,
    canExportData: false,
  },
  pro: {
    members: 3,
    potentialMatchesPerWeek: 12,
    aiPerfectMatchesPerMonth: 2,
    opportunityResponsesPerMonth: 3,
    unlimitedMessaging: true,
    canSearchNetwork: true,
    monthlySearches: -1, // unlimited
    enhancedProfile: true,
    canAccessCallIntelligence: true,
    canAccessEmailAgent: false,
    canExportData: true,
  },
  enterprise: {
    members: Infinity, // custom
    potentialMatchesPerWeek: Infinity,
    aiPerfectMatchesPerMonth: Infinity,
    opportunityResponsesPerMonth: Infinity,
    unlimitedMessaging: true,
    canSearchNetwork: true,
    monthlySearches: -1, // unlimited
    enhancedProfile: true,
    canAccessCallIntelligence: true,
    canAccessEmailAgent: true,
    canExportData: true,
  },
};

export const PLAN_PRICES: Record<PlanId, { monthly: number; yearly: number | null }> = {
  free: { monthly: 0, yearly: null },
  pro: { monthly: 199, yearly: null }, // yearly TBD
  enterprise: { monthly: 0, yearly: null }, // custom pricing
};

export const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

export const PLAN_TAGLINES: Record<PlanId, string> = {
  free: "Explore the Network",
  pro: "Harness the Network",
  enterprise: "Custom Solutions",
};
