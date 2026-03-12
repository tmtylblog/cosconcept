/**
 * Handler: email-process-inbound
 * Classifies inbound email, creates opportunities, generates Ossy reply, routes to queue.
 */

import { db } from "@/lib/db";
import {
  emailMessages,
  emailThreads,
  emailApprovalQueue,
  opportunities,
  memoryEntries,
  members,
  users,
  settings,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { classifyEmail, extractEmailContext } from "@/lib/ai/email-intent-classifier";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { enqueue } from "../queue";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const AUTO_SEND_THRESHOLD = 0.92;
const AUTO_SEND_INTENTS = new Set(["follow_up", "question"]);

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

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildOssyReplyHtml(text: string): string {
  const paragraphs = text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#1a1a2e;">${p.trim()}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
      ${paragraphs}
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;color:#94a3b8;">
        — Ossy, Collective OS<br>
        <a href="https://joincollectiveos.com" style="color:#1f86a1;text-decoration:none;">joincollectiveos.com</a>
      </p>
    </div>
  </div>
</body></html>`;
}

interface Payload {
  messageId: string;
  threadId: string;
  firmId: string;
  from: string;
  subject: string;
  bodyText: string;
}

export async function handleEmailProcessInbound(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { messageId, threadId, firmId, from, subject, bodyText } = payload as unknown as Payload;

  // Step 1: Classify
  const classification = await classifyEmail({ from, subject, bodyText });

  // Step 2: Update message + thread
  await db.update(emailMessages).set({
    extractedIntent: classification.intent,
    extractedEntities: classification.entities,
    confidence: classification.confidence,
    processedAt: new Date(),
  }).where(eq(emailMessages.id, messageId));

  await db.update(emailThreads).set({
    intent: classification.intent,
    updatedAt: new Date(),
  }).where(eq(emailThreads.id, threadId));

  // Step 3: Create opportunity if detected
  if (classification.intent === "opportunity" && classification.opportunitySignals) {
    if (firmId && firmId !== "unknown") {
      const ownerUserId = await getFirmOwnerUserId(firmId);
      if (ownerUserId) {
        const signals = classification.opportunitySignals;
        const oppId = generateId("opp");
        await db.insert(opportunities).values({
          id: oppId,
          firmId,
          createdBy: ownerUserId,
          title: signals.title ?? `Opportunity from ${from}`,
          description: classification.summary,
          requiredSkills: signals.requiredSkills ?? [],
          estimatedValue: signals.estimatedValue ?? null,
          timeline: signals.urgency === "immediate" ? "immediate" : signals.urgency === "soon" ? "1-3 months" : "3-6 months",
          source: "email",
          status: "new",
        });
        await db.update(emailThreads).set({ opportunityId: oppId, updatedAt: new Date() }).where(eq(emailThreads.id, threadId));
      }
    }
  }

  // Step 4: Extract context for memory
  if (classification.intent !== "unrelated" && firmId && firmId !== "unknown") {
    const ownerUserId = await getFirmOwnerUserId(firmId);
    if (ownerUserId) {
      const context = await extractEmailContext({ from, subject, bodyText, classification });
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
    }
  }

  // Step 5: Queue follow-up if needed
  if (classification.followUpNeeded) {
    await enqueue(
      "email-schedule-follow-up",
      {
        threadId,
        firmId,
        reason: classification.followUpNeeded.reason,
        action: classification.followUpNeeded.action,
        suggestedDate: classification.followUpNeeded.suggestedDate,
      },
      { delayMs: 3 * 24 * 60 * 60 * 1000 } // 3 days
    );
  }

  // Step 6: Generate Ossy response draft
  const shouldRespond = !["unrelated", "intro_response"].includes(classification.intent);
  if (!shouldRespond || !firmId || firmId === "unknown") {
    return { messageId, intent: classification.intent, confidence: classification.confidence, summary: classification.summary };
  }

  const ownerUserId = await getFirmOwnerUserId(firmId);
  if (!ownerUserId) {
    return { messageId, intent: classification.intent, confidence: classification.confidence, summary: classification.summary };
  }

  const threadMessages = await db.query.emailMessages.findMany({
    where: eq(emailMessages.threadId, threadId),
    columns: { direction: true, bodyText: true, fromEmail: true },
    limit: 5,
  });

  const threadContext = threadMessages
    .map((m) => `[${m.direction === "inbound" ? "From" : "Ossy"}]: ${m.bodyText?.slice(0, 400) ?? ""}`)
    .join("\n\n");

  const systemPrompt =
    "You are Ossy, Collective OS's AI partnership consultant. Reply in Ossy's voice — knowledgeable, warm, concise. " +
    "Keep replies under 150 words. Do not use bullet points. Sign off naturally.";

  let userPrompt: string;
  switch (classification.intent) {
    case "question":
      userPrompt = `A firm has sent a question to Ossy. Draft a helpful, concise reply.\n\nEmail from: ${from}\nSubject: ${subject}\n\nMessage:\n${bodyText.slice(0, 2000)}\n\nThread context:\n${threadContext}`;
      break;
    case "context":
      userPrompt = `A firm has shared context with Ossy. Draft a brief acknowledgement.\n\nEmail from: ${from}\nSubject: ${subject}\n\nMessage:\n${bodyText.slice(0, 2000)}`;
      break;
    case "opportunity":
      userPrompt = `A firm has shared an opportunity. Acknowledge it warmly, ask 1-2 clarifying questions.\n\nEmail from: ${from}\nSubject: ${subject}\n\nMessage:\n${bodyText.slice(0, 2000)}`;
      break;
    default:
      userPrompt = `A firm has followed up with Ossy. Draft a warm acknowledgement.\n\nEmail from: ${from}\nSubject: ${subject}\n\nMessage:\n${bodyText.slice(0, 2000)}\n\nThread context:\n${threadContext}`;
  }

  const { text: draftResult } = await generateText({
    model: openrouter.chat("anthropic/claude-sonnet-4-5"),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 400,
  });

  // Step 7: Queue response
  const isTestMode = (await getSetting("email_test_mode")) === "true";
  const isAutoApprovalEligible =
    !isTestMode &&
    classification.confidence >= AUTO_SEND_THRESHOLD &&
    AUTO_SEND_INTENTS.has(classification.intent);

  const queueStatus = isAutoApprovalEligible ? "auto_approved" : "pending";
  const queueId = generateId("eq");
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  await db.insert(emailApprovalQueue).values({
    id: queueId,
    firmId,
    userId: ownerUserId,
    emailType: "reply",
    toEmails: [from],
    subject: replySubject,
    bodyHtml: buildOssyReplyHtml(draftResult),
    bodyText: draftResult,
    context: { reason: classification.intent },
    status: queueStatus,
  });

  if (queueStatus === "auto_approved") {
    await enqueue("email-send-now", { queueId });
  }

  return {
    messageId,
    intent: classification.intent,
    confidence: classification.confidence,
    summary: classification.summary,
    response: { queued: true, queueId, status: queueStatus },
  };
}
