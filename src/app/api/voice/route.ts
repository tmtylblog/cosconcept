/**
 * Voice API Endpoint
 *
 * POST /api/voice — Process a voice message (audio or text transcript)
 *
 * For the initial implementation, this handles the request/response pattern:
 * 1. Client sends audio transcript (already transcribed via Deepgram client SDK)
 * 2. Server generates AI response
 * 3. Server streams TTS audio back
 *
 * WebSocket upgrade for real-time streaming will be added in a future iteration.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { streamTTS, splitIntoSentences } from "@/lib/voice/elevenlabs-tts";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logUsage } from "@/lib/ai/gateway";
import { OSSY_SYSTEM_PROMPT } from "@/lib/ai/ossy-prompt";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * POST — Process voice input and return AI response + TTS audio.
 *
 * Body: { transcript: string, conversationId?: string, firmId?: string }
 * Response: { text: string, audioUrl?: string } or streaming audio
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { transcript, returnAudio = false } = body;

  if (!transcript?.trim()) {
    return NextResponse.json(
      { error: "transcript is required" },
      { status: 400 }
    );
  }

  // Generate AI response
  const voiceStart = Date.now();
  const result = await generateText({
    model: openrouter.chat("anthropic/claude-sonnet-4"),
    system: `${OSSY_SYSTEM_PROMPT}

## Voice Mode Override
You are responding via VOICE — your answer will be spoken aloud via text-to-speech. Keep answers extra concise (1-2 sentences max). Use short, natural sentences. Avoid markdown, bullet points, numbered lists, or any formatting. Do not bold questions. Be warm, knowledgeable, and direct.`,
    prompt: transcript,
    maxOutputTokens: 300,
  });
  const voiceDuration = Date.now() - voiceStart;

  const aiResponse = result.text;

  // Log AI usage
  await logUsage({
    userId: session.user.id,
    model: "anthropic/claude-sonnet-4",
    feature: "voice",
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    durationMs: voiceDuration,
  });

  // If audio is requested, generate TTS
  if (returnAudio) {
    const sentences = splitIntoSentences(aiResponse);
    const allSentences = sentences.join(" ");

    const audioStream = await streamTTS(allSentences);

    if (audioStream) {
      return new Response(audioStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-AI-Response": encodeURIComponent(aiResponse),
        },
      });
    }
  }

  return NextResponse.json({ text: aiResponse });
}
