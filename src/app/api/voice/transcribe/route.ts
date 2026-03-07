/**
 * Voice Transcription Proxy — POST /api/voice/transcribe
 *
 * Proxies audio to Deepgram's pre-recorded endpoint to keep
 * the API key server-side (never exposed to the browser).
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Deepgram API key not configured" },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "audio/webm";
    const body = await req.arrayBuffer();

    if (body.byteLength === 0) {
      return NextResponse.json({ transcript: "" });
    }

    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType,
        },
        body,
      }
    );

    if (!dgRes.ok) {
      const errText = await dgRes.text();
      console.error("[Voice/Transcribe] Deepgram error:", dgRes.status, errText);
      return NextResponse.json(
        { error: "Transcription failed", detail: errText },
        { status: dgRes.status }
      );
    }

    const data = await dgRes.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[Voice/Transcribe] Error:", err);
    return NextResponse.json(
      { error: "Internal transcription error" },
      { status: 500 }
    );
  }
}
