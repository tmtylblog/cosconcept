/**
 * attribution-check job handler
 *
 * Runs after a new user signs up. Attempts to attribute their signup to
 * an acquisition campaign (Instantly email campaign or LinkedIn invite campaign).
 *
 * Attribution cascade:
 *   1. Email exact match → acq_contacts.email
 *   2. Instantly lead match → POST /api/v2/leads/list by email
 *   3. LinkedIn URL match → growth_ops_invite_targets.linkedin_url
 *   4. Name + domain fallback → acq_contacts first_name + email domain
 *   5. Record "none" if no match found
 *
 * After matching, pushes cos_user_id back to HubSpot if a contact is found.
 *
 * See docs/context/crm-acquisition.md for full context.
 */

import { db } from "@/lib/db";
import {
  attributionEvents,
  attributionTouchpoints,
  acqContacts,
  acqDeals,
  growthOpsInviteTargets,
  growthOpsInviteCampaigns,
  growthOpsInviteQueue,
  growthOpsConversations,
  growthOpsMessages,
  users,
} from "@/lib/db/schema";
import { HubSpotClient } from "@/lib/growth-ops/HubSpotClient";
import { InstantlyClient } from "@/lib/growth-ops/InstantlyClient";
import { eq, and, ilike, sql } from "drizzle-orm";

function randomId() {
  return crypto.randomUUID();
}

type AttributionPayload = {
  userId: string;
  email: string;
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export async function handleAttributionCheck(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { userId, email, linkedinUrl, firstName } =
    payload as AttributionPayload;

  if (!userId || !email) {
    return { skipped: true, reason: "Missing userId or email" };
  }

  // Idempotency: skip if already attributed
  const existing = await db
    .select({ id: attributionEvents.id })
    .from(attributionEvents)
    .where(eq(attributionEvents.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return { skipped: true, reason: "Already attributed" };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  let contactId: string | null = null;
  let instantlyCampaignId: string | null = null;
  let instantlyCampaignName: string | null = null;
  let linkedinCampaignId: string | null = null;
  let linkedinInviteTargetId: string | null = null;
  let matchMethod = "none";

  // ── Step 1: Email exact match in acq_contacts ────────────────────────────
  const contactRows = await db
    .select()
    .from(acqContacts)
    .where(eq(acqContacts.email, normalizedEmail))
    .limit(1);

  if (contactRows.length > 0) {
    contactId = contactRows[0].id;
    matchMethod = "email_exact";

    // Update acq_contact with cos_user_id
    await db
      .update(acqContacts)
      .set({ cosUserId: userId, updatedAt: now })
      .where(eq(acqContacts.id, contactId));

    // Push cos_user_id back to HubSpot if we have the HubSpot contact ID
    const hsContactId = contactRows[0].hubspotContactId;
    if (hsContactId && process.env.HUBSPOT_ACCESS_TOKEN) {
      try {
        await HubSpotClient.updateContact(hsContactId, {
          cos_user_id: userId,
          cos_signup_date: now.toISOString().split("T")[0],
          cos_attribution_source: "direct",
        });

        // Also move the associated deal to "Customer" stage if it exists
        await markDealAsWon(contactId, hsContactId);
      } catch {
        // HubSpot push failure is non-critical
      }
    }
  }

  // ── Step 2: Instantly lead match ─────────────────────────────────────────
  if (process.env.INSTANTLY_API_KEY) {
    try {
      const campaigns = (await InstantlyClient.listCampaigns(100)) as {
        items?: { id: string; name: string }[];
      };
      const campaignList = campaigns?.items ?? (campaigns as unknown as { id: string; name: string }[]) ?? [];

      for (const campaign of campaignList) {
        try {
          const leadsResp = (await InstantlyClient.listLeads(
            campaign.id,
            20
          )) as {
            items?: { email?: string }[];
            next_starting_after?: string;
          };
          const leads = leadsResp?.items ?? [];

          const found = leads.some(
            (l) => l.email?.toLowerCase().trim() === normalizedEmail
          );

          if (found) {
            instantlyCampaignId = campaign.id;
            instantlyCampaignName = campaign.name;
            if (matchMethod === "none") matchMethod = "instantly";

            // Update HubSpot with attribution source
            if (contactRows[0]?.hubspotContactId && process.env.HUBSPOT_ACCESS_TOKEN) {
              try {
                await HubSpotClient.updateContact(contactRows[0].hubspotContactId, {
                  cos_attribution_source: "instantly",
                  cos_attribution_campaign: campaign.name,
                });
                if (contactId) {
                  await HubSpotClient.createNote(
                    `COS Attribution: Signed up from Instantly campaign "${campaign.name}"`,
                    contactRows[0].hubspotContactId
                  );
                }
              } catch {
                // non-critical
              }
            }
            break;
          }
        } catch {
          // Individual campaign lookup failure — continue
        }
      }
    } catch {
      // Instantly API failure — continue
    }
  }

  // ── Step 3: LinkedIn URL match ───────────────────────────────────────────
  if (linkedinUrl && matchMethod !== "email_exact") {
    const normalizedLinkedin = linkedinUrl.toLowerCase().trim().replace(/\/$/, "");

    const targetRows = await db
      .select({
        id: growthOpsInviteTargets.id,
        listId: growthOpsInviteTargets.listId,
      })
      .from(growthOpsInviteTargets)
      .where(ilike(growthOpsInviteTargets.linkedinUrl, normalizedLinkedin))
      .limit(1);

    if (targetRows.length > 0) {
      const target = targetRows[0];
      linkedinInviteTargetId = target.id;
      matchMethod = "linkedin_url";

      // Find which campaign this target was part of
      const queueRow = await db
        .select({ campaignId: growthOpsInviteQueue.campaignId })
        .from(growthOpsInviteQueue)
        .where(eq(growthOpsInviteQueue.targetId, target.id))
        .limit(1);

      if (queueRow.length > 0) {
        linkedinCampaignId = queueRow[0].campaignId;

        // Add HubSpot note if we have a contact
        if (contactRows[0]?.hubspotContactId && process.env.HUBSPOT_ACCESS_TOKEN) {
          try {
            const [campaign] = await db
              .select({ name: growthOpsInviteCampaigns.name })
              .from(growthOpsInviteCampaigns)
              .where(eq(growthOpsInviteCampaigns.id, linkedinCampaignId))
              .limit(1);

            await HubSpotClient.updateContact(contactRows[0].hubspotContactId, {
              cos_attribution_source: "linkedin",
              cos_attribution_campaign: campaign?.name ?? linkedinCampaignId,
            });

            if (contactId) {
              await HubSpotClient.createNote(
                `COS Attribution: Signed up from LinkedIn campaign "${campaign?.name ?? linkedinCampaignId}"`,
                contactRows[0].hubspotContactId
              );
            }
          } catch {
            // non-critical
          }
        }
      }
    }
  }

  // ── Step 4: Name + domain fallback ──────────────────────────────────────
  if (matchMethod === "none" && firstName) {
    const domain = normalizedEmail.split("@")[1];
    if (domain) {
      const fallbackRows = await db
        .select({ id: acqContacts.id, hubspotContactId: acqContacts.hubspotContactId })
        .from(acqContacts)
        .where(
          and(
            ilike(acqContacts.firstName, firstName.trim()),
            ilike(acqContacts.email, `%@${domain}`)
          )
        )
        .limit(1);

      if (fallbackRows.length > 0) {
        contactId = fallbackRows[0].id;
        matchMethod = "name_domain";

        await db
          .update(acqContacts)
          .set({ cosUserId: userId, updatedAt: now })
          .where(eq(acqContacts.id, contactId));

        if (fallbackRows[0].hubspotContactId && process.env.HUBSPOT_ACCESS_TOKEN) {
          try {
            await HubSpotClient.updateContact(fallbackRows[0].hubspotContactId, {
              cos_user_id: userId,
              cos_signup_date: now.toISOString().split("T")[0],
              cos_attribution_source: "direct",
            });
            await markDealAsWon(contactId, fallbackRows[0].hubspotContactId);
          } catch {
            // non-critical
          }
        }
      }
    }
  }

  // ── Step 5: Write attribution event ─────────────────────────────────────
  await db.insert(attributionEvents).values({
    id: randomId(),
    userId,
    contactId,
    instantlyCampaignId,
    instantlyCampaignName,
    linkedinCampaignId,
    linkedinInviteTargetId,
    matchMethod,
    matchedAt: matchMethod !== "none" ? now : null,
  });

  // ── Step 6: Record ALL touchpoints (multi-touch attribution) ──────────
  // Scans for every interaction this user had across all channels,
  // regardless of which was the primary match method.
  try {
    await recordTouchpoints(userId, normalizedEmail, linkedinUrl ?? null, {
      instantlyCampaignId,
      instantlyCampaignName,
    });
  } catch {
    // Touchpoint recording failure is non-critical — never blocks attribution
  }

  return {
    userId,
    matchMethod,
    contactId,
    instantlyCampaignId,
    linkedinCampaignId,
  };
}

/**
 * Record all touchpoints for a user across LinkedIn organic, LinkedIn campaigns,
 * and Instantly campaigns. Updates the boolean flags on attribution_events.
 */
async function recordTouchpoints(
  userId: string,
  email: string,
  linkedinUrl: string | null,
  instantly: { instantlyCampaignId: string | null; instantlyCampaignName: string | null }
): Promise<void> {
  const touchpoints: {
    channel: string;
    sourceId: string | null;
    sourceName: string | null;
    touchpointAt: Date;
    interactionType: string;
  }[] = [];

  let hasLinkedinOrganic = false;
  let hasLinkedinCampaign = false;
  let linkedinConversationCount = 0;

  // Resolve user LinkedIn URL if not provided in payload
  let userLinkedinUrl = linkedinUrl;
  if (!userLinkedinUrl) {
    const [user] = await db
      .select({ linkedinUrl: users.linkedinUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    userLinkedinUrl = user?.linkedinUrl ?? null;
  }

  // ── LinkedIn organic conversations ───────────────────────────────────
  if (userLinkedinUrl) {
    const normalizedLinkedin = userLinkedinUrl.toLowerCase().trim().replace(/\/$/, "");

    const convos = await db
      .select({
        id: growthOpsConversations.id,
        participantName: growthOpsConversations.participantName,
        lastMessageAt: growthOpsConversations.lastMessageAt,
        chatId: growthOpsConversations.chatId,
      })
      .from(growthOpsConversations)
      .where(sql`LOWER(RTRIM(${growthOpsConversations.participantProfileUrl}, '/')) = ${normalizedLinkedin}`);

    if (convos.length > 0) {
      hasLinkedinOrganic = true;
      linkedinConversationCount = convos.length;

      for (const convo of convos) {
        // Count messages in this conversation
        const [msgCount] = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(growthOpsMessages)
          .where(eq(growthOpsMessages.chatId, convo.chatId));

        touchpoints.push({
          channel: "linkedin_organic_conversation",
          sourceId: convo.id,
          sourceName: convo.participantName,
          touchpointAt: convo.lastMessageAt ?? new Date(),
          interactionType: (msgCount?.count ?? 0) > 1 ? "replied" : "conversation_started",
        });
      }
    }

    // ── LinkedIn campaign invites ────────────────────────────────────────
    const targets = await db
      .select({ id: growthOpsInviteTargets.id })
      .from(growthOpsInviteTargets)
      .where(sql`LOWER(RTRIM(${growthOpsInviteTargets.linkedinUrl}, '/')) = ${normalizedLinkedin}`);

    for (const target of targets) {
      const queueRows = await db
        .select({
          campaignId: growthOpsInviteQueue.campaignId,
          status: growthOpsInviteQueue.status,
          sentAt: growthOpsInviteQueue.sentAt,
          acceptedAt: growthOpsInviteQueue.acceptedAt,
        })
        .from(growthOpsInviteQueue)
        .where(eq(growthOpsInviteQueue.targetId, target.id));

      for (const q of queueRows) {
        hasLinkedinCampaign = true;

        const [campaign] = await db
          .select({ name: growthOpsInviteCampaigns.name })
          .from(growthOpsInviteCampaigns)
          .where(eq(growthOpsInviteCampaigns.id, q.campaignId))
          .limit(1);

        if (q.sentAt) {
          touchpoints.push({
            channel: "linkedin_campaign_invite",
            sourceId: q.campaignId,
            sourceName: campaign?.name ?? null,
            touchpointAt: q.sentAt,
            interactionType: "sent",
          });
        }
        if (q.acceptedAt) {
          touchpoints.push({
            channel: "linkedin_campaign_invite",
            sourceId: q.campaignId,
            sourceName: campaign?.name ?? null,
            touchpointAt: q.acceptedAt,
            interactionType: "accepted",
          });
        }
      }
    }
  }

  // ── Instantly campaign touchpoint ──────────────────────────────────────
  if (instantly.instantlyCampaignId) {
    touchpoints.push({
      channel: "instantly_email",
      sourceId: instantly.instantlyCampaignId,
      sourceName: instantly.instantlyCampaignName,
      touchpointAt: new Date(),
      interactionType: "sent",
    });
  }

  // ── Write touchpoints ─────────────────────────────────────────────────
  if (touchpoints.length > 0) {
    await db.insert(attributionTouchpoints).values(
      touchpoints.map((tp) => ({
        id: randomId(),
        userId,
        channel: tp.channel,
        sourceId: tp.sourceId,
        sourceName: tp.sourceName,
        touchpointAt: tp.touchpointAt,
        interactionType: tp.interactionType,
      }))
    );
  }

  // ── Update attribution_events with multi-touch flags ──────────────────
  await db
    .update(attributionEvents)
    .set({
      hasLinkedinOrganic,
      hasLinkedinCampaign,
      linkedinConversationCount,
    })
    .where(eq(attributionEvents.userId, userId));
}

/**
 * Find the open deal linked to a contact and mark it as won in both
 * COS (acq_deals) and HubSpot.
 */
async function markDealAsWon(
  cosContactId: string,
  hsContactId: string
): Promise<void> {
  const now = new Date();

  // Mark COS deal as won
  await db
    .update(acqDeals)
    .set({ status: "won", closedAt: now, updatedAt: now })
    .where(
      and(
        eq(acqDeals.contactId, cosContactId),
        eq(acqDeals.status, "open")
      )
    );

  // Find HubSpot deal to move to customer stage
  try {
    const assoc = (await HubSpotClient.getContactDeals(hsContactId)) as {
      results: { id: string }[];
    };
    const dealId = assoc.results?.[0]?.id;
    if (dealId) {
      // "closedwon" is the standard HubSpot closed-won stage ID
      // The actual stage ID depends on the pipeline, but updating via property works
      await HubSpotClient.updateDeal(dealId, {
        dealstage: "closedwon",
        cos_customer: "true",
      });
    }
  } catch {
    // non-critical
  }
}
