/**
 * Partnership Intro Email API
 *
 * POST /api/partnerships/intro — Generate + optionally send intro email
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { partnerships, serviceFirms, users, members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateIntroEmail, sendIntroEmail } from "@/lib/email/intro-generator";

/**
 * POST — Generate (and optionally send) a three-way intro email.
 *
 * Body: { partnershipId, send?: boolean }
 *
 * If send=false (default), returns the draft email for review.
 * If send=true, sends the email immediately.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { partnershipId, send = false } = body;

  if (!partnershipId) {
    return NextResponse.json(
      { error: "partnershipId is required" },
      { status: 400 }
    );
  }

  // Get partnership
  const partnership = await db.query.partnerships.findFirst({
    where: eq(partnerships.id, partnershipId),
  });

  if (!partnership) {
    return NextResponse.json({ error: "Partnership not found" }, { status: 404 });
  }

  // Get both firms
  const [firmA, firmB] = await Promise.all([
    db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.id, partnership.firmAId),
    }),
    db.query.serviceFirms.findFirst({
      where: eq(serviceFirms.id, partnership.firmBId),
    }),
  ]);

  if (!firmA || !firmB) {
    return NextResponse.json({ error: "Firms not found" }, { status: 404 });
  }

  // Get contact persons (first admin/owner of each firm's org)
  const getContact = async (orgId: string) => {
    const member = await db.query.members.findFirst({
      where: and(
        eq(members.organizationId, orgId),
        eq(members.role, "owner")
      ),
    });
    if (!member) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, member.userId),
      columns: { id: true, name: true, email: true },
    });
    return user;
  };

  const [contactA, contactB] = await Promise.all([
    getContact(firmA.organizationId),
    getContact(firmB.organizationId),
  ]);

  if (!contactA?.email || !contactB?.email) {
    return NextResponse.json(
      { error: "Could not find contact emails for both firms" },
      { status: 400 }
    );
  }

  // Generate the intro email
  const intro = await generateIntroEmail({
    partnershipId,
    firmA: {
      name: firmA.name,
      website: firmA.website ?? undefined,
      description: firmA.description ?? undefined,
      contactName: contactA.name ?? "Team",
      contactEmail: contactA.email,
    },
    firmB: {
      name: firmB.name,
      website: firmB.website ?? undefined,
      description: firmB.description ?? undefined,
      contactName: contactB.name ?? "Team",
      contactEmail: contactB.email,
    },
    matchScore: partnership.matchScore ?? undefined,
    matchExplanation: partnership.matchExplanation ?? undefined,
    senderUserId: session.user.id,
  });

  // If just generating a draft, return it for review
  if (!send) {
    return NextResponse.json({
      draft: {
        subject: intro.subject,
        htmlBody: intro.htmlBody,
        textBody: intro.textBody,
        talkingPoints: intro.talkingPoints,
        recipients: [contactA.email, contactB.email],
      },
    });
  }

  // Send the email
  const result = await sendIntroEmail({
    partnershipId,
    firmAEmail: contactA.email,
    firmBEmail: contactB.email,
    subject: intro.subject,
    htmlBody: intro.htmlBody,
    textBody: intro.textBody,
    senderUserId: session.user.id,
  });

  return NextResponse.json({
    sent: result.success,
    messageId: result.messageId,
    recipients: [contactA.email, contactB.email],
  });
}
