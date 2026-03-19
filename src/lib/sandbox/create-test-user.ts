/**
 * Sandbox test user creation.
 *
 * Creates a full user → account → org → member → subscription → serviceFirm stack
 * for throwaway test sessions. All records are tagged with source: "sandbox" metadata
 * and use the email pattern `support+sandbox-{id}@joincollectiveos.com`.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  organizations,
  members,
  subscriptions,
  serviceFirms,
  partnerPreferences,
  enrichmentCache,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const RANDOM_ADJECTIVES = [
  "Bright", "Swift", "Bold", "Keen", "Agile",
  "Vivid", "Quick", "Sharp", "Noble", "Brave",
];

const RANDOM_NOUNS = [
  "Falcon", "Owl", "Fox", "Wolf", "Eagle",
  "Hawk", "Bear", "Lynx", "Crane", "Raven",
];

function randomWord(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export interface SandboxUserResult {
  userId: string;
  orgId: string;
  firmId: string;
  email: string;
  name: string;
}

export async function createSandboxUser(opts: {
  name?: string;
  domain?: string;
  mode: "onboarding" | "pre-onboarded";
}): Promise<SandboxUserResult> {
  const now = new Date();
  const sandboxId = crypto.randomBytes(4).toString("hex"); // 8 hex chars
  const email = `support+sandbox-${sandboxId}@joincollectiveos.com`;
  const name = opts.name || `Sandbox ${randomWord(RANDOM_ADJECTIVES)} ${randomWord(RANDOM_NOUNS)}`;

  // Normalize domain — strip protocol, trailing slashes, www prefix
  let domain = opts.domain?.trim() || undefined;
  if (domain) {
    domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  // 1. Create user
  const userId = crypto.randomBytes(16).toString("hex");
  await db.insert(users).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: "user",
    createdAt: now,
    updatedAt: now,
  });

  // 2. Create credential account (no password — login via token only)
  const accountId = crypto.randomBytes(16).toString("hex");
  await db.insert(accounts).values({
    id: accountId,
    userId,
    accountId: email,
    providerId: "credential",
    password: null,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Create organization
  const orgId = crypto.randomBytes(16).toString("hex");
  const orgSlug = `sandbox-${sandboxId}`;
  await db.insert(organizations).values({
    id: orgId,
    name: `Sandbox: ${domain || name}`,
    slug: orgSlug,
    metadata: JSON.stringify({
      source: "sandbox",
      sandboxId,
      domain: domain || null,
      mode: opts.mode,
    }),
    createdAt: now,
  });

  // 4. Create owner membership
  const memberId = crypto.randomBytes(16).toString("hex");
  await db.insert(members).values({
    id: memberId,
    userId,
    organizationId: orgId,
    role: "owner",
    createdAt: now,
  });

  // 5. Create pro subscription
  const subId = crypto.randomBytes(16).toString("hex");
  try {
    await db.insert(subscriptions).values({
      id: subId,
      organizationId: orgId,
      stripeCustomerId: `cus_sandbox_${sandboxId}`,
      plan: "pro",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Subscription might already exist from org afterCreate hook
  }

  // 6. Create service firm
  const firmId = `firm_${orgId}`;
  const isPreOnboarded = opts.mode === "pre-onboarded";

  // Check enrichment cache if domain provided and pre-onboarded
  let enrichmentData: Record<string, unknown> | null = null;
  if (domain && isPreOnboarded) {
    const [cached] = await db
      .select({ enrichmentData: enrichmentCache.enrichmentData })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);
    if (cached) {
      enrichmentData = cached.enrichmentData as Record<string, unknown>;
    }
  }
  // For post-onboard: ensure enrichmentData has at least companyData.name
  // so the onboarding status check sees enrichment as complete
  if (isPreOnboarded && !enrichmentData) {
    enrichmentData = {
      companyData: { name: domain ? `Sandbox (${domain})` : name },
      classification: {
        categories: ["Technology Consulting"],
        firmNature: "service_provider",
      },
      domain: domain || null,
    };
  }

  await db.insert(serviceFirms).values({
    id: firmId,
    organizationId: orgId,
    name: domain ? `Sandbox (${domain})` : name,
    website: domain ? `https://${domain}` : null,
    enrichmentStatus: isPreOnboarded ? "enriched" : "pending",
    enrichmentData: enrichmentData,
    entityType: "service_firm",
    isCosCustomer: true,
    isPlatformMember: true,
    cosCustomerSince: now,
    createdAt: now,
    updatedAt: now,
  });

  // 7. If pre-onboarded (post-onboard mode), create canned partner preferences
  //    with the v2 required fields so onboarding status reports complete
  if (isPreOnboarded) {
    const philosophies = [
      "We believe in deep, long-term partnerships where both sides win. Quality over quantity.",
      "Partnerships should be mutually beneficial — we refer work both ways and share knowledge openly.",
      "We focus on complementary capabilities. We don't partner with competitors, only firms that extend our reach.",
    ];
    const gaps = [
      "We need partners with strong data engineering and ML capabilities — our strength is strategy and design.",
      "Looking for firms with deep industry expertise in healthcare and fintech to complement our technical delivery.",
      "We lack creative and brand capabilities — need a design-forward agency partner.",
    ];
    const partnerTypes = [
      "Boutique agencies with 10-50 people, advisory firms, and fractional CTO/CMO practices.",
      "Mid-size consultancies with implementation capability, plus niche specialists in AI/ML.",
      "Full-service digital agencies, management consultancies, and technology integrators.",
    ];
    const dealBreakers = [
      "Firms that compete on price or undercut proposals. We need partners who value quality.",
      "No firms without proven case studies or references — trust is built on evidence.",
      "Poor communication and missed deadlines are non-negotiable. We need reliable partners.",
    ];
    const geoPreferences = [
      "North America primarily, open to UK/EU for international projects.",
      "Global — we work across time zones and need partners who can too.",
      "US-focused, especially East Coast metros (NYC, Boston, DC, Atlanta).",
    ];

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    const prefId = `pref_sandbox_${sandboxId}`;
    await db.insert(partnerPreferences).values({
      id: prefId,
      firmId,
      rawOnboardingData: {
        // v2 required fields (these 5 must be set for onboarding to be "complete")
        partnershipPhilosophy: pick(philosophies),
        capabilityGaps: pick(gaps),
        preferredPartnerTypes: pick(partnerTypes),
        dealBreaker: pick(dealBreakers),
        geographyPreference: pick(geoPreferences),
        // metadata
        source: "sandbox-post-onboard",
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  return { userId, orgId, firmId, email, name };
}
