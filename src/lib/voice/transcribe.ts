/**
 * Shared Deepgram transcription utility.
 *
 * Proxies audio through our server-side endpoint to keep
 * the Deepgram API key out of the browser.
 */

export async function transcribeWithDeepgram(audioBlob: Blob): Promise<string> {
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
