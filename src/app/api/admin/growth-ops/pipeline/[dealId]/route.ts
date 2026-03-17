import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acqDeals,
  acqDealActivities,
  acqContacts,
  acqCompanies,
  acqPipelineStages,
  attributionTouchpoints,
  acqDealContacts,
  acqDealQueue,
} from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || (session.user as Record<string, unknown>).role !== "superadmin") return null;
  return session;
}

// GET — full deal detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { dealId } = await params;

  try {
    // Get deal with contact and company
    const [deal] = await db
      .select({
        id: acqDeals.id,
        name: acqDeals.name,
        stageId: acqDeals.stageId,
        stageLabel: acqDeals.stageLabel,
        dealValue: acqDeals.dealValue,
        status: acqDeals.status,
        source: acqDeals.source,
        sourceChannel: acqDeals.sourceChannel,
        sourceCampaignId: acqDeals.sourceCampaignId,
        sourceCampaignName: acqDeals.sourceCampaignName,
        sourceMessageId: acqDeals.sourceMessageId,
        notes: acqDeals.notes,
        customFields: acqDeals.customFields,
        priority: acqDeals.priority,
        lastActivityAt: acqDeals.lastActivityAt,
        sentimentScore: acqDeals.sentimentScore,
        hubspotDealId: acqDeals.hubspotDealId,
        hubspotStageId: acqDeals.hubspotStageId,
        closedAt: acqDeals.closedAt,
        createdAt: acqDeals.createdAt,
        updatedAt: acqDeals.updatedAt,
        contactId: acqDeals.contactId,
        companyId: acqDeals.companyId,
      })
      .from(acqDeals)
      .where(eq(acqDeals.id, dealId))
      .limit(1);

    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    // Get contact details
    let contact = null;
    if (deal.contactId) {
      const [c] = await db.select().from(acqContacts).where(eq(acqContacts.id, deal.contactId)).limit(1);
      contact = c ?? null;
    }

    // Get company details
    let company = null;
    if (deal.companyId) {
      const [c] = await db.select().from(acqCompanies).where(eq(acqCompanies.id, deal.companyId)).limit(1);
      company = c ?? null;
    }

    // Get stages for stage-change dropdown
    const stages = await db
      .select()
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(acqPipelineStages.displayOrder);

    // Get deal activities
    const activities = await db
      .select()
      .from(acqDealActivities)
      .where(eq(acqDealActivities.dealId, dealId))
      .orderBy(desc(acqDealActivities.createdAt))
      .limit(100);

    // Get attribution touchpoints if contact has a cosUserId
    let touchpoints: typeof attributionTouchpoints.$inferSelect[] = [];
    if (contact?.cosUserId) {
      touchpoints = await db
        .select()
        .from(attributionTouchpoints)
        .where(eq(attributionTouchpoints.userId, contact.cosUserId))
        .orderBy(desc(attributionTouchpoints.touchpointAt));
    }

    // Get all linked contacts via junction table
    const dealContactRows = await db
      .select({
        id: acqContacts.id,
        firstName: acqContacts.firstName,
        lastName: acqContacts.lastName,
        email: acqContacts.email,
        linkedinUrl: acqContacts.linkedinUrl,
        companyId: acqContacts.companyId,
        role: acqDealContacts.role,
      })
      .from(acqDealContacts)
      .innerJoin(acqContacts, eq(acqDealContacts.contactId, acqContacts.id))
      .where(eq(acqDealContacts.dealId, dealId));

    // Get original queue message if deal was created from queue
    let queueMessage: string | null = null;
    if (deal.sourceMessageId) {
      const [queueItem] = await db
        .select({ messageText: acqDealQueue.messageText })
        .from(acqDealQueue)
        .where(eq(acqDealQueue.sourceMessageId, deal.sourceMessageId))
        .limit(1);
      queueMessage = queueItem?.messageText ?? null;
    }
    // Also check by createdDealId
    if (!queueMessage) {
      const [queueItem] = await db
        .select({ messageText: acqDealQueue.messageText })
        .from(acqDealQueue)
        .where(eq(acqDealQueue.createdDealId, dealId))
        .limit(1);
      queueMessage = queueItem?.messageText ?? null;
    }

    return NextResponse.json({
      deal,
      contact,
      company,
      stages,
      activities,
      touchpoints,
      dealContacts: dealContactRows,
      queueMessage,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
