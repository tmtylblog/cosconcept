/**
 * Process Inbound Email — Inngest Function
 *
 * Triggered when an email is received at ossy@joincollectiveos.com.
 * Classifies intent, extracts entities, and takes appropriate action.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  emailMessages,
  emailThreads,
  opportunities,
  memoryEntries,
  members,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { classifyEmail, extractEmailContext } from "@/lib/ai/email-intent-classifier";

/**
 * Resolve the owner user ID for a firm (org).
 * Falls back to null if no owner is found.
 */
async function getFirmOwnerUserId(firmId: string): Promise<string | null> {
  try {
    const member = await db.query.members.findFirst({
      where: and(eq(members.organizationId, firmId), eq(members.role, "owner")),
    });
    if (!member) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, member.userId),
      columns: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const processInboundEmail = inngest.createFunction(
  { id: "process-inbound-email", name: "Process Inbound Email" },
  { event: "email/process-inbound" },
  async ({ event, step }) => {
    const { messageId, threadId, firmId, from, subject, bodyText } = event.data;

    // Step 1: Classify the email
    const classification = await step.run("classify-email", async () => {
      return classifyEmail({
        from,
        subject,
        bodyText,
      });
    });

    // Step 2: Update the message with classification results
    await step.run("update-message-classification", async () => {
      await db
        .update(emailMessages)
        .set({
          extractedIntent: classification.intent,
          extractedEntities: classification.entities,
          confidence: classification.confidence,
          processedAt: new Date(),
        })
        .where(eq(emailMessages.id, messageId));

      // Update thread intent
      await db
        .update(emailThreads)
        .set({
          intent: classification.intent,
          updatedAt: new Date(),
        })
        .where(eq(emailThreads.id, threadId));
    });

    // Step 3: Take action based on intent
    if (classification.intent === "opportunity" && classification.opportunitySignals) {
      await step.run("create-opportunity-from-email", async () => {
        if (!firmId || firmId === "unknown") return;

        // Resolve the firm owner's user ID to avoid FK violation
        const ownerUserId = await getFirmOwnerUserId(firmId);
        if (!ownerUserId) {
          console.warn(`[ProcessEmail] No owner found for firm ${firmId}, skipping opportunity creation`);
          return;
        }

        const signals = classification.opportunitySignals!;
        const oppId = generateId("opp");

        await db.insert(opportunities).values({
          id: oppId,
          firmId,
          createdBy: ownerUserId,
          title: signals.title ?? `Opportunity from ${from}`,
          description: classification.summary,
          requiredSkills: signals.requiredSkills ?? null,
          estimatedValue: signals.estimatedValue ?? null,
          timeline:
            signals.urgency === "immediate"
              ? "immediate"
              : signals.urgency === "soon"
                ? "1-3 months"
                : "3-6 months",
          source: "email",
          status: "open",
        });

        // Link opportunity to thread
        await db
          .update(emailThreads)
          .set({ opportunityId: oppId, updatedAt: new Date() })
          .where(eq(emailThreads.id, threadId));

        return { opportunityId: oppId };
      });
    }

    // Step 4: Extract context for memory
    if (classification.intent !== "unrelated" && firmId && firmId !== "unknown") {
      await step.run("extract-email-context", async () => {
        // Resolve the firm owner's user ID to avoid FK violation on memoryEntries.userId
        const ownerUserId = await getFirmOwnerUserId(firmId);
        if (!ownerUserId) {
          console.warn(`[ProcessEmail] No owner found for firm ${firmId}, skipping memory extraction`);
          return { themes: [], keyFacts: [] };
        }

        const context = await extractEmailContext({
          from,
          subject,
          bodyText,
          classification,
        });

        // Store key facts as memory entries
        for (const fact of context.keyFacts) {
          await db.insert(memoryEntries).values({
            id: generateId("mem"),
            userId: ownerUserId,
            organizationId: firmId,
            theme: "email_intelligence",
            content: fact,
            confidence: classification.confidence,
            sourceConversationId: threadId,
            sourceMessageId: messageId,
          });
        }

        return context;
      });
    }

    // Step 5: Queue follow-up if needed
    if (classification.followUpNeeded) {
      await step.run("queue-follow-up", async () => {
        // Send a follow-up event to be processed later
        await inngest.send({
          name: "email/schedule-follow-up",
          data: {
            threadId,
            firmId,
            reason: classification.followUpNeeded!.reason,
            action: classification.followUpNeeded!.action,
            suggestedDate: classification.followUpNeeded!.suggestedDate,
          },
        });
      });
    }

    return {
      messageId,
      intent: classification.intent,
      confidence: classification.confidence,
      summary: classification.summary,
      actionsToken: classification.intent === "opportunity" ? "opportunity_created" : "classified",
    };
  }
);
