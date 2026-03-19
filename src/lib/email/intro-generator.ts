/**
 * Three-Way Partnership Intro Email Generator
 *
 * Generates personalized introduction emails between two firms
 * that have been matched by the matching engine. Uses AI to craft
 * the intro based on both firms' profiles and the match context.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { sendEmail } from "./email-client";
import { db } from "@/lib/db";
import { partnershipEvents } from "@/lib/db/schema";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface FirmContext {
  name: string;
  website?: string;
  description?: string;
  topServices?: string[];
  topSkills?: string[];
  industries?: string[];
  contactName: string;
  contactEmail: string;
}

const BOOKING_URL = "https://cal.com/masa-sasaki-3mjc0b/partnership-intro";

interface IntroEmailInput {
  partnershipId: string;
  firmA: FirmContext;
  firmB: FirmContext;
  matchScore?: number;
  matchExplanation?: string;
  senderUserId: string;
}

interface GeneratedIntro {
  subject: string;
  htmlBody: string;
  textBody: string;
  talkingPoints: string[];
}

/**
 * Generate a three-way intro email using AI.
 *
 * Returns the generated email content for review before sending.
 */
export async function generateIntroEmail(
  input: IntroEmailInput
): Promise<GeneratedIntro> {
  const { firmA, firmB, matchExplanation } = input;

  const result = await generateObject({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    prompt: `You are Ossy, the AI business consultant at Collective OS — a platform that helps professional services firms grow through partnerships.

You have identified a high-potential partnership match between two firms and you are writing a personalized three-way introduction email to both of them.

## FIRM A
Name: ${firmA.name}
Contact: ${firmA.contactName} <${firmA.contactEmail}>
Website: ${firmA.website ?? "N/A"}
Services: ${firmA.topServices?.join(", ") ?? "N/A"}
Skills: ${firmA.topSkills?.join(", ") ?? "N/A"}
Industries served: ${firmA.industries?.join(", ") ?? "N/A"}
About: ${firmA.description?.slice(0, 400) ?? "N/A"}

## FIRM B
Name: ${firmB.name}
Contact: ${firmB.contactName} <${firmB.contactEmail}>
Website: ${firmB.website ?? "N/A"}
Services: ${firmB.topServices?.join(", ") ?? "N/A"}
Skills: ${firmB.topSkills?.join(", ") ?? "N/A"}
Industries served: ${firmB.industries?.join(", ") ?? "N/A"}
About: ${firmB.description?.slice(0, 400) ?? "N/A"}

## WHY THEY MATCH
${matchExplanation ?? "These firms have highly complementary capabilities and overlapping client bases — a natural fit for referrals and co-delivery."}

## INSTRUCTIONS
Write a warm, personalized three-way introduction email. Requirements:
- Open by addressing BOTH contacts by their FIRST NAME (e.g. "Hi Sarah and James,")
- In 2-3 sentences, describe what ${firmA.name} does and what makes them great — make it specific, not generic
- In 2-3 sentences, describe what ${firmB.name} does and what makes them great — make it specific, not generic
- Clearly explain the SPECIFIC reason these two firms should work together — reference actual services/skills, not vague platitudes
- Mention 1-2 concrete ways they could collaborate (referrals, co-delivery on a project type, etc.)
- End with a clear CTA: invite them to book a 15-min intro call using the scheduling link (you don't need to include the link — it will be added as a button)
- Tone: warm, human, confident — like a trusted advisor making a personal intro, NOT a sales pitch
- Length: 180-220 words maximum
- Sign off as: Ossy, Collective OS

Also provide 3 sharp, specific talking points for their intro call — things they should actually discuss, not generic "get to know each other" fluff.`,
    schema: z.object({
      subject: z.string().describe("Email subject line, engaging but professional"),
      body: z
        .string()
        .describe("Email body text (plain text version, well-formatted)"),
      talkingPoints: z
        .array(z.string())
        .describe("3 suggested talking points for the intro call"),
    }),
    maxOutputTokens: 1024,
  });

  // Build HTML version
  const htmlBody = buildIntroHtml({
    body: result.object.body,
    firmA,
    firmB,
    talkingPoints: result.object.talkingPoints,
    bookingUrl: BOOKING_URL,
  });

  return {
    subject: result.object.subject,
    htmlBody,
    textBody: result.object.body,
    talkingPoints: result.object.talkingPoints,
  };
}

/**
 * Send the intro email after user approval.
 */
export async function sendIntroEmail(input: {
  partnershipId: string;
  firmAEmail: string;
  firmBEmail: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  senderUserId: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const result = await sendEmail({
    to: [input.firmAEmail, input.firmBEmail],
    subject: input.subject,
    html: input.htmlBody,
    text: input.textBody,
    tags: [
      { name: "type", value: "partnership_intro" },
      { name: "partnership_id", value: input.partnershipId },
    ],
  });

  // Log the event
  if (result.success) {
    const eventId = `pev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(partnershipEvents).values({
      id: eventId,
      partnershipId: input.partnershipId,
      eventType: "intro_sent",
      actorId: input.senderUserId,
      metadata: {
        messageId: result.messageId,
        recipients: [input.firmAEmail, input.firmBEmail],
      },
    });
  }

  return result;
}

// ─── HTML Template ──────────────────────────────────────

function buildIntroHtml(data: {
  body: string;
  firmA: FirmContext;
  firmB: FirmContext;
  talkingPoints: string[];
  bookingUrl: string;
}): string {
  const bodyHtml = data.body
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 18px 0; line-height: 1.7; color: #374151; font-size: 15px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  const talkingPointsHtml = data.talkingPoints
    .map((tp) => `<li style="margin-bottom: 10px; color: #4b5563; font-size: 14px; line-height: 1.6;">${tp}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Partnership Introduction</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">

    <!-- Header -->
    <div style="text-align: center; padding: 0 0 28px 0;">
      <div style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 10px 20px;">
        <span style="color: #ffffff; font-size: 15px; font-weight: 700; letter-spacing: 0.5px;">Collective OS</span>
      </div>
      <p style="font-size: 13px; color: #9ca3af; margin: 10px 0 0; letter-spacing: 0.3px;">PARTNERSHIP INTRODUCTION</p>
    </div>

    <!-- Email body -->
    <div style="background: #ffffff; border-radius: 14px; padding: 36px 32px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
      ${bodyHtml}

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0 8px;">
        <a href="${data.bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 8px; letter-spacing: 0.2px;">
          Schedule a 15-Min Intro Call →
        </a>
        <p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">No prep needed — just a quick hello</p>
      </div>
    </div>

    <!-- Talking Points -->
    <div style="background: #ffffff; border-radius: 14px; padding: 24px 32px; border: 1px solid #e5e7eb; margin-top: 16px;">
      <p style="margin: 0 0 14px 0; font-weight: 700; font-size: 13px; color: #6366f1; text-transform: uppercase; letter-spacing: 0.8px;">Suggested talking points for your call</p>
      <ul style="margin: 0; padding-left: 18px;">
        ${talkingPointsHtml}
      </ul>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0 8px; font-size: 12px; color: #9ca3af; line-height: 1.8;">
      <p style="margin: 0;">Sent by <strong>Ossy</strong> · <a href="https://joincollectiveos.com" style="color: #6366f1; text-decoration: none;">Collective OS</a></p>
      <p style="margin: 4px 0 0;">Grow Faster Together</p>
    </div>

  </div>
</body>
</html>`;
}
