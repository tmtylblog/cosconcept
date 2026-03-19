/**
 * POST /api/webhooks/cal
 *
 * Receives Cal.com booking webhooks and injects a Recall.ai bot
 * into the Google Meet link created by the booking.
 *
 * Cal.com webhook setup:
 *   Dashboard → Developer → Webhooks → Add:
 *   URL: https://cos-concept.vercel.app/api/webhooks/cal
 *   Triggers: BOOKING_CREATED
 *   Secret: set CAL_WEBHOOK_SECRET in Vercel env vars (optional but recommended)
 */

import { NextRequest, NextResponse } from "next/server";
import { createBot } from "@/lib/recall";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Optional: verify Cal.com webhook secret
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-cal-signature-256");
    if (!signature || signature !== secret) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const triggerEvent = payload.triggerEvent as string;

  // Only handle new bookings
  if (triggerEvent !== "BOOKING_CREATED") {
    return NextResponse.json({ ok: true, skipped: triggerEvent });
  }

  const booking = payload.payload as Record<string, unknown>;
  const meetingUrl = extractMeetingUrl(booking);

  if (!meetingUrl) {
    console.warn("[Cal webhook] No Google Meet URL found in booking", booking.uid);
    return NextResponse.json({ ok: true, skipped: "no_meeting_url" });
  }

  // Extract metadata from the booking
  const eventTitle = (booking.title as string) ?? "Partnership Intro Call";
  const bookingUid = booking.uid as string;

  console.log(`[Cal webhook] Injecting Recall.ai bot into: ${meetingUrl}`);

  // Inject Recall.ai bot
  const webhookBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://cos-concept.vercel.app";
  const { botId, success, error } = await createBot({
    meetingUrl,
    botName: "Ossy (Collective OS)",
    webhookUrl: `${webhookBase}/api/webhooks/recall`,
    metadata: {
      booking_uid: bookingUid,
      event_title: eventTitle,
    },
  });

  if (!success) {
    console.error("[Cal webhook] Recall.ai bot creation failed:", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  // Bot metadata is passed through to the Recall.ai webhook when call ends
  // The Recall webhook (/api/webhooks/recall) will create the call recording + fire transcript pipeline
  console.log(`[Cal webhook] Bot ${botId} injected into ${meetingUrl}`);
  return NextResponse.json({ ok: true, botId });
}

/**
 * Extract the Google Meet (or Zoom) URL from a Cal.com booking payload.
 * Cal.com embeds the link in different places depending on the integration.
 */
function extractMeetingUrl(booking: Record<string, unknown>): string | null {
  // Direct meeting URL field
  if (typeof booking.meetingUrl === "string" && booking.meetingUrl.startsWith("http")) {
    return booking.meetingUrl;
  }

  // videoCallData (Cal.com's native Google Meet integration)
  const videoCallData = booking.videoCallData as Record<string, unknown> | undefined;
  if (videoCallData?.url && typeof videoCallData.url === "string") {
    return videoCallData.url;
  }

  // conferenceData (older Cal.com format)
  const conferenceData = booking.conferenceData as Record<string, unknown> | undefined;
  const entryPoints = conferenceData?.entryPoints as { uri: string; entryPointType: string }[] | undefined;
  const videoEntry = entryPoints?.find((e) => e.entryPointType === "video");
  if (videoEntry?.uri) return videoEntry.uri;

  // location field (sometimes a meet.google.com URL)
  if (typeof booking.location === "string" && booking.location.includes("meet.google.com")) {
    return booking.location;
  }

  return null;
}
