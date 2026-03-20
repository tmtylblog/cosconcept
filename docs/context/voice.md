# 8. Voice System

> Last updated: 2026-03-20

## Vision

Voice is how Ossy becomes a true AI consultant — not just a chatbot. Users should be able to talk to Ossy naturally, get spoken responses, and eventually have Ossy join their calls to listen, coach, and extract opportunities in real-time. Voice makes the platform feel human and dramatically lowers the friction of interacting with AI.

## Release Scope

- [x] Deepgram Nova-3 STT integration (REST batch mode)
- [x] ElevenLabs TTS streaming (Rachel voice, Turbo v2.5)
- [x] Request/response voice pipeline end-to-end
- [ ] Wire VoiceButton component into chat panel UI
- [ ] Add voice activity detection (VAD) for auto-stop recording
- [ ] Add Deepgram Aura TTS as fallback/alternative
- [ ] Add waveform visualization during recording/playback
- [ ] Test and optimize end-to-end latency (<1s target)
- [ ] Add ELEVENLABS_API_KEY to env schema validation

## Future Ideas

- WebSocket streaming pipeline for real-time conversation (server code exists, needs UI)
- Custom Ossy voice clone via ElevenLabs
- Chrome extension for call recording and live coaching
- Recall.ai meeting bot integration for Zoom/Meet/Teams
- Voice-to-voice mode (skip text, direct audio pipeline)
- Conversation context per utterance for multi-turn voice chats

---

## Overview

Ossy voice system: browser mic capture, Deepgram Nova-3 STT, Claude Sonnet LLM, ElevenLabs TTS, browser audio playback. Two modes exist: a **request/response** pattern (currently wired up end-to-end) and a **streaming WebSocket** pipeline (server-side code exists, not yet connected to the UI).

---

## Architecture

```
User speaks
  → Browser MediaRecorder (webm/opus, 250ms chunks, mono 16kHz)
  → POST /api/voice/transcribe (server proxy to Deepgram REST)
  → Deepgram Nova-3 pre-recorded API → transcript text
  → POST /api/voice (transcript + returnAudio flag)
  → Claude Sonnet via OpenRouter (generateText, maxOutputTokens: 300)
  → ElevenLabs Turbo v2.5 streaming TTS
  → Audio response (audio/mpeg) returned to browser
  → HTML5 Audio playback
```

### Latency Targets
- STT: <300ms (Deepgram Nova-3 streaming) / currently using REST batch, so higher
- LLM: depends on response length, capped at 300 tokens
- TTS: <500ms to first audio chunk (ElevenLabs streaming)
- End-to-end target: <1s perceived response time

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/voice/deepgram-stt.ts` | Deepgram STT — streaming WebSocket client + REST batch transcription |
| `src/lib/voice/elevenlabs-tts.ts` | ElevenLabs TTS — streaming + buffer generation + sentence splitting |
| `src/lib/voice/voice-manager.ts` | Server-side orchestrator — full STT-to-TTS pipeline via WebSocket |
| `src/lib/voice/audio-capture.ts` | Client-side mic capture (MediaRecorder) + VAD (volume-based) |
| `src/components/voice-button.tsx` | React UI component — mic toggle, state machine, audio playback |
| `src/app/api/voice/route.ts` | POST endpoint — receives transcript, generates AI response + TTS |
| `src/app/api/voice/transcribe/route.ts` | POST endpoint — proxies audio blob to Deepgram REST API |

---

## Deepgram Nova-3 STT

### Streaming Mode (`createDeepgramStream`)
- WebSocket connection to `wss://api.deepgram.com/v1/listen`
- Auth via WebSocket subprotocol: `["token", apiKey]`
- Config: `model=nova-3`, `language=en`, `punctuate=true`, `interim_results=true`, `utterance_end_ms=1000`, `vad_turnoff=500`, `smart_format=true`, `encoding=linear16`, `sample_rate=16000`
- Returns `DeepgramStreamController` with `sendAudio()`, `close()`, `connected`
- Emits `TranscriptEvent` with `text`, `isFinal`, `confidence`, `language`, `words[]`
- Sends `{ type: "CloseStream" }` JSON before closing to flush remaining audio
- **Status:** Code exists but is only used by `voice-manager.ts` (not wired to UI)

### Batch Mode (`transcribeAudio`)
- REST POST to `https://api.deepgram.com/v1/listen`
- Auth via `Authorization: Token <key>` header
- Returns array of `TranscriptEvent[]` from utterances
- Content-Type: `audio/wav`

### Transcription Proxy (`/api/voice/transcribe`)
- Server-side route that keeps `DEEPGRAM_API_KEY` off the client
- Receives raw audio blob (content-type passthrough, typically `audio/webm`)
- Forwards to Deepgram REST with `model=nova-3&smart_format=true&punctuate=true`
- Returns `{ transcript: string }`
- **This is the path currently used by the VoiceButton component**

---

## ElevenLabs TTS

### Configuration
- Default voice: `21m00Tcm4TlvDq8ikWAM` (Rachel — warm, professional)
- Model: `eleven_turbo_v2_5`
- Voice settings: `stability=0.5`, `similarity_boost=0.75`, `style=0.3`
- Output format: `mp3_44100_128`
- Auth: `xi-api-key` header

### Functions
| Function | Purpose |
|----------|---------|
| `streamTTS(text, config)` | Streams audio via ElevenLabs `/v1/text-to-speech/{voiceId}/stream`. Returns `ReadableStream<Uint8Array>` or `null` if no API key. |
| `generateTTSBuffer(text, config)` | Collects full stream into a `Buffer`. For short responses or pre-generation. |
| `splitIntoSentences(text)` | Splits on sentence-ending punctuation (`[.!?]` followed by whitespace). Used for progressive TTS. |
| `streamMultiSentenceTTS(sentences, config)` | Async generator yielding `{ sentence, audioStream }` per sentence for pipeline effect. |

### Graceful Degradation
- If `ELEVENLABS_API_KEY` is not set, `streamTTS` logs the text and returns `null` — the system falls back to text-only JSON response.

---

## Voice Manager (Server-Side Orchestrator)

`createVoiceSession(config)` manages the full real-time pipeline:

1. Opens Deepgram streaming WebSocket
2. Receives audio chunks from client via `sendAudio()`
3. Accumulates final transcript segments into utterances
4. After 1.2s of silence, treats accumulated text as a complete utterance
5. Calls `config.generateAIResponse(text)` (pluggable — intended for Claude Sonnet)
6. Splits AI response into sentences via `splitIntoSentences()`
7. Streams each sentence through `streamTTS()` and delivers audio chunks via `config.onAudioChunk()`

### Interruption Handling
- `interrupt()` aborts the current TTS pipeline via `AbortController`
- If user starts speaking while Ossy is responding, `processUtterance` calls `interrupt()` first
- Client-side: clicking during "speaking" state pauses `HTMLAudioElement`

### Session Interface
```typescript
interface VoiceSession {
  sendAudio: (chunk: ArrayBuffer) => void;
  interrupt: () => void;
  close: () => void;
  readonly isListening: boolean;
  readonly isSpeaking: boolean;
}
```

**Status:** Fully implemented but not connected to any API route or WebSocket endpoint. The current UI uses the simpler request/response pattern instead.

---

## Audio Capture (Client-Side)

### `createAudioCapture(config)`
- Uses `navigator.mediaDevices.getUserMedia` with mono, 16kHz, echo cancellation, noise suppression, auto gain control
- Records via `MediaRecorder` in `audio/webm;codecs=opus` (fallback: `audio/webm`)
- Fires `onAudioChunk` every 250ms (configurable via `chunkIntervalMs`)
- **Status:** Exists but not imported anywhere — the VoiceButton has its own inline MediaRecorder logic

### `createVAD(stream, config)`
- Volume-based Voice Activity Detection using Web Audio API (`AnalyserNode`)
- FFT size 512, monitors average frequency volume
- Speech start: volume exceeds -45dB threshold
- Speech end: volume below threshold for 800ms (configurable)
- Uses `requestAnimationFrame` loop
- **Status:** Exists but not used anywhere

---

## UI Component: VoiceButton

### State Machine
```
idle → listening → processing → speaking → idle
```

| State | Icon | Label | Behavior |
|-------|------|-------|----------|
| `idle` | Mic | "Talk to Ossy" | Click starts recording |
| `listening` | MicOff | "Listening..." | Red pulsing, click stops recording |
| `processing` | Loader2 (spin) | "Thinking..." | Disabled, waiting for AI + TTS |
| `speaking` | Volume2 | "Speaking..." | cos-electric bg, click interrupts |

### Flow
1. Click mic -> `getUserMedia` (mono, echo cancel, noise suppress, auto gain)
2. `MediaRecorder` records in 250ms chunks, accumulates `Blob[]`
3. On stop -> concatenates blobs -> `transcribeWithDeepgram()` (POST to `/api/voice/transcribe`)
4. Transcript text -> POST `/api/voice` with `{ transcript, returnAudio: true }`
5. If response content-type is `audio/*`: play via `new Audio(blobUrl)`, AI text in `X-AI-Response` header (URL-encoded)
6. If response is JSON: extract `data.text`, no audio playback
7. `audio.onended` resets to idle

### Variants
- **Default:** Button with label text + live transcript display below
- **Compact:** `compact={true}` renders a 10x10 rounded-full icon button

### Props
```typescript
interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  className?: string;
  compact?: boolean;
}
```

### Integration Status
- Component exported but **not imported anywhere** in the app currently
- No page or layout renders `<VoiceButton />`

---

## Voice API Route (`POST /api/voice`)

- Requires authenticated session (Better Auth)
- Receives `{ transcript: string, returnAudio?: boolean }`
- LLM: `anthropic/claude-sonnet-4` via OpenRouter, `maxOutputTokens: 300`
- System prompt: Ossy as AI consultant for Collective OS — concise, conversational, no markdown
- Logs usage via `logUsage()` with `feature: "voice"`
- If `returnAudio=true`: joins all sentences, streams TTS, returns `audio/mpeg` with `X-AI-Response` header
- If no TTS available: returns `{ text: string }` JSON

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEEPGRAM_API_KEY` | Optional (in env schema) | STT transcription |
| `ELEVENLABS_API_KEY` | Not in env schema | TTS synthesis — checked at runtime in `streamTTS()` |
| `OPENROUTER_API_KEY` | Required | LLM response generation |

Note: `ELEVENLABS_API_KEY` is not listed in `.env.example` or `src/lib/env.ts`. It is only checked at runtime in `elevenlabs-tts.ts`. `DEEPGRAM_API_KEY` is optional in the Zod env schema.

---

## Call Intelligence (Related)

Separate from voice chat but uses the same Deepgram infrastructure:

- `callRecordings` table: stores meeting audio files (blob URL, duration, participants)
- `callTranscripts` table: stores diarized transcripts with `deepgramJobId` field
- `coachingReports` table: AI-generated call coaching analysis
- Chrome extension planned (Manifest V3) to capture tab audio from browser meetings
- Post-call pipeline: transcription -> opportunity extraction -> coaching report

### Transcript Upload (2026-03-20)
- **Admin transcript upload live** — paste text, .txt file, or .docx file (via mammoth library)
- **Client domain field required** for manual uploads — triggers `research/company` Inngest job for company context
- Frontend chat also supports transcript upload via Ossy tools

### Recall.ai Integration (2026-03-20)
- Recall.ai webhook now **auto-classifies participant domains** — distinguishes service provider firms from external companies
- **Auto-fires `research/company` jobs** for unknown external participant domains (builds company context for extraction)
- Recall.ai health check endpoint available

### Extraction Prompt Configuration (2026-03-20)
- Extraction prompt **configurable via `/admin/calls/settings`** — stored in `platform_settings` table (key: `opportunity_extraction_prompt`)
- **Enhanced default prompt:** better pitch vs pain point distinction, latent signal detection, `platformMatchHint` field for matching opportunities to specialists
- Client context from `company_research` prepended to transcript before extraction

---

## Current Status and Gaps

### Working
- Deepgram REST transcription proxy (`/api/voice/transcribe`)
- ElevenLabs streaming TTS (`streamTTS`, `generateTTSBuffer`)
- Voice API route with Claude Sonnet LLM + TTS response (`/api/voice`)
- VoiceButton component with full state machine and audio playback
- Sentence splitting for progressive TTS
- Voice manager with interruption handling

### Not Connected
- **VoiceButton is not rendered anywhere** — no page imports or mounts it
- **`audio-capture.ts` is unused** — VoiceButton has its own inline capture logic (duplication)
- **`voice-manager.ts` is unused** — no WebSocket route exists to use the streaming pipeline
- **VAD (`createVAD`) is unused** — exists but never called

### Missing for Production
1. **WebSocket endpoint** — needed to use `voice-manager.ts` streaming pipeline (currently using slower REST request/response)
2. **Streaming STT in UI** — currently records full audio blob then batch-transcribes (adds latency vs. real-time streaming)
3. **`ELEVENLABS_API_KEY` not in env schema** — should be added to `src/lib/env.ts` and `.env.example`
4. **No conversation context** — `/api/voice` processes each utterance independently, no multi-turn memory
5. **No Ossy voice selection** — hardcoded to ElevenLabs "Rachel" voice; needs custom Ossy voice
6. **No waveform/visual indicator** — ARCHITECTURE.md calls for waveform while Ossy speaks
7. **Chrome extension** — call recording not implemented beyond schema
8. **Recall.ai advanced features** — meeting bot working, participant classification live; needs multi-platform robustness testing
9. **Deepgram Aura TTS** — mentioned in docs as alternative/fallback to ElevenLabs, not implemented
10. **`audio-capture.ts` consolidation** — should be used by VoiceButton instead of duplicated inline logic
