"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Voice Button Component
 *
 * Handles microphone capture, streaming to Deepgram for STT,
 * sending transcript to AI, and playing TTS response.
 *
 * States: idle → listening → processing → speaking → idle
 */
export function VoiceButton({
  onTranscript,
  onResponse,
  className,
  compact = false,
}: VoiceButtonProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      setState("listening");
      setTranscript("");
    } catch {
      setState("idle");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setState("processing");

    try {
      // Step 1: Transcribe via Deepgram REST API
      const transcriptText = await transcribeWithDeepgram(blob);

      if (!transcriptText.trim()) {
        setState("idle");
        return;
      }

      setTranscript(transcriptText);
      onTranscript?.(transcriptText);

      // Step 2: Get AI response + optional TTS
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
          // Play audio response
          const aiText = decodeURIComponent(
            res.headers.get("x-ai-response") ?? ""
          );
          if (aiText) {
            onResponse?.(aiText);
          }

          setState("speaking");
          const audioBlob = await res.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.onended = () => {
            setState("idle");
            URL.revokeObjectURL(audioUrl);
          };

          await audio.play();
        } else {
          // Text-only response
          const data = await res.json();
          if (data.text) {
            onResponse?.(data.text);
          }
          setState("idle");
        }
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  };

  const handleClick = () => {
    if (state === "idle") {
      startRecording();
    } else if (state === "listening") {
      stopRecording();
    } else if (state === "speaking") {
      // Interrupt playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setState("idle");
    }
  };

  const stateConfig: Record<VoiceState, { icon: React.ReactNode; label: string; color: string }> = {
    idle: {
      icon: <Mic className="h-4 w-4" />,
      label: "Talk to Ossy",
      color: "",
    },
    listening: {
      icon: <MicOff className="h-4 w-4" />,
      label: "Listening...",
      color: "bg-red-500 hover:bg-red-600 text-white",
    },
    processing: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      label: "Thinking...",
      color: "",
    },
    speaking: {
      icon: <Volume2 className="h-4 w-4" />,
      label: "Speaking...",
      color: "bg-cos-electric hover:bg-cos-electric/90 text-white",
    },
  };

  const current = stateConfig[state];

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={state === "processing"}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
          state === "listening"
            ? "bg-red-500 text-white animate-pulse"
            : state === "speaking"
              ? "bg-cos-electric text-white"
              : "bg-cos-cloud text-cos-slate hover:bg-cos-surface-raised"
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
        onClick={handleClick}
        disabled={state === "processing"}
        variant={state === "idle" ? "outline" : "default"}
        size="sm"
        className={current.color}
      >
        {current.icon}
        <span className="ml-1.5">{current.label}</span>
      </Button>

      {/* Live transcript display */}
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
  // Proxy through our API route to keep the Deepgram key server-side
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
