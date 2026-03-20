"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Volume2, X } from "lucide-react";
import type { UIMessage } from "ai";
import { createVAD } from "@/lib/voice/audio-capture";
import { transcribeWithDeepgram } from "@/lib/voice/transcribe";
import { cn } from "@/lib/utils";

type VoiceModeState =
  | "initializing"
  | "listening"
  | "processing"
  | "waiting"
  | "speaking"
  | "error";

interface VoiceModeProps {
  onExit: () => void;
  sendMessage: (params: { text: string }) => void;
  messages: UIMessage[];
  status: string;
}

/**
 * Full Voice Mode — hands-free continuous conversation with Ossy.
 *
 * Replaces the chat messages + input area with a pulsing orb.
 * Loop: listen → VAD detects silence → transcribe → send to Ossy → TTS → repeat.
 */
export function VoiceMode({ onExit, sendMessage, messages, status }: VoiceModeProps) {
  const [state, setState] = useState<VoiceModeState>("initializing");
  const [lastTranscript, setLastTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Refs for mic/recording/playback lifecycle
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<{ stop: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef(state);
  const lastHandledMsgIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─── Escape key handler ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  // ─── Start recording (called by VAD onSpeechStart) ─────
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    if (stateRef.current !== "listening") return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(250);
    recorderRef.current = recorder;
  }, []);

  // ─── Stop recording + process (called by VAD onSpeechEnd) ─
  const stopAndProcess = useCallback(async () => {
    if (stateRef.current !== "listening") return;
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;

    setState("processing");

    // Get the audio blob from the recorder
    const recorder = recorderRef.current;
    recorderRef.current = null;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType;
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    if (!mountedRef.current) return;

    try {
      const transcript = await transcribeWithDeepgram(blob);

      if (!mountedRef.current) return;

      if (!transcript.trim()) {
        // Empty transcript (background noise) — go back to listening
        setState("listening");
        return;
      }

      setLastTranscript(transcript);
      setState("waiting");
      sendMessage({ text: transcript });
    } catch {
      if (!mountedRef.current) return;
      setState("listening");
    }
  }, [sendMessage]);

  // ─── Initialize mic + VAD on mount ──────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Start VAD — it runs continuously on the stream
        const vad = createVAD(stream, {
          onSpeechStart: () => {
            if (stateRef.current === "listening") {
              // Start collecting audio
              startRecording();
            }
          },
          onSpeechEnd: () => {
            if (stateRef.current === "listening") {
              stopAndProcess();
            }
          },
          silenceThresholdDb: -45,
          silenceDurationMs: 1200, // Slightly longer than default for natural pauses
        });

        vadRef.current = vad;
        setState("listening");
      } catch {
        if (!cancelled) {
          setErrorMsg("Microphone access denied");
          setState("error");
          setTimeout(() => onExit(), 2000);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Watch for Ossy's response in "waiting" state ───────
  useEffect(() => {
    if (state !== "waiting") return;
    if (status !== "ready") return;

    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      lastMsg.id !== lastHandledMsgIdRef.current
    ) {
      const text = lastMsg.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .trim();

      if (text) {
        lastHandledMsgIdRef.current = lastMsg.id;
        playTTS(text);
      }
    }
  }, [state, status, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Play TTS and resume listening ──────────────────────
  const playTTS = useCallback(async (text: string) => {
    setState("speaking");

    // Truncate long responses for TTS
    const ttsText = text.length > 500 ? text.slice(0, 500) + "..." : text;

    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText }),
      });

      if (!mountedRef.current) return;

      if (!res.ok) {
        // TTS failed — skip audio, go back to listening
        setState("listening");
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        if (mountedRef.current) {
          setState("listening");
        }
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        if (mountedRef.current) {
          setState("listening");
        }
      };

      await audio.play();
    } catch {
      if (mountedRef.current) {
        setState("listening");
      }
    }
  }, []);

  // ─── Cleanup all resources ──────────────────────────────
  function cleanup() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    vadRef.current?.stop();
    vadRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }

  // ─── Orb config per state ───────────────────────────────
  const orbConfig: Record<
    VoiceModeState,
    { icon: React.ReactNode; label: string; coreClass: string; ringClass: string; glowClass: string }
  > = {
    initializing: {
      icon: <Loader2 className="h-8 w-8 animate-spin" />,
      label: "Starting mic...",
      coreClass: "bg-cos-slate/20 text-cos-slate",
      ringClass: "",
      glowClass: "bg-cos-slate/10",
    },
    listening: {
      icon: <Mic className="h-8 w-8" />,
      label: "Listening...",
      coreClass: "bg-red-500 text-white shadow-lg shadow-red-500/30",
      ringClass: "animate-ping bg-red-400/25",
      glowClass: "animate-pulse bg-red-400/15",
    },
    processing: {
      icon: <Loader2 className="h-8 w-8 animate-spin" />,
      label: "Transcribing...",
      coreClass: "bg-cos-slate/20 text-cos-slate",
      ringClass: "",
      glowClass: "bg-cos-slate/10",
    },
    waiting: {
      icon: <Loader2 className="h-8 w-8 animate-spin" />,
      label: "Ossy is thinking...",
      coreClass: "bg-cos-electric/40 text-white shadow-lg shadow-cos-electric/20",
      ringClass: "animate-pulse bg-cos-electric/15",
      glowClass: "animate-pulse bg-cos-electric/10",
    },
    speaking: {
      icon: <Volume2 className="h-8 w-8" />,
      label: "Ossy is speaking...",
      coreClass: "bg-cos-electric text-white shadow-lg shadow-cos-electric/30",
      ringClass: "animate-ping bg-cos-electric/20",
      glowClass: "animate-pulse bg-cos-electric/15",
    },
    error: {
      icon: <X className="h-8 w-8" />,
      label: errorMsg || "Something went wrong",
      coreClass: "bg-cos-ember/20 text-cos-ember",
      ringClass: "",
      glowClass: "bg-cos-ember/10",
    },
  };

  const orb = orbConfig[state];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      {/* Pulsing orb */}
      <button
        type="button"
        onClick={() => {
          if (state === "speaking" && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setState("listening");
          }
        }}
        className="group relative flex items-center justify-center"
      >
        {/* Outer pulse ring */}
        <span
          className={cn(
            "absolute h-32 w-32 rounded-full transition-all duration-500",
            orb.ringClass
          )}
        />
        {/* Middle glow ring */}
        <span
          className={cn(
            "absolute h-28 w-28 rounded-full transition-all duration-500",
            orb.glowClass
          )}
        />
        {/* Core orb */}
        <span
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300",
            orb.coreClass
          )}
        >
          {orb.icon}
        </span>
      </button>

      {/* State label */}
      <p className="text-sm text-white/70">{orb.label}</p>

      {/* Last transcript */}
      {lastTranscript && (
        <p className="max-w-[250px] text-center text-xs text-white/30 italic">
          &ldquo;{lastTranscript}&rdquo;
        </p>
      )}

      {/* Exit hint */}
      <button
        type="button"
        onClick={onExit}
        className="mt-4 rounded-cos-pill border border-white/10 px-4 py-1.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
      >
        Exit Voice Mode
      </button>
    </div>
  );
}
