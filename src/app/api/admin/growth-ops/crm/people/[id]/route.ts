/**
 * GET /api/admin/growth-ops/crm/people/:id
 *
 * Returns a single person by synthetic CRM ID (e.g. ep_xxx, ac_xxx, imp_xxx).
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  acqContacts,
  importedContacts,
  acqDeals,
  prospectTimeline,
  growthOpsConversations,
} from "@/lib/db/schema";
import { eq, desc, ilike, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const underscoreIdx = id.indexOf("_");
  if (underscoreIdx === -1) {
    return NextResponse.json({ error: "Invalid person ID format" }, { status: 400 });
  }
  const prefix = id.substring(0, underscoreIdx);
  const sourceId = id.substring(underscoreIdx + 1);

  try {
    let person: Record<string, unknown> | null = null;

    if (prefix === "ep") {
      const [row] = await db
        .select()
        .from(expertProfiles)
        .where(eq(expertProfiles.id, sourceId))
        .limit(1);

      if (row) {
        person = {
          id,
          sourceTable: "expertProfiles",
          sourceId,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.fullName ?? ([row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown"),
          email: row.email,
          title: row.title,
          headline: row.headline,
          linkedinUrl: row.linkedinUrl,
          photoUrl: row.photoUrl,
          location: row.location,
          bio: row.bio,
          entityClass: "expert",
          firmId: row.firmId,
          userId: row.userId,
          topSkills: row.topSkills,
          topIndustries: row.topIndustries,
          division: row.division,
          pdlData: row.pdlData,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    } else if (prefix === "ac") {
      const [row] = await db
        .select()
        .from(acqContacts)
        .where(eq(acqContacts.id, sourceId))
        .limit(1);

      if (row) {
        person = {
          id,
          sourceTable: "acqContacts",
          sourceId,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Unknown",
          email: row.email,
          title: null,
          headline: null,
          linkedinUrl: row.linkedinUrl,
          photoUrl: null,
          location: null,
          entityClass: "prospect_contact",
          acqContactId: row.id,
          companyId: row.companyId,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    } else if (prefix === "imp") {
      const [row] = await db
        .select({
          id: importedContacts.id,
          firstName: importedContacts.firstName,
          lastName: importedContacts.lastName,
          name: importedContacts.name,
          email: importedContacts.email,
          title: importedContacts.title,
          headline: importedContacts.headline,
          linkedinUrl: importedContacts.linkedinUrl,
          photoUrl: importedContacts.photoUrl,
          city: importedContacts.city,
          country: importedContacts.country,
          shortBio: importedContacts.shortBio,
          createdAt: importedContacts.createdAt,
        })
        .from(importedContacts)
        .where(eq(importedContacts.id, sourceId))
        .limit(1);

      if (row) {
        person = {
          id,
          sourceTable: "importedContacts",
          sourceId,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.name ?? ([row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown"),
          email: row.email,
          title: row.title,
          headline: row.headline,
          linkedinUrl: row.linkedinUrl,
          photoUrl: row.photoUrl,
          location: [row.city, row.country].filter(Boolean).join(", ") || null,
          bio: row.shortBio,
          entityClass: "legacy_contact",
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }
    }

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // ─── Fetch related data in parallel ──────────────────────
    const email = person.email as string | null;
    const linkedinUrl = person.linkedinUrl as string | null;
    const acqContactId = person.acqContactId as string | null;

    const [deals, timeline, conversations] = await Promise.all([
      // Deals linked to this acqContact
      acqContactId
        ? db
            .select({
              id: acqDeals.id,
              name: acqDeals.name,
              stageLabel: acqDeals.stageLabel,
              dealValue: acqDeals.dealValue,
              status: acqDeals.status,
              source: acqDeals.source,
              priority: acqDeals.priority,
              lastActivityAt: acqDeals.lastActivityAt,
              createdAt: acqDeals.createdAt,
            })
            .from(acqDeals)
            .where(eq(acqDeals.contactId, acqContactId))
            .orderBy(desc(acqDeals.createdAt))
            .limit(20)
        : Promise.resolve([]),

      // Prospect timeline events
      email
        ? db
            .select({
              id: prospectTimeline.id,
              eventType: prospectTimeline.eventType,
              channel: prospectTimeline.channel,
              campaignName: prospectTimeline.campaignName,
              eventAt: prospectTimeline.eventAt,
            })
            .from(prospectTimeline)
            .where(eq(prospectTimeline.prospectEmail, email))
            .orderBy(desc(prospectTimeline.eventAt))
            .limit(50)
        : Promise.resolve([]),

      // LinkedIn conversations matching this person's linkedinUrl or name
      linkedinUrl
        ? db
            .select({
              id: growthOpsConversations.id,
              participantName: growthOpsConversations.participantName,
              participantHeadline: growthOpsConversations.participantHeadline,
              lastMessageAt: growthOpsConversations.lastMessageAt,
              lastMessagePreview: growthOpsConversations.lastMessagePreview,
            })
            .from(growthOpsConversations)
            .where(ilike(growthOpsConversations.participantProfileUrl, `%${linkedinUrl.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}%`))
            .orderBy(desc(growthOpsConversations.lastMessageAt))
            .limit(10)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ...person,
      deals,
      timeline,
      conversations,
    });
  } catch (error) {
    console.error("[CRM] Person detail error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
