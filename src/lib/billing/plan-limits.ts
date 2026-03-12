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
  /** Max team members (seats) included in the plan */
  members: number;
  /** Price per additional seat beyond included (0 = not available — must upgrade) */
  additionalSeatPriceUsd: number;
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

  // ── Profile data limits ──────────────────────────────────────────
  /** Max expert profiles imported via PDL (-1 = full roster) */
  expertRosterLimit: number;
  /** Max case studies shown on public profile (-1 = all) */
  caseStudyDisplayLimit: number;
  /** Max client logos/names shown on public profile (-1 = all) */
  clientDisplayLimit: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    members: 1,
    additionalSeatPriceUsd: 0, // must upgrade to Pro
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
    expertRosterLimit: 5,       // teaser: 5 people to show the feature
    caseStudyDisplayLimit: 5,   // show 5 case studies on profile
    clientDisplayLimit: 20,     // show up to 20 client names/logos
  },
  pro: {
    members: 3,
    additionalSeatPriceUsd: 50, // $50/mo per extra seat
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
    expertRosterLimit: -1,      // full roster (capped at 500 per firm in handler)
    caseStudyDisplayLimit: -1,  // all case studies
    clientDisplayLimit: -1,     // all clients
  },
  enterprise: {
    members: Infinity,
    additionalSeatPriceUsd: 0, // unlimited seats included
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
    expertRosterLimit: -1,
    caseStudyDisplayLimit: -1,
    clientDisplayLimit: -1,
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
