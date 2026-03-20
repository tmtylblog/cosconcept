/**
 * TTS-only endpoint — POST /api/voice/tts
 *
 * Accepts text and returns streamed audio via ElevenLabs.
 * Used by the chat panel to speak Ossy's responses during voice mode.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { streamTTS } from "@/lib/voice/elevenlabs-tts";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const audioStream = await streamTTS(text);
  if (!audioStream) {
    return NextResponse.json(
      { error: "TTS unavailable" },
      { status: 503 }
    );
  }

  return new Response(audioStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    },
  });
}
