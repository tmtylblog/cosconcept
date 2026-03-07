/**
 * Voice Manager
 *
 * Orchestrates the full voice pipeline:
 * Browser Mic → Deepgram STT → Claude/Gemini → ElevenLabs TTS → Playback
 *
 * This is the SERVER-SIDE manager. The client-side audio capture
 * lives in the React component (voice-button.tsx).
 *
 * The voice manager handles:
 * 1. Receiving audio chunks from the client
 * 2. Streaming to Deepgram for transcription
 * 3. Accumulating transcript into utterances
 * 4. Sending utterances to the AI for response
 * 5. Streaming AI response through TTS
 * 6. Returning audio chunks to the client
 */

import { createDeepgramStream, type DeepgramStreamController, type TranscriptEvent } from "./deepgram-stt";
import { streamTTS, splitIntoSentences } from "./elevenlabs-tts";

export interface VoiceSessionConfig {
  onTranscript: (event: TranscriptEvent) => void;
  onAIResponse: (text: string) => void;
  onAudioChunk: (chunk: Uint8Array) => void;
  onError: (error: Error) => void;
  generateAIResponse: (text: string) => Promise<string>;
}

export interface VoiceSession {
  sendAudio: (chunk: ArrayBuffer) => void;
  interrupt: () => void;
  close: () => void;
  readonly isListening: boolean;
  readonly isSpeaking: boolean;
}

/**
 * Create a voice session that manages the full pipeline.
 */
export function createVoiceSession(config: VoiceSessionConfig): VoiceSession {
  let deepgramStream: DeepgramStreamController | null = null;
  let isListening = false;
  let isSpeaking = false;
  let currentUtterance = "";
  let utteranceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

  // Start Deepgram streaming
  try {
    deepgramStream = createDeepgramStream(
      {},
      (event) => {
        config.onTranscript(event);

        if (event.isFinal) {
          currentUtterance += (currentUtterance ? " " : "") + event.text;

          // Reset the silence timer
          if (utteranceTimer) clearTimeout(utteranceTimer);
          utteranceTimer = setTimeout(() => {
            if (currentUtterance.trim()) {
              processUtterance(currentUtterance.trim());
              currentUtterance = "";
            }
          }, 1200); // 1.2s of silence = end of utterance
        }
      },
      config.onError,
      () => {
        isListening = false;
      }
    );
    isListening = true;
  } catch (err) {
    config.onError(err instanceof Error ? err : new Error(String(err)));
  }

  async function processUtterance(text: string) {
    // If currently speaking, interrupt
    if (isSpeaking) {
      interrupt();
    }

    isSpeaking = true;
    abortController = new AbortController();

    try {
      // Get AI response
      const response = await config.generateAIResponse(text);
      config.onAIResponse(response);

      if (abortController.signal.aborted) return;

      // Split into sentences and stream TTS
      const sentences = splitIntoSentences(response);

      for (const sentence of sentences) {
        if (abortController.signal.aborted) break;
        if (sentence.length < 2) continue;

        const audioStream = await streamTTS(sentence);
        if (!audioStream || abortController.signal.aborted) continue;

        const reader = audioStream.getReader();
        while (true) {
          if (abortController.signal.aborted) {
            reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          config.onAudioChunk(value);
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        config.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isSpeaking = false;
      abortController = null;
    }
  }

  function interrupt() {
    if (abortController) {
      abortController.abort();
    }
    isSpeaking = false;
  }

  return {
    sendAudio(chunk: ArrayBuffer) {
      deepgramStream?.sendAudio(chunk);
    },

    interrupt,

    close() {
      if (utteranceTimer) clearTimeout(utteranceTimer);
      deepgramStream?.close();
      deepgramStream = null;
      isListening = false;
      interrupt();
    },

    get isListening() {
      return isListening;
    },

    get isSpeaking() {
      return isSpeaking;
    },
  };
}
