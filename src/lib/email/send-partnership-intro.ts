/**
 * Partnership Intro Email Facilitator
 *
 * Fetches both firms' context, generates an AI-crafted three-way intro email,
 * and queues it for admin approval (always pending — never auto-sent).
 */

import { db } from "@/lib/db";
import { serviceFirms, emailApprovalQueue, members, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateIntroEmail } from "./intro-generator";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getFirmOwnerEmail(firmId: string): Promise<{ email: string; name: string } | null> {
  const member = await db.query.members.findFirst({
    where: and(eq(members.organizationId, firmId), eq(members.role, "owner")),
  });
  if (!member) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, member.userId),
    columns: { id: true, email: true, name: true },
  });
  if (!user) return null;
  return { email: user.email, name: user.name };
}

export async function queuePartnershipIntro(opts: {
  partnershipId: string;
  firmAId: string;
  firmBId: string;
  matchScore?: number;
  matchExplanation?: string;
  senderUserId: string;
}): Promise<{ queueId: string }> {
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

  if (!firmAContact || !firmBContact) {
    throw new Error("Could not resolve owner contacts for one or both firms");
  }

  // Build FirmContext objects for the intro generator
  const firmACtx = {
    name: firmA.name,
    website: firmA.website ?? undefined,
    description: firmA.description ?? undefined,
    topServices: (firmA.enrichmentData as Record<string, string[]> | null)?.services ?? undefined,
    topSkills: (firmA.enrichmentData as Record<string, string[]> | null)?.skills ?? undefined,
    industries: (firmA.enrichmentData as Record<string, string[]> | null)?.industries ?? undefined,
    contactName: firmAContact.name,
    contactEmail: firmAContact.email,
  };

  const firmBCtx = {
    name: firmB.name,
    website: firmB.website ?? undefined,
    description: firmB.description ?? undefined,
    topServices: (firmB.enrichmentData as Record<string, string[]> | null)?.services ?? undefined,
    topSkills: (firmB.enrichmentData as Record<string, string[]> | null)?.skills ?? undefined,
    industries: (firmB.enrichmentData as Record<string, string[]> | null)?.industries ?? undefined,
    contactName: firmBContact.name,
    contactEmail: firmBContact.email,
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

  // Queue for admin approval (always pending — intro emails NEVER auto-send)
  const queueId = generateId("eq");
  await db.insert(emailApprovalQueue).values({
    id: queueId,
    firmId: firmAId,
    userId: senderUserId,
    emailType: "intro",
    toEmails: [firmAContact.email, firmBContact.email],
    subject: intro.subject,
    bodyHtml: intro.htmlBody,
    bodyText: intro.textBody,
    context: { partnershipId },
    status: "pending", // Always pending — human must approve
  });

  return { queueId };
}
