/**
 * Inbound Email Webhook
 *
 * POST /api/webhooks/email — Receives inbound emails (from Resend webhook)
 *
 * When someone sends or CCs ossy@joincollectiveos.com, Resend
 * forwards the email here for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailThreads, emailMessages, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface InboundEmail {
  from: string;
  from_name?: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  message_id?: string;
  in_reply_to?: string;
  headers?: Record<string, string>;
}

/**
 * POST — Receive inbound email from Resend webhook.
 *
 * Resend sends a POST with the parsed email data.
 * We store it, find or create a thread, then trigger AI processing.
 */
export async function POST(req: NextRequest) {
  // Verify webhook secret (simple bearer token check)
  const authHeader = req.headers.get("authorization");
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as InboundEmail;
  const { from, from_name, to, cc, subject, html, text, message_id } = body;

  if (!from || !subject) {
    return NextResponse.json(
      { error: "from and subject are required" },
      { status: 400 }
    );
  }

  const toEmails = Array.isArray(to) ? to : [to];
  const ccEmails = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
  const allParticipants = [from, ...toEmails, ...ccEmails];

  // Try to find which firm this email relates to (by sender domain)
  const senderDomain = from.split("@")[1]?.toLowerCase();
  let firmId: string | null = null;

  if (senderDomain) {
    const firm = await db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.website, senderDomain),
      columns: { id: true },
    });
    if (firm) {
      firmId = firm.id;
    }
  }

  // If no firm found by domain, try matching any participant email to known firms
  if (!firmId) {
    for (const email of allParticipants) {
      const domain = email.split("@")[1]?.toLowerCase();
      if (domain && domain !== "joincollectiveos.com") {
        const firm = await db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.website, domain),
          columns: { id: true },
        });
        if (firm) {
          firmId = firm.id;
          break;
        }
      }
    }
  }

  // Find existing thread or create new one
  const threadId = generateId("eth");
  const messageId = generateId("emg");

  // Look for an existing thread by subject match (simplified threading)
  const normalizedSubject = subject.replace(/^(Re|Fwd|Fw):\s*/gi, "").trim();
  let existingThread = null;

  if (firmId) {
    existingThread = await db.query.emailThreads.findFirst({
      where: eq(emailThreads.subject, normalizedSubject),
    });
  }

  const finalThreadId = existingThread?.id ?? threadId;

  // Create thread if new
  if (!existingThread) {
    await db.insert(emailThreads).values({
      id: threadId,
      firmId: firmId ?? "unknown",
      subject: normalizedSubject,
      participants: allParticipants,
      status: "active",
      lastMessageAt: new Date(),
    });
  } else {
    // Update existing thread's last message time
    await db
      .update(emailThreads)
      .set({
        lastMessageAt: new Date(),
        updatedAt: new Date(),
        participants: [
          ...new Set([
            ...(existingThread.participants as string[] ?? []),
            ...allParticipants,
          ]),
        ],
      })
      .where(eq(emailThreads.id, existingThread.id));
  }

  // Store the message
  await db.insert(emailMessages).values({
    id: messageId,
    threadId: finalThreadId,
    externalMessageId: message_id ?? null,
    direction: "inbound",
    fromEmail: from,
    fromName: from_name ?? null,
    toEmails,
    ccEmails: ccEmails.length > 0 ? ccEmails : null,
    subject,
    bodyHtml: html ?? null,
    bodyText: text ?? null,
  });

  // Trigger AI processing via Inngest
  await inngest.send({
    name: "email/process-inbound",
    data: {
      messageId,
      threadId: finalThreadId,
      firmId,
      from,
      subject: normalizedSubject,
      bodyText: text ?? "",
    },
  });

  return NextResponse.json({ threadId: finalThreadId, messageId });
}
