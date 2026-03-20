"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  onStateChange?: (state: VoiceState) => void;
  className?: string;
  compact?: boolean;
  /** When true, only does STT — skips the /api/voice AI call. Used when chat handles AI. */
  chatMode?: boolean;
}

/**
 * Voice Button Component
 *
 * Handles microphone capture, streaming to Deepgram for STT,
 * and optionally sending transcript to AI + playing TTS response.
 *
 * States: idle → listening → processing → (speaking) → idle
 */
export function VoiceButton({
  onTranscript,
  onResponse,
  onStateChange,
  className,
  compact = false,
  chatMode = false,
}: VoiceButtonProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateState = useCallback(
    (newState: VoiceState) => {
      setState(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await processAudio(blob);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      updateState("listening");
      setTranscript("");
    } catch {
      updateState("idle");
    }
  }, [updateState]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const processAudio = async (blob: Blob) => {
    updateState("processing");

    try {
      // Step 1: Transcribe via Deepgram REST API
      const transcriptText = await transcribeWithDeepgram(blob);

      if (!transcriptText.trim()) {
        updateState("idle");
        return;
      }

      setTranscript(transcriptText);
      onTranscript?.(transcriptText);

      // In chat mode, STT is all we do — chat handles AI response + TTS
      if (chatMode) {
        updateState("idle");
        return;
      }

      // Step 2: Get AI response + optional TTS (standalone voice mode)
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          returnAudio: true,
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type");

        if (contentType?.includes("audio")) {
          const aiText = decodeURIComponent(
            res.headers.get("x-ai-response") ?? ""
          );
          if (aiText) {
            onResponse?.(aiText);
          }

          updateState("speaking");
          const audioBlob = await res.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.onended = () => {
            updateState("idle");
            URL.revokeObjectURL(audioUrl);
          };

          await audio.play();
        } else {
          const data = await res.json();
          if (data.text) {
            onResponse?.(data.text);
          }
          updateState("idle");
        }
      } else {
        updateState("idle");
      }
    } catch {
      updateState("idle");
    }
  };

  const handleClick = useCallback(() => {
    if (state === "idle") {
      startRecording();
    } else if (state === "listening") {
      stopRecording();
    } else if (state === "speaking") {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      updateState("idle");
    }
  }, [state, startRecording, stopRecording, updateState]);

  /** Play TTS audio for a given text. Called externally via parent when in chatMode. */
  const playTTS = useCallback(
    async (text: string) => {
      try {
        updateState("speaking");
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          updateState("idle");
          return;
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          updateState("idle");
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
      } catch {
        updateState("idle");
      }
    },
    [updateState]
  );

  // Expose playTTS and handleClick to parent via window
  useEffect(() => {
    (window as Record<string, unknown>).__ossyPlayTTS = playTTS;
    (window as Record<string, unknown>).__ossyVoiceClick = handleClick;
    return () => {
      delete (window as Record<string, unknown>).__ossyPlayTTS;
      delete (window as Record<string, unknown>).__ossyVoiceClick;
    };
  }, [playTTS, handleClick]);

  const stateConfig: Record<VoiceState, { icon: React.ReactNode; label: string }> = {
    idle: {
      icon: <Mic className="h-4 w-4" />,
      label: "Talk to Ossy",
    },
    listening: {
      icon: <MicOff className="h-4 w-4" />,
      label: "Listening...",
    },
    processing: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      label: "Thinking...",
    },
    speaking: {
      icon: <Volume2 className="h-4 w-4" />,
      label: "Speaking...",
    },
  };

  const current = stateConfig[state];

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "processing"}
        className={`flex items-center justify-center rounded-full transition-all ${
          state === "listening"
            ? "bg-red-500 text-white animate-pulse"
            : state === "speaking"
              ? "bg-cos-electric text-white"
              : state === "processing"
                ? "text-cos-slate"
                : "text-cos-slate hover:text-cos-electric"
        } ${className ?? ""}`}
        title={current.label}
      >
        {current.icon}
      </button>
    );
  }

  return (
    <div className={className}>
      <Button
        type="button"
        onClick={handleClick}
        disabled={state === "processing"}
        variant={state === "idle" ? "outline" : "default"}
        size="sm"
        className={
          state === "listening"
            ? "bg-red-500 hover:bg-red-600 text-white"
            : state === "speaking"
              ? "bg-cos-electric hover:bg-cos-electric/90 text-white"
              : ""
        }
      >
        {current.icon}
        <span className="ml-1.5">{current.label}</span>
      </Button>

      {transcript && state !== "idle" && (
        <p className="mt-2 text-xs text-cos-slate italic">
          &ldquo;{transcript}&rdquo;
        </p>
      )}
    </div>
  );
}

// ─── Deepgram Transcription via Server Proxy ─────────────

async function transcribeWithDeepgram(audioBlob: Blob): Promise<string> {
  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": audioBlob.type,
    },
    body: audioBlob,
  });

  if (!res.ok) {
    console.error("[Voice] Transcription error:", res.status);
    return "";
  }

  const data = await res.json();
  return data.transcript ?? "";
}
