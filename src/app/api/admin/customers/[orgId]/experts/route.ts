/**
 * GET  /api/admin/customers/[orgId]/experts — List experts for org with claim status
 * POST /api/admin/customers/[orgId]/experts — Admin creates expert manually
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  specialistProfiles,
  serviceFirms,
  verifications,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    // Find firm for this org
    const [firm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ experts: [], total: 0 });
    }

    // Load experts
    const experts = await db
      .select()
      .from(expertProfiles)
      .where(eq(expertProfiles.firmId, firm.id))
      .orderBy(desc(expertProfiles.updatedAt));

    // Load specialist profile counts per expert
    const spCounts = await db
      .select({
        expertProfileId: specialistProfiles.expertProfileId,
        total: sql<number>`COUNT(*)::int`,
        strong: sql<number>`COUNT(*) FILTER (WHERE ${specialistProfiles.qualityStatus} = 'strong')::int`,
        partial: sql<number>`COUNT(*) FILTER (WHERE ${specialistProfiles.qualityStatus} = 'partial')::int`,
      })
      .from(specialistProfiles)
      .where(eq(specialistProfiles.firmId, firm.id))
      .groupBy(specialistProfiles.expertProfileId);

    const spByExpert = new Map(spCounts.map((s) => [s.expertProfileId, s]));

    // Load invite statuses for unclaimed experts
    const unclaimedIds = experts.filter((e) => !e.userId).map((e) => e.id);
    const inviteStatuses = new Map<string, { status: string; expiresAt: Date; createdAt: Date }>();

    if (unclaimedIds.length > 0) {
      const identifiers = unclaimedIds.map((id) => `expert-claim:${id}`);
      const rows = await db
        .select({
          identifier: verifications.identifier,
          expiresAt: verifications.expiresAt,
          createdAt: verifications.createdAt,
        })
        .from(verifications)
        .where(
          inArray(verifications.identifier, identifiers)
        );

      for (const row of rows) {
        const expertId = row.identifier.replace("expert-claim:", "");
        inviteStatuses.set(expertId, {
          status: row.expiresAt < new Date() ? "expired" : "pending",
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
        });
      }
    }

    // Build response
    const result = experts.map((ep) => {
      const sp = spByExpert.get(ep.id);
      let claimStatus: "claimed" | "invited" | "expired" | "unclaimed" = "unclaimed";

      if (ep.userId) {
        claimStatus = "claimed";
      } else {
        const invite = inviteStatuses.get(ep.id);
        if (invite) {
          claimStatus = invite.status === "pending" ? "invited" : "expired";
        }
      }

      // Extract tier and enrichment status from pdlData
      const pdlData = ep.pdlData as Record<string, unknown> | null;
      const expertTier = (pdlData?.classifiedAs as string) ?? null;
      const hasExperience = Array.isArray(pdlData?.experience) && (pdlData.experience as unknown[]).length > 0;
      const isFullyEnriched = !!ep.pdlEnrichedAt && hasExperience;

      return {
        id: ep.id,
        firstName: ep.firstName,
        lastName: ep.lastName,
        fullName: ep.fullName,
        email: ep.email,
        title: ep.title,
        linkedinUrl: ep.linkedinUrl,
        photoUrl: ep.photoUrl,
        division: ep.division,
        userId: ep.userId,
        claimStatus,
        inviteSentAt: inviteStatuses.get(ep.id)?.createdAt ?? null,
        profileCount: sp?.total ?? 0,
        strongProfiles: sp?.strong ?? 0,
        partialProfiles: sp?.partial ?? 0,
        profileCompleteness: ep.profileCompleteness,
        createdAt: ep.createdAt,
        // Team import tier + enrichment status
        expertTier,
        isFullyEnriched,
        pdlEnrichedAt: ep.pdlEnrichedAt ?? null,
      };
    });

    return NextResponse.json({ experts: result, total: result.length });
  } catch (error) {
    console.error("[Admin] Experts list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch experts" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  try {
    const body = await req.json();
    const { firstName, lastName, email, title, linkedinUrl, division } = body;

    if (!firstName && !lastName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Find firm for this org
    const [firm] = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);

    if (!firm) {
      return NextResponse.json({ error: "No firm found for this organization" }, { status: 404 });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const id = `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    await db.insert(expertProfiles).values({
      id,
      firmId: firm.id,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: fullName || null,
      email: email || null,
      title: title || null,
      linkedinUrl: linkedinUrl || null,
      division: division || "expert",
    });

    return NextResponse.json({ id, fullName });
  } catch (error) {
    console.error("[Admin] Create expert error:", error);
    return NextResponse.json(
      { error: "Failed to create expert" },
      { status: 500 }
    );
  }
}
