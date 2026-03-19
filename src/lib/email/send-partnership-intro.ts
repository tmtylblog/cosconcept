/**
 * Partnership Intro Email Facilitator
 *
 * Fetches both firms' context, generates an AI-crafted three-way intro email,
 * and queues it for admin approval.
 *
 * Auto-send behaviour:
 *   When the `partnership_intro_auto_send` platform setting is "true", the
 *   email is sent immediately to test addresses
 *   (masa+{firmSlug}@joincollectiveos.com) and the queue entry is marked
 *   "sent".  When the setting is "false" (default), the entry stays "pending"
 *   for manual admin review in /admin/email.
 */

import { db } from "@/lib/db";
import { serviceFirms, emailApprovalQueue, members, users, settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateIntroEmail } from "./intro-generator";
import { sendEmail } from "./email-client";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Slugify a firm name into a safe email local-part: "Acme Corp" → "acmecorp" */
function toTestEmail(firmName: string): string {
  const slug = firmName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `masa+${slug}@joincollectiveos.com`;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function getFirmOwnerEmail(
  firmId: string
): Promise<{ email: string; name: string; isFallback?: boolean } | null> {
  // serviceFirms.id !== organizations.id — must resolve org ID from the firm first
  const firm = await db.query.serviceFirms.findFirst({
    where: eq(serviceFirms.id, firmId),
    columns: { organizationId: true, name: true, website: true },
  });
  if (!firm) return null;

  // Try to find owner via org membership
  if (firm.organizationId) {
    const member = await db.query.members.findFirst({
      where: and(eq(members.organizationId, firm.organizationId), eq(members.role, "owner")),
    });
    if (member) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, member.userId),
        columns: { id: true, email: true, name: true },
      });
      if (user) return { email: user.email, name: user.name };
    }

    // Fallback: any member of the org
    const anyMember = await db.query.members.findFirst({
      where: eq(members.organizationId, firm.organizationId),
    });
    if (anyMember) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, anyMember.userId),
        columns: { id: true, email: true, name: true },
      });
      if (user) return { email: user.email, name: user.name };
    }
  }

  // Last resort: construct a contact from the firm's website domain
  if (firm.website) {
    const domain = firm.website
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (domain) {
      return { email: `info@${domain}`, name: firm.name, isFallback: true };
    }
  }

  return null;
}

export async function queuePartnershipIntro(opts: {
  partnershipId: string;
  firmAId: string;
  firmBId: string;
  matchScore?: number;
  matchExplanation?: string;
  senderUserId: string;
}): Promise<{ queueId: string; autoSent: boolean }> {
  const { partnershipId, firmAId, firmBId, matchScore, matchExplanation, senderUserId } = opts;

  // Fetch both firms
  const [firmA, firmB] = await Promise.all([
    db.query.serviceFirms.findFirst({ where: eq(serviceFirms.id, firmAId) }),
    db.query.serviceFirms.findFirst({ where: eq(serviceFirms.id, firmBId) }),
  ]);

  if (!firmA || !firmB) throw new Error("One or both firms not found");

  // Get owner contact info for each firm
  const [firmAContact, firmBContact] = await Promise.all([
    getFirmOwnerEmail(firmAId),
    getFirmOwnerEmail(firmBId),
  ]);

  // Use placeholder if a firm has no linked user or website
  const resolvedA = firmAContact ?? { email: `partner@${firmA.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`, name: firmA.name, isFallback: true };
  const resolvedB = firmBContact ?? { email: `partner@${firmB.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`, name: firmB.name, isFallback: true };

  // Build FirmContext objects for the intro generator
  const firmACtx = {
    name: firmA.name,
    website: firmA.website ?? undefined,
    description: firmA.description ?? undefined,
    topServices: (firmA.enrichmentData as Record<string, string[]> | null)?.services ?? undefined,
    topSkills: (firmA.enrichmentData as Record<string, string[]> | null)?.skills ?? undefined,
    industries: (firmA.enrichmentData as Record<string, string[]> | null)?.industries ?? undefined,
    contactName: resolvedA.name,
    contactEmail: resolvedA.email,
  };

  const firmBCtx = {
    name: firmB.name,
    website: firmB.website ?? undefined,
    description: firmB.description ?? undefined,
    topServices: (firmB.enrichmentData as Record<string, string[]> | null)?.services ?? undefined,
    topSkills: (firmB.enrichmentData as Record<string, string[]> | null)?.skills ?? undefined,
    industries: (firmB.enrichmentData as Record<string, string[]> | null)?.industries ?? undefined,
    contactName: resolvedB.name,
    contactEmail: resolvedB.email,
  };

  // Generate intro email content
  const intro = await generateIntroEmail({
    partnershipId,
    firmA: firmACtx,
    firmB: firmBCtx,
    matchScore,
    matchExplanation,
    senderUserId,
  });

  // Check whether auto-send is enabled for intro emails
  const autoSend = (await getSetting("partnership_intro_auto_send")) === "true";

  // Build test recipient addresses
  const testEmailA = toTestEmail(firmA.name);
  const testEmailB = toTestEmail(firmB.name);

  // Insert queue entry — status depends on auto-send toggle
  const queueId = generateId("eq");
  await db.insert(emailApprovalQueue).values({
    id: queueId,
    firmId: firmAId,
    userId: senderUserId,
    emailType: "intro",
    toEmails: autoSend ? [testEmailA, testEmailB] : [resolvedA.email, resolvedB.email],
    subject: intro.subject,
    bodyHtml: intro.htmlBody,
    bodyText: intro.textBody,
    context: { partnershipId },
    status: autoSend ? "sent" : "pending",
    ...(autoSend ? { sentAt: new Date() } : {}),
  });

  // If auto-send is ON, fire the email immediately to test addresses
  if (autoSend) {
    const result = await sendEmail({
      to: [testEmailA, testEmailB],
      subject: intro.subject,
      html: intro.htmlBody,
      text: intro.textBody,
      tags: [
        { name: "type", value: "partnership_intro" },
        { name: "partnership_id", value: partnershipId },
      ],
    });

    if (result.success && result.messageId) {
      await db
        .update(emailApprovalQueue)
        .set({ externalMessageId: result.messageId })
        .where(eq(emailApprovalQueue.id, queueId));
    }
  }

  return { queueId, autoSent: autoSend };
}
