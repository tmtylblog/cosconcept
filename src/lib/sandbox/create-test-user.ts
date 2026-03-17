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
  let enrichmentData = null;
  if (domain && isPreOnboarded) {
    const [cached] = await db
      .select({ enrichmentData: enrichmentCache.enrichmentData })
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);
    if (cached) {
      enrichmentData = cached.enrichmentData;
    }
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

  // 7. If pre-onboarded, create canned partner preferences
  if (isPreOnboarded) {
    const prefId = `pref_sandbox_${sandboxId}`;
    await db.insert(partnerPreferences).values({
      id: prefId,
      firmId,
      rawOnboardingData: {
        growthGoals: ["Find complementary partners", "Expand service offerings"],
        idealPartnerTypes: ["boutique_agency", "advisory"],
        industries: ["Technology", "Financial Services"],
        dealSize: "$50K-$200K",
        source: "sandbox-pre-onboarded",
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  return { userId, orgId, firmId, email, name };
}
