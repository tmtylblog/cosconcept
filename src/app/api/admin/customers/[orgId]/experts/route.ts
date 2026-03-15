/**
 * GET  /api/admin/customers/[orgId]/experts — List experts for org with claim status
 * POST /api/admin/customers/[orgId]/experts — Admin creates expert manually
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
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
  const url = new URL(_req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const tier = url.searchParams.get("tier"); // "expert" | "potential_expert" | "not_expert" | null
  const offset = (page - 1) * limit;

  try {
    // Find firm(s) for this org
    const firms = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId));

    if (firms.length === 0) {
      return NextResponse.json({ experts: [], total: 0, page, totalPages: 0 });
    }

    const firmIds = firms.map((f) => f.id);

    // Count total experts across all firm IDs
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(expertProfiles)
      .where(inArray(expertProfiles.firmId, firmIds));

    // Load paginated experts
    const experts = await db
      .select()
      .from(expertProfiles)
      .where(inArray(expertProfiles.firmId, firmIds))
      .orderBy(desc(expertProfiles.updatedAt))
      .limit(limit)
      .offset(offset);

    const firm = { id: firmIds[0] }; // Primary firm for specialist profile lookup

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
      // Auto-classify: PDL classification wins, else specialist profiles or
      // work history presence → "expert", else null (unclassified)
      const pdlData = ep.pdlData as Record<string, unknown> | null;
      const pdlClassification = (pdlData?.classifiedAs as string) ?? null;
      const hasExperience = Array.isArray(pdlData?.experience) && (pdlData.experience as unknown[]).length > 0;
      const hasSpecialistProfiles = (sp?.total ?? 0) > 0;
      const expertTier = pdlClassification
        ?? (hasSpecialistProfiles || hasExperience ? "expert" : null);
      const isFullyEnriched = hasExperience || ep.enrichmentStatus === "enriched";

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
        updatedAt: ep.updatedAt,
        enrichmentStatus: ep.enrichmentStatus,
        rosterStatus: ep.rosterStatus ?? "active",
        // Team import tier + enrichment status
        expertTier,
        isFullyEnriched,
        pdlEnrichedAt: ep.pdlEnrichedAt ?? null,
      };
    });

    return NextResponse.json({
      experts: result,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
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
