/**
 * Browser Audio Capture (Client-Side)
 *
 * Uses the MediaRecorder API to capture microphone audio
 * and stream it as chunks via a callback.
 *
 * Audio is captured in 250ms chunks at 16kHz mono (optimal for Deepgram).
 */

export interface AudioCaptureConfig {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError: (error: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
  chunkIntervalMs?: number;
}

export interface AudioCapture {
  start: () => Promise<void>;
  stop: () => void;
  readonly isCapturing: boolean;
}

/**
 * Create an audio capture instance.
 *
 * Requests microphone access and streams audio chunks.
 */
export function createAudioCapture(config: AudioCaptureConfig): AudioCapture {
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let isCapturing = false;

  return {
    async start() {
      if (isCapturing) return;

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        // Use webm/opus which is widely supported and Deepgram handles well
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        mediaRecorder = new MediaRecorder(mediaStream, {
          mimeType,
          audioBitsPerSecond: 16000,
        });

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const buffer = await event.data.arrayBuffer();
            config.onAudioChunk(buffer);
          }
        };

        mediaRecorder.onerror = () => {
          config.onError(new Error("MediaRecorder error"));
        };

        mediaRecorder.start(config.chunkIntervalMs ?? 250);
        isCapturing = true;
        config.onStart?.();
      } catch (err) {
        config.onError(
          err instanceof Error ? err : new Error("Microphone access denied")
        );
      }
    },

    stop() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorder = null;
      mediaStream = null;
      isCapturing = false;
      config.onStop?.();
    },

    get isCapturing() {
      return isCapturing;
    },
  };
}

/**
 * Simple Voice Activity Detection (VAD) using volume levels.
 *
 * Monitors the audio input and detects speech start/end
 * based on volume thresholds.
 */
export function createVAD(
  stream: MediaStream,
  config: {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    silenceThresholdDb?: number;
    silenceDurationMs?: number;
  }
): { stop: () => void } {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  analyser.fftSize = 512;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const silenceThreshold = config.silenceThresholdDb ?? -45;
  const silenceDuration = config.silenceDurationMs ?? 800;

  let isSpeaking = false;
  let silenceStart: number | null = null;
  let rafId: number;

  function checkVolume() {
    analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;

    // Convert to dB-like scale (0-255 → rough dB estimate)
    const volumeDb = average > 0 ? 20 * Math.log10(average / 255) : -100;

    if (volumeDb > silenceThreshold) {
      // Speech detected
      if (!isSpeaking) {
        isSpeaking = true;
        config.onSpeechStart?.();
      }
      silenceStart = null;
    } else {
      // Silence
      if (isSpeaking) {
        if (!silenceStart) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > silenceDuration) {
          isSpeaking = false;
          silenceStart = null;
          config.onSpeechEnd?.();
        }
      }
    }

    rafId = requestAnimationFrame(checkVolume);
  }

  checkVolume();

  return {
    stop() {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close();
    },
  };
}
