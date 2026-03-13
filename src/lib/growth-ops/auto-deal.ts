/**
 * Auto-deal creation from positive responses
 *
 * Two flows:
 * 1. queueDealFromResponse() — adds to approval queue (pending admin review)
 * 2. approveDealFromQueue() — admin approves → creates real deal
 */

import { db } from "@/lib/db";
import {
  acqDealQueue,
  acqContacts,
  acqCompanies,
  acqDeals,
  acqDealActivities,
  acqPipelineStages,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function randomId() {
  return crypto.randomUUID();
}

interface QueueDealInput {
  contact: {
    email?: string;
    firstName?: string;
    lastName?: string;
    linkedinUrl?: string;
    companyDomain?: string;
    companyName?: string;
  };
  source: "instantly_auto" | "linkedin_auto";
  campaignId?: string;
  campaignName?: string;
  messageId?: string;
  messageText?: string;
  sentimentScore?: number;
  sentiment?: string;
}

/** Queue a detected response for admin review */
export async function queueDealFromResponse(input: QueueDealInput): Promise<{ queueId: string; isNew: boolean }> {
  // Check for existing pending queue item for same contact+source+campaign
  const contactKey = input.contact.email || input.contact.linkedinUrl || "";
  if (contactKey) {
    const existing = await db
      .select({ id: acqDealQueue.id })
      .from(acqDealQueue)
      .where(
        and(
          eq(acqDealQueue.status, "pending"),
          eq(acqDealQueue.source, input.source),
          input.contact.email
            ? eq(acqDealQueue.contactEmail, input.contact.email)
            : eq(acqDealQueue.contactLinkedinUrl, input.contact.linkedinUrl!)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { queueId: existing[0].id, isNew: false };
    }
  }

  const queueId = randomId();
  await db.insert(acqDealQueue).values({
    id: queueId,
    contactEmail: input.contact.email ?? null,
    contactName: [input.contact.firstName, input.contact.lastName].filter(Boolean).join(" ") || null,
    contactLinkedinUrl: input.contact.linkedinUrl ?? null,
    companyName: input.contact.companyName ?? null,
    companyDomain: input.contact.companyDomain ?? null,
    source: input.source,
    sourceChannel: input.source === "instantly_auto" ? "instantly" : "linkedin",
    sourceCampaignId: input.campaignId ?? null,
    sourceCampaignName: input.campaignName ?? null,
    sourceMessageId: input.messageId ?? null,
    messageText: input.messageText ?? null,
    sentiment: input.sentiment ?? null,
    sentimentScore: input.sentimentScore ?? null,
  });

  return { queueId, isNew: true };
}

/** Admin approves a queue item → create real deal */
export async function approveDealFromQueue(
  queueId: string,
  reviewedBy: string
): Promise<{ dealId: string; contactId: string | null }> {
  const [queueItem] = await db
    .select()
    .from(acqDealQueue)
    .where(eq(acqDealQueue.id, queueId))
    .limit(1);

  if (!queueItem) throw new Error("Queue item not found");
  if (queueItem.status !== "pending") throw new Error(`Queue item already ${queueItem.status}`);

  // Upsert contact
  let contactId: string | null = null;
  if (queueItem.contactEmail) {
    const existing = await db
      .select({ id: acqContacts.id })
      .from(acqContacts)
      .where(eq(acqContacts.email, queueItem.contactEmail))
      .limit(1);

    if (existing.length > 0) {
      contactId = existing[0].id;
    } else {
      contactId = randomId();
      const nameParts = (queueItem.contactName ?? "").split(" ");
      await db.insert(acqContacts).values({
        id: contactId,
        email: queueItem.contactEmail,
        firstName: nameParts[0] ?? "",
        lastName: nameParts.slice(1).join(" ") ?? "",
        linkedinUrl: queueItem.contactLinkedinUrl ?? null,
      });
    }
  }

  // Upsert company
  let companyId: string | null = null;
  if (queueItem.companyDomain) {
    const existing = await db
      .select({ id: acqCompanies.id })
      .from(acqCompanies)
      .where(eq(acqCompanies.domain, queueItem.companyDomain))
      .limit(1);

    if (existing.length > 0) {
      companyId = existing[0].id;
    } else {
      companyId = randomId();
      await db.insert(acqCompanies).values({
        id: companyId,
        name: queueItem.companyName ?? queueItem.companyDomain,
        domain: queueItem.companyDomain,
      });
    }
  }

  // Check for existing open deal for this contact
  if (contactId) {
    const existingDeal = await db
      .select({ id: acqDeals.id })
      .from(acqDeals)
      .where(and(eq(acqDeals.contactId, contactId), eq(acqDeals.status, "open")))
      .limit(1);

    if (existingDeal.length > 0) {
      // Update queue item to point to existing deal
      await db
        .update(acqDealQueue)
        .set({
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy,
          createdDealId: existingDeal[0].id,
        })
        .where(eq(acqDealQueue.id, queueId));

      return { dealId: existingDeal[0].id, contactId };
    }
  }

  // Find initial stage (first stage by display order)
  const stages = await db
    .select()
    .from(acqPipelineStages)
    .where(eq(acqPipelineStages.pipelineId, "default"));

  const firstStage = stages.sort((a, b) => a.displayOrder - b.displayOrder)[0];

  // Create deal
  const dealId = randomId();
  const dealName = queueItem.contactName
    ? `${queueItem.contactName}${queueItem.companyName ? ` - ${queueItem.companyName}` : ""}`
    : queueItem.contactEmail ?? queueItem.contactLinkedinUrl ?? "New Deal";

  await db.insert(acqDeals).values({
    id: dealId,
    name: dealName,
    contactId,
    companyId,
    stageId: firstStage?.id ?? null,
    stageLabel: firstStage?.label ?? "Prospect",
    source: queueItem.source,
    sourceChannel: queueItem.sourceChannel,
    sourceCampaignId: queueItem.sourceCampaignId,
    sourceCampaignName: queueItem.sourceCampaignName,
    sourceMessageId: queueItem.sourceMessageId,
    sentimentScore: queueItem.sentimentScore,
    priority: "normal",
    lastActivityAt: new Date(),
  });

  // Create activity
  await db.insert(acqDealActivities).values({
    id: randomId(),
    dealId,
    activityType: "auto_created",
    description: `Deal auto-created from ${queueItem.sourceChannel} response (approved by admin)`,
    metadata: {
      source: queueItem.source,
      campaign: queueItem.sourceCampaignName,
      sentiment: queueItem.sentiment,
      messagePreview: queueItem.messageText?.slice(0, 200),
    },
  });

  // Update queue item
  await db
    .update(acqDealQueue)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy,
      createdDealId: dealId,
    })
    .where(eq(acqDealQueue.id, queueId));

  return { dealId, contactId };
}

/** Admin rejects a queue item */
export async function rejectDealFromQueue(queueId: string, reviewedBy: string): Promise<void> {
  await db
    .update(acqDealQueue)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy,
    })
    .where(eq(acqDealQueue.id, queueId));
}
