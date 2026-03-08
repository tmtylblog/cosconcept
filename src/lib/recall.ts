/**
 * Recall.ai Integration
 *
 * Sends a bot named "Ossy" into any browser-based meeting (Google Meet, Zoom web, Teams web).
 * The bot records + transcribes; Recall.ai webhooks the transcript back when done.
 *
 * Env vars required:
 *   RECALL_API_KEY — from Recall.ai dashboard
 *   RECALL_WEBHOOK_SECRET — for authenticating incoming webhook POSTs
 */

const RECALL_API = "https://api.recall.ai/api/v1";

interface RecallBot {
  id: string;
  status: string;
  meeting_url: string;
  bot_name: string;
}

/**
 * Create a Recall.ai bot and send it into a meeting.
 * Returns the bot object with id (used to correlate the transcript webhook).
 */
export async function createBot(
  meetingUrl: string,
  callName: string
): Promise<RecallBot> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error("RECALL_API_KEY not configured");

  const res = await fetch(`${RECALL_API}/bot/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: "Ossy",
      transcription_options: { provider: "deepgram" },
      real_time_transcription: { partial_results: false },
      metadata: { call_name: callName },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Recall.ai bot creation failed: ${err}`);
  }

  return res.json();
}

/**
 * Fetch bot status from Recall.ai (for polling/debugging).
 */
export async function getBotStatus(botId: string): Promise<{ id: string; status: string }> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error("RECALL_API_KEY not configured");

  const res = await fetch(`${RECALL_API}/bot/${botId}/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch bot status: ${await res.text()}`);
  return res.json();
}
