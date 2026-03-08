/**
 * POST /api/experts/[id]/invite
 *
 * Sends a "claim your profile" email to the expert.
 * Creates a signed token in the verifications table (7-day expiry).
 * The expert clicks the link → /api/experts/claim?token=... → links their account.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  verifications,
  serviceFirms,
  members,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/email-client";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Load expert
  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  if (!expert) return Response.json({ error: "Expert not found" }, { status: 404 });
  if (!expert.email) return Response.json({ error: "Expert has no email address" }, { status: 422 });

  // Verify caller is a member of the firm
  const [firm] = await db
    .select({ organizationId: serviceFirms.organizationId, name: serviceFirms.name })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, expert.firmId))
    .limit(1);

  if (!firm) return Response.json({ error: "Firm not found" }, { status: 404 });

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, firm.organizationId))
    .limit(1);

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });

  // If the expert already has a claimed account, no invite needed
  if (expert.userId) {
    return Response.json({ error: "Expert has already claimed their profile" }, { status: 409 });
  }

  // Generate a secure random token (store in verifications table)
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const identifier = `expert-claim:${id}`;

  // Upsert — replace any existing pending invite for this expert
  const existing = await db
    .select({ id: verifications.id })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(verifications)
      .set({ value: token, expiresAt, updatedAt: new Date() })
      .where(eq(verifications.identifier, identifier));
  } else {
    await db.insert(verifications).values({
      id: `vc_${Date.now().toString(36)}`,
      identifier,
      value: token,
      expiresAt,
    });
  }

  const expertName = expert.fullName ?? (`${expert.firstName ?? ""} ${expert.lastName ?? ""}`.trim() || "there");
  const claimUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://joincollectiveos.com"}/api/experts/claim?token=${token}&id=${id}`;

  const result = await sendEmail({
    to: expert.email,
    subject: `Your Collective OS profile — claim it to showcase your expertise`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: 'Inter', sans-serif; background: #f6f4ef; margin: 0; padding: 40px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: #3a302d; padding: 28px 32px;">
      <p style="color: #60b9bf; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px;">Collective OS</p>
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0; line-height: 1.3;">Your expert profile is waiting</h1>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <p style="color: #3a302d; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        Hi ${expertName},
      </p>
      <p style="color: #3a302d; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        <strong>${firm.name}</strong> has added you as an expert on Collective OS — a platform that connects specialist consultants with firms looking for exactly what you do.
      </p>
      <p style="color: #3a302d; font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
        Claim your profile to add your own <strong>specialist profiles</strong> — focused pages for each of your expertise niches. Strong profiles appear in search and surface you to the right clients automatically.
      </p>

      <!-- CTA -->
      <div style="text-align: center; margin: 0 0 28px;">
        <a href="${claimUrl}" style="display: inline-block; background: #1f86a1; color: white; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none;">
          Claim your profile →
        </a>
      </div>

      <p style="color: #9b8f8a; font-size: 13px; line-height: 1.5; margin: 0 0 8px;">
        This link expires in 7 days. If you didn't expect this email, you can safely ignore it.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #f0ece6; padding: 20px 32px;">
      <p style="color: #9b8f8a; font-size: 12px; margin: 0;">
        Collective OS · Grow Faster Together · <a href="https://joincollectiveos.com" style="color: #1f86a1;">joincollectiveos.com</a>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    text: `Hi ${expertName},\n\n${firm.name} has added you as an expert on Collective OS. Claim your profile here:\n\n${claimUrl}\n\nThis link expires in 7 days.\n\nCollective OS`,
    tags: [{ name: "type", value: "expert-invite" }],
  });

  if (!result.success) {
    return Response.json({ error: "Failed to send email" }, { status: 500 });
  }

  return Response.json({ ok: true, messageId: result.messageId });
}
