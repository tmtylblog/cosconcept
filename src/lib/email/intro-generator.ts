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
    prompt: `Generate a warm, professional introduction email connecting two firms that should partner.

## FIRM A
Name: ${firmA.name}
Contact: ${firmA.contactName} (${firmA.contactEmail})
Website: ${firmA.website ?? "N/A"}
Services: ${firmA.topServices?.join(", ") ?? "N/A"}
Skills: ${firmA.topSkills?.join(", ") ?? "N/A"}
Industries: ${firmA.industries?.join(", ") ?? "N/A"}
About: ${firmA.description?.slice(0, 300) ?? "N/A"}

## FIRM B
Name: ${firmB.name}
Contact: ${firmB.contactName} (${firmB.contactEmail})
Website: ${firmB.website ?? "N/A"}
Services: ${firmB.topServices?.join(", ") ?? "N/A"}
Skills: ${firmB.topSkills?.join(", ") ?? "N/A"}
Industries: ${firmB.industries?.join(", ") ?? "N/A"}
About: ${firmB.description?.slice(0, 300) ?? "N/A"}

## MATCH CONTEXT
${matchExplanation ?? "These firms have complementary capabilities and serve overlapping client bases."}

## INSTRUCTIONS
Write the email from Ossy (the AI consultant at Collective OS). The email should:
1. Be addressed to both contacts by first name
2. Briefly explain who each firm is and what they do (2-3 sentences each)
3. Explain WHY they should connect — specific complementary capabilities
4. Suggest a concrete next step (15-min intro call)
5. Be warm and professional, not salesy
6. Keep it under 250 words

Also provide 3 talking points for their intro call.`,
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
}): string {
  const bodyHtml = data.body
    .split("\n\n")
    .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #1a1a2e;">${p}</p>`)
    .join("");

  const talkingPointsHtml = data.talkingPoints
    .map((tp) => `<li style="margin-bottom: 8px; color: #4a4a6a;">${tp}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <!-- Header -->
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="font-size: 20px; color: #6366f1; margin: 0;">Collective OS</h1>
      <p style="font-size: 13px; color: #94a3b8; margin: 4px 0 0;">Partnership Introduction</p>
    </div>

    <!-- Content -->
    <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
      ${bodyHtml}

      <!-- Talking Points -->
      <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 12px 0; font-weight: 600; font-size: 14px; color: #1a1a2e;">Suggested talking points:</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
          ${talkingPointsHtml}
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0; font-size: 12px; color: #94a3b8;">
      <p>Sent by Ossy from <a href="https://joincollectiveos.com" style="color: #6366f1; text-decoration: none;">Collective OS</a></p>
      <p>Grow Faster Together</p>
    </div>
  </div>
</body>
</html>`;
}
