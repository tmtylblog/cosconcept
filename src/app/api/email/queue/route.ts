/**
 * Email Approval Queue API
 *
 * GET  /api/email/queue — List pending emails for approval
 * POST /api/email/queue — Approve/reject an email
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { emailApprovalQueue } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-client";

/**
 * GET — List pending emails in approval queue for user's firm.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const firmId = url.searchParams.get("firmId");
  const status = url.searchParams.get("status") ?? "pending";

  if (!firmId) {
    return NextResponse.json({ error: "firmId is required" }, { status: 400 });
  }

  const queue = await db
    .select()
    .from(emailApprovalQueue)
    .where(
      and(
        eq(emailApprovalQueue.firmId, firmId),
        eq(emailApprovalQueue.status, status)
      )
    )
    .orderBy(desc(emailApprovalQueue.createdAt));

  return NextResponse.json({ emails: queue });
}

/**
 * POST — Approve or reject a queued email.
 * Body: { emailId, action: "approve" | "reject" }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { emailId, action } = body as { emailId: string; action: "approve" | "reject" };

  if (!emailId || !action) {
    return NextResponse.json(
      { error: "emailId and action are required" },
      { status: 400 }
    );
  }

  // Get the queued email
  const queued = await db.query.emailApprovalQueue.findFirst({
    where: eq(emailApprovalQueue.id, emailId),
  });

  if (!queued) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  if (queued.status !== "pending") {
    return NextResponse.json(
      { error: `Email already ${queued.status}` },
      { status: 400 }
    );
  }

  if (action === "reject") {
    await db
      .update(emailApprovalQueue)
      .set({
        status: "rejected",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      })
      .where(eq(emailApprovalQueue.id, emailId));

    return NextResponse.json({ status: "rejected" });
  }

  // Send the email
  const result = await sendEmail({
    to: queued.toEmails as string[],
    cc: (queued.ccEmails as string[]) ?? undefined,
    subject: queued.subject,
    html: queued.bodyHtml,
    text: queued.bodyText ?? undefined,
    tags: [
      { name: "type", value: queued.emailType },
      { name: "queue_id", value: emailId },
    ],
  });

  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to send email", detail: result.error },
      { status: 500 }
    );
  }

  await db
    .update(emailApprovalQueue)
    .set({
      status: "sent",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      sentAt: new Date(),
      externalMessageId: result.messageId,
    })
    .where(eq(emailApprovalQueue.id, emailId));

  return NextResponse.json({
    status: "sent",
    messageId: result.messageId,
  });
}
