/**
 * ElevenLabs TTS (Text-to-Speech)
 *
 * Streaming TTS for Ossy's voice responses.
 * Uses sentence-level chunking for low-latency playback.
 *
 * Target: Start playing audio within 500ms of text generation start.
 */

export interface TTSConfig {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  outputFormat?: string;
}

const DEFAULT_TTS_CONFIG: TTSConfig = {
  voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah — expressive, warm, natural
  modelId: "eleven_multilingual_v2",
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  outputFormat: "mp3_44100_128",
};

/**
 * Stream TTS audio for a given text.
 *
 * Returns a ReadableStream of audio chunks that can be piped
 * to the client for real-time playback.
 */
export async function streamTTS(
  text: string,
  config: TTSConfig = {}
): Promise<ReadableStream<Uint8Array> | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log("[TTS] No ELEVENLABS_API_KEY set. Would speak:", text.slice(0, 100));
    return null;
  }

  const mergedConfig = { ...DEFAULT_TTS_CONFIG, ...config };

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${mergedConfig.voiceId}/stream?output_format=${mergedConfig.outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: mergedConfig.modelId,
        voice_settings: {
          stability: mergedConfig.stability,
          similarity_boost: mergedConfig.similarityBoost,
          style: mergedConfig.style,
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[TTS] ElevenLabs error:", res.status, errBody);
    // Throw so callers can see the actual error
    throw new Error(`ElevenLabs ${res.status}: ${errBody}`);
  }

  return res.body;
}

/**
 * Generate TTS audio as a complete buffer.
 * Useful for short responses or pre-generating audio.
 */
export async function generateTTSBuffer(
  text: string,
  config: TTSConfig = {}
): Promise<Buffer | null> {
  const stream = await streamTTS(text, config);
  if (!stream) return null;

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * Split text into sentences for progressive TTS.
 *
 * Processes each sentence through TTS as soon as it's available,
 * enabling near-zero perceived latency when combined with streaming LLM output.
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by a space or end of string
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences;
}

/**
 * Stream TTS for multiple sentences, yielding audio chunks progressively.
 *
 * Sends each sentence to TTS as soon as the previous one starts streaming,
 * creating a natural pipeline effect.
 */
export async function* streamMultiSentenceTTS(
  sentences: string[],
  config: TTSConfig = {}
): AsyncGenerator<{ sentence: string; audioStream: ReadableStream<Uint8Array> | null }> {
  for (const sentence of sentences) {
    if (sentence.length < 2) continue;

    const audioStream = await streamTTS(sentence, config);
    yield { sentence, audioStream };
  }
}
