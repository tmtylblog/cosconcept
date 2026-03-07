/**
 * Deepgram STT (Speech-to-Text)
 *
 * Streaming transcription using Deepgram Nova-3.
 * Supports real-time interim results, language detection,
 * and endpointing for natural conversation flow.
 *
 * Target: <300ms latency from audio to text
 */

export interface TranscriptEvent {
  type: "transcript";
  text: string;
  isFinal: boolean;
  confidence: number;
  language?: string;
  words?: { word: string; start: number; end: number; confidence: number }[];
}

export interface DeepgramConfig {
  model?: string;
  language?: string;
  punctuate?: boolean;
  interimResults?: boolean;
  utteranceEndMs?: number;
  vadTurnoff?: number;
  smartFormat?: boolean;
  encoding?: string;
  sampleRate?: number;
}

const DEFAULT_CONFIG: DeepgramConfig = {
  model: "nova-3",
  language: "en",
  punctuate: true,
  interimResults: true,
  utteranceEndMs: 1000,
  vadTurnoff: 500,
  smartFormat: true,
  encoding: "linear16",
  sampleRate: 16000,
};

/**
 * Create a streaming Deepgram WebSocket connection for STT.
 *
 * Returns a controller object to send audio chunks and receive transcripts.
 */
export function createDeepgramStream(
  config: DeepgramConfig = {},
  onTranscript: (event: TranscriptEvent) => void,
  onError?: (error: Error) => void,
  onClose?: () => void
): DeepgramStreamController {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is required");
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Build WebSocket URL with query params
  const params = new URLSearchParams();
  if (mergedConfig.model) params.set("model", mergedConfig.model);
  if (mergedConfig.language) params.set("language", mergedConfig.language);
  if (mergedConfig.punctuate) params.set("punctuate", "true");
  if (mergedConfig.interimResults) params.set("interim_results", "true");
  if (mergedConfig.utteranceEndMs) params.set("utterance_end_ms", String(mergedConfig.utteranceEndMs));
  if (mergedConfig.vadTurnoff) params.set("vad_turnoff", String(mergedConfig.vadTurnoff));
  if (mergedConfig.smartFormat) params.set("smart_format", "true");
  if (mergedConfig.encoding) params.set("encoding", mergedConfig.encoding);
  if (mergedConfig.sampleRate) params.set("sample_rate", String(mergedConfig.sampleRate));

  const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

  let ws: WebSocket | null = null;
  let isOpen = false;

  const connect = () => {
    ws = new WebSocket(wsUrl, ["token", apiKey]);

    ws.onopen = () => {
      isOpen = true;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        if (data.type === "Results" && data.channel?.alternatives?.length > 0) {
          const alt = data.channel.alternatives[0];
          const transcript = alt.transcript;

          if (transcript) {
            onTranscript({
              type: "transcript",
              text: transcript,
              isFinal: data.is_final ?? false,
              confidence: alt.confidence ?? 0,
              language: data.metadata?.detected_language,
              words: alt.words,
            });
          }
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    };

    ws.onerror = (event) => {
      onError?.(new Error(`Deepgram WebSocket error: ${String(event)}`));
    };

    ws.onclose = () => {
      isOpen = false;
      onClose?.();
    };
  };

  connect();

  return {
    sendAudio(chunk: ArrayBuffer | Buffer) {
      if (ws && isOpen) {
        ws.send(chunk);
      }
    },

    close() {
      if (ws) {
        // Send close message to flush remaining audio
        if (isOpen) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        }
        ws.close();
        ws = null;
        isOpen = false;
      }
    },

    get connected() {
      return isOpen;
    },
  };
}

export interface DeepgramStreamController {
  sendAudio(chunk: ArrayBuffer | Buffer): void;
  close(): void;
  readonly connected: boolean;
}

/**
 * One-shot transcription via Deepgram REST API.
 * For processing recorded audio (e.g., call recordings).
 */
export async function transcribeAudio(
  audioBuffer: Uint8Array,
  config: DeepgramConfig = {}
): Promise<TranscriptEvent[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is required");
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config, interimResults: false };

  const params = new URLSearchParams();
  if (mergedConfig.model) params.set("model", mergedConfig.model);
  if (mergedConfig.language) params.set("language", mergedConfig.language);
  if (mergedConfig.punctuate) params.set("punctuate", "true");
  if (mergedConfig.smartFormat) params.set("smart_format", "true");
  params.set("utterances", "true");

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: audioBuffer.buffer as ArrayBuffer,
    }
  );

  if (!res.ok) {
    throw new Error(`Deepgram API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const transcripts: TranscriptEvent[] = [];

  for (const utterance of data.results?.utterances ?? []) {
    transcripts.push({
      type: "transcript",
      text: utterance.transcript,
      isFinal: true,
      confidence: utterance.confidence,
      words: utterance.words,
    });
  }

  return transcripts;
}
