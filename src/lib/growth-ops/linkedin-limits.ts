/**
 * LinkedIn account-type daily/weekly/monthly limits.
 * Ported from CORE LinkedIn integration handoff.
 */

export type LinkedInAccountType = "basic" | "premium" | "sales_navigator" | "recruiter";

export interface LinkedInLimits {
  dailyInvites: number;
  weeklyInvites: number;
  dailyMessages: number;
  weeklyMessages: number;
  monthlyInmails: number;
  dailyProfileViews: number;
  label: string;
}

export const LINKEDIN_LIMITS: Record<LinkedInAccountType, LinkedInLimits> = {
  basic: {
    dailyInvites: 20, weeklyInvites: 80, dailyMessages: 50,
    weeklyMessages: 300, monthlyInmails: 0, dailyProfileViews: 80,
    label: "LinkedIn Basic",
  },
  premium: {
    dailyInvites: 25, weeklyInvites: 100, dailyMessages: 100,
    weeklyMessages: 500, monthlyInmails: 5, dailyProfileViews: 150,
    label: "LinkedIn Premium",
  },
  sales_navigator: {
    dailyInvites: 25, weeklyInvites: 100, dailyMessages: 150,
    weeklyMessages: 750, monthlyInmails: 50, dailyProfileViews: 300,
    label: "Sales Navigator",
  },
  recruiter: {
    dailyInvites: 25, weeklyInvites: 100, dailyMessages: 150,
    weeklyMessages: 750, monthlyInmails: 150, dailyProfileViews: 500,
    label: "Recruiter",
  },
};

export function getLimitsForAccountType(accountType: string): LinkedInLimits {
  return LINKEDIN_LIMITS[(accountType as LinkedInAccountType)] ?? LINKEDIN_LIMITS.basic;
}
