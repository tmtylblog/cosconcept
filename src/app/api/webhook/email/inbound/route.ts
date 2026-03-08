/**
 * Resend Inbound Email Webhook
 *
 * Resend POSTs here when an email arrives at ossy@joincollectiveos.com.
 * Flow:
 *   1. Validate HMAC-SHA256 signature
 *   2. Parse payload
 *   3. Thread detection via inReplyTo
 *   4. Calendar invite detection (ICS attachment)
 *   5. Store email_message
 *   6. Fire Inngest email/process-inbound
 *
 * Setup: Add MX record pointing to inbound.resend.com for the ossy@ subdomain,
 * then set this URL as the inbound webhook in Resend dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { emailThreads, emailMessages, scheduledCalls, serviceFirms } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";

// Resend signs inbound webhooks with HMAC-SHA256 using the signing secret
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function verifySignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // Skip in dev if not configured
  try {
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace(/^sha256=/, "")),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Detect meeting platform from URL
function detectPlatform(url: string): "google_meet" | "zoom" | "teams" | "other" {
  if (url.includes("meet.google.com")) return "google_meet";
  if (url.includes("zoom.us")) return "zoom";
  if (url.includes("teams.microsoft.com")) return "teams";
  return "other";
}

// Extract meeting link from ICS content or text
function extractMeetingLink(content: string): string | null {
  const patterns = [
    /https?:\/\/meet\.google\.com\/[a-z\-]+/,
    /https?:\/\/[\w.]*zoom\.us\/j\/[\d?&=]+/,
    /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>]+/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// Parse ICS datetime string to Date
function parseIcsDate(dtstr: string): Date | null {
  // Format: 20240315T140000Z or 20240315T140000
  const match = dtstr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, utc] = match;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${utc ? "Z" : ""}`);
}

// Minimal ICS parser — extracts key fields without external dependency
function parseIcsContent(ics: string): {
  title?: string;
  startTime?: Date;
  meetingLink?: string;
  attendees: string[];
} {
  const lines = ics.replace(/\r\n\s/g, "").replace(/\r\n/g, "\n").split("\n");
  let title: string | undefined;
  let startTime: Date | undefined;
  const attendees: string[] = [];
  let description = "";
  let location = "";

  for (const line of lines) {
    if (line.startsWith("SUMMARY:")) title = line.slice(8).trim();
    if (line.startsWith("DTSTART")) {
      const val = line.split(":").slice(1).join(":").trim();
      startTime = parseIcsDate(val) ?? undefined;
    }
    if (line.startsWith("DESCRIPTION:")) description += line.slice(12);
    if (line.startsWith("LOCATION:")) location += line.slice(9);
    if (line.startsWith("ATTENDEE")) {
      const emailMatch = line.match(/mailto:([^\s;]+)/i);
      if (emailMatch) attendees.push(emailMatch[1].toLowerCase());
    }
  }

  const meetingLink =
    extractMeetingLink(description) ?? extractMeetingLink(location) ?? undefined;

  return { title, startTime, meetingLink, attendees };
}

// Resolve firmId from sender email (best-effort lookup via serviceFirms)
async function resolveFirmId(fromEmail: string): Promise<string | null> {
  try {
    const domain = fromEmail.split("@")[1];
    if (!domain) return null;
    const firm = await db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.website, `https://${domain}`),
      columns: { id: true },
    });
    return firm?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Validate signature
  const sig = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? "";
  if (!verifySignature(rawBody, sig)) {
    console.warn("[EmailWebhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resend inbound email payload structure
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const from = (data.from ?? data.sender ?? "") as string;
  const to = (data.to ?? data.recipient ?? "") as string;
  const subject = (data.subject ?? "(no subject)") as string;
  const textBody = (data.text ?? data.plain_text ?? "") as string;
  const htmlBody = (data.html ?? "") as string;
  const messageId = (data.message_id ?? data.id ?? generateId("msg")) as string;
  const inReplyTo = (data.in_reply_to ?? "") as string;
  const attachments = (data.attachments ?? []) as Array<{ content_type?: string; content?: string; filename?: string }>;

  // Detect calendar invite
  const isCalendarInvite =
    subject.startsWith("Invitation:") ||
    attachments.some((a) => a.content_type?.includes("text/calendar"));

  // Thread detection: find existing thread via inReplyTo
  let threadId: string | null = null;

  if (inReplyTo) {
    // Look up the previous message by externalMessageId
    const prevMsg = await db.query.emailMessages.findFirst({
      where: eq(emailMessages.externalMessageId, inReplyTo),
      columns: { threadId: true },
    });
    threadId = prevMsg?.threadId ?? null;
  }

  // Resolve firm from sender email
  const firmId = (await resolveFirmId(from)) ?? "unknown";

  // Create thread if none found
  if (!threadId) {
    threadId = generateId("thr");
    await db.insert(emailThreads).values({
      id: threadId,
      firmId: firmId === "unknown" ? "unknown" : firmId,
      subject,
      participants: [from, to].filter(Boolean),
      status: "active",
      lastMessageAt: new Date(),
    }).catch(() => {
      // If firmId is "unknown" and FK fails, create without firmId reference
    });

    // If firmId unknown, we still need a thread — use a fallback
    if (firmId === "unknown") {
      // Try to insert with a no-FK version — for unknown senders we'll handle differently
      // For now, skip thread creation for truly unknown senders and proceed with message storage
      threadId = null as unknown as string;
    }
  } else {
    // Update thread's lastMessageAt
    await db
      .update(emailThreads)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(emailThreads.id, threadId));
  }

  // Store inbound message (only if we have a valid thread)
  let dbMessageId: string | null = null;
  if (threadId) {
    dbMessageId = generateId("emsg");
    await db.insert(emailMessages).values({
      id: dbMessageId,
      threadId,
      externalMessageId: messageId,
      direction: "inbound",
      fromEmail: from,
      toEmails: [to],
      subject,
      bodyHtml: htmlBody || null,
      bodyText: textBody || null,
    });
  }

  // Handle calendar invites — parse ICS and store scheduled call
  if (isCalendarInvite) {
    const icsAttachment = attachments.find((a) => a.content_type?.includes("text/calendar"));
    const icsContent = icsAttachment?.content ?? textBody;

    const parsed = parseIcsContent(icsContent);

    if (parsed.startTime && parsed.meetingLink) {
      const callId = generateId("sc");
      const platform = detectPlatform(parsed.meetingLink);

      // Only create scheduled call if we have a valid firm
      if (firmId !== "unknown") {
        const scheduledCallRow = await db
          .insert(scheduledCalls)
          .values({
            id: callId,
            firmId,
            meetingTitle: parsed.title ?? subject,
            meetingTime: parsed.startTime,
            meetingLink: parsed.meetingLink,
            platform,
            participants: parsed.attendees,
            sourceEmailThreadId: threadId ?? undefined,
            status: "pending",
          })
          .returning({ id: scheduledCalls.id });

        // Schedule Inngest job to join the meeting 2 minutes before
        const joinAt = new Date(parsed.startTime.getTime() - 2 * 60 * 1000);
        if (joinAt > new Date()) {
          await inngest.send({
            name: "calls/join-meeting",
            data: { scheduledCallId: scheduledCallRow[0].id },
            ts: joinAt.getTime(),
          } as Parameters<typeof inngest.send>[0]);
        }
      }
    }
  }

  // Fire Inngest to process the email (classify + extract + respond)
  if (threadId && dbMessageId) {
    await inngest.send({
      name: "email/process-inbound",
      data: {
        messageId: dbMessageId,
        threadId,
        firmId,
        from,
        subject,
        bodyText: textBody,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
