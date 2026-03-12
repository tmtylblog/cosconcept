/**
 * POST /api/dev/seed-test-user
 *
 * Creates a comprehensive dev test user with full org, firm, enrichment data,
 * and partner preferences. Only available when DEV_BYPASS_ONBOARDING=true
 * (local development). Returns user credentials for auto-login.
 *
 * Idempotent — safe to call multiple times; finds existing user if already seeded.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  organizations,
  members,
  serviceFirms,
  partnerPreferences,
  subscriptions,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  DEV_USER,
  DEV_ORG,
  DEV_FIRM,
  DEV_ENRICHMENT_DATA,
  DEV_PREFERENCES,
  DEV_TEAM,
} from "@/lib/dev/test-data";

export const dynamic = "force-dynamic";

function isDev(): boolean {
  return (
    process.env.DEV_BYPASS_ONBOARDING === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST() {
  if (!isDev()) {
    return NextResponse.json(
      { error: "Dev endpoints are disabled in production" },
      { status: 403 }
    );
  }

  try {
    const now = new Date();

    // ─── 1. Find or create user ────────────────────────────
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEV_USER.email))
      .limit(1);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      userId = crypto.randomBytes(16).toString("hex");
      await db.insert(users).values({
        id: userId,
        name: DEV_USER.name,
        email: DEV_USER.email,
        emailVerified: true,
        role: DEV_USER.role,
        createdAt: now,
        updatedAt: now,
      });

      // Create password account (Better Auth uses "credential" as providerId)
      // Better Auth hashes passwords internally via its signUp flow,
      // but for direct DB insert we need to hash ourselves.
      // We'll use the auth.api approach instead — see auto-login endpoint.
      // For now, just create a placeholder account record.
      const accountId = crypto.randomBytes(16).toString("hex");
      await db.insert(accounts).values({
        id: accountId,
        userId,
        accountId: DEV_USER.email,
        providerId: "credential",
        // Password will be set via Better Auth signUp flow on first auto-login
        password: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ─── 2. Find or create organization ────────────────────
    const [existingOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, DEV_ORG.slug))
      .limit(1);

    let orgId: string;

    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      orgId = crypto.randomBytes(16).toString("hex");
      await db.insert(organizations).values({
        id: orgId,
        name: DEV_ORG.name,
        slug: DEV_ORG.slug,
        metadata: JSON.stringify({ source: "dev-seed", createdBy: "claude" }),
        createdAt: now,
      });

      // Create owner membership
      const memberId = crypto.randomBytes(16).toString("hex");
      await db.insert(members).values({
        id: memberId,
        userId,
        organizationId: orgId,
        role: "owner",
        createdAt: now,
      });

      // Create free subscription
      try {
        const subId = crypto.randomBytes(16).toString("hex");
        await db.insert(subscriptions).values({
          id: subId,
          organizationId: orgId,
          stripeCustomerId: `cus_dev_${orgId.slice(0, 8)}`,
          plan: "pro",
          status: "active",
          cancelAtPeriodEnd: false,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // Subscription might already exist from org afterCreate hook
      }
    }

    // ─── 3. Find or create service firm ────────────────────
    const firmId = `firm_${orgId}`;
    const [existingFirm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);

    if (!existingFirm) {
      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId: orgId,
        name: DEV_FIRM.name,
        website: DEV_FIRM.website,
        description: DEV_FIRM.description,
        firmType: DEV_FIRM.firmType,
        sizeBand: DEV_FIRM.sizeBand,
        profileCompleteness: DEV_FIRM.profileCompleteness,
        entityType: DEV_FIRM.entityType,
        enrichmentStatus: DEV_FIRM.enrichmentStatus,
        classificationConfidence: DEV_FIRM.classificationConfidence,
        isCosCustomer: DEV_FIRM.isCosCustomer,
        enrichmentData: DEV_ENRICHMENT_DATA,
        isPlatformMember: true,
        cosCustomerSince: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update enrichment data if firm exists but might have stale data
      await db
        .update(serviceFirms)
        .set({
          enrichmentData: DEV_ENRICHMENT_DATA,
          enrichmentStatus: DEV_FIRM.enrichmentStatus,
          classificationConfidence: DEV_FIRM.classificationConfidence,
          profileCompleteness: DEV_FIRM.profileCompleteness,
          updatedAt: now,
        })
        .where(eq(serviceFirms.id, firmId));
    }

    // ─── 4. Find or create partner preferences ─────────────
    const [existingPrefs] = await db
      .select({ id: partnerPreferences.id })
      .from(partnerPreferences)
      .where(eq(partnerPreferences.firmId, firmId))
      .limit(1);

    if (!existingPrefs) {
      const prefId = `pref_dev_${Date.now()}`;
      await db.insert(partnerPreferences).values({
        id: prefId,
        firmId,
        rawOnboardingData: DEV_PREFERENCES,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(partnerPreferences)
        .set({
          rawOnboardingData: DEV_PREFERENCES,
          updatedAt: now,
        })
        .where(eq(partnerPreferences.firmId, firmId));
    }

    // ─── 5. Seed team members (optional) ───────────────────
    for (const member of DEV_TEAM) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, member.email))
        .limit(1);

      if (!existing) {
        const teamUserId = crypto.randomBytes(16).toString("hex");
        await db.insert(users).values({
          id: teamUserId,
          name: member.name,
          email: member.email,
          emailVerified: true,
          role: "user",
          createdAt: now,
          updatedAt: now,
        });

        const teamMemberId = crypto.randomBytes(16).toString("hex");
        await db.insert(members).values({
          id: teamMemberId,
          userId: teamUserId,
          organizationId: orgId,
          role: member.role,
          createdAt: now,
        });
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: DEV_USER.email,
        name: DEV_USER.name,
        role: DEV_USER.role,
      },
      organization: {
        id: orgId,
        name: DEV_ORG.name,
        slug: DEV_ORG.slug,
      },
      firm: {
        id: firmId,
        name: DEV_FIRM.name,
      },
      teamMembers: DEV_TEAM.length,
      message:
        "Dev user seeded. Use /api/dev/auto-login to sign in, " +
        "or sign up via the UI with email: " +
        DEV_USER.email +
        " password: " +
        DEV_USER.password,
    });
  } catch (error) {
    console.error("[Dev Seed] Error:", error);
    return NextResponse.json(
      { error: "Seed failed", message: String(error) },
      { status: 500 }
    );
  }
}
