/**
 * Recall.ai Integration
 *
 * Sends a bot named "Ossy" into any browser-based meeting (Google Meet, Zoom web, Teams web).
 * The bot records + transcribes; Recall.ai webhooks the transcript back when done.
 *
 * Env vars required:
 *   RECALL_AI_API_KEY — from Recall.ai dashboard
 *   RECALL_WEBHOOK_SECRET — for authenticating incoming webhook POSTs
 */

const RECALL_REGION = process.env.RECALL_AI_REGION ?? "us-west-2";
const RECALL_API = `https://${RECALL_REGION}.recall.ai/api/v1`;

interface RecallBot {
  id: string;
  status: string;
  meeting_url: string;
  bot_name: string;
}

export interface CreateBotResult {
  botId: string;
  success: boolean;
  error?: string;
}

/**
 * Create a Recall.ai bot and send it into a meeting.
 */
export async function createBot(opts: {
  meetingUrl: string;
  botName?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
}): Promise<CreateBotResult> {
  const apiKey = process.env.RECALL_AI_API_KEY;
  if (!apiKey) return { botId: "", success: false, error: "RECALL_AI_API_KEY not configured" };

  const body: Record<string, unknown> = {
    meeting_url: opts.meetingUrl,
    bot_name: opts.botName ?? "Ossy (Collective OS)",
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: "prioritize_low_latency",
            language_code: "en",
          },
        },
      },
    },
  };

  if (opts.metadata) body.metadata = opts.metadata;

  try {
    const res = await fetch(`${RECALL_API}/bot/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Recall] Bot creation failed:", err);
      return { botId: "", success: false, error: err };
    }

    const data: RecallBot = await res.json();
    return { botId: data.id, success: true };
  } catch (err) {
    console.error("[Recall] Bot creation error:", err);
    return { botId: "", success: false, error: String(err) };
  }
}

/**
 * Fetch bot status from Recall.ai (for polling/debugging).
 */
export async function getBotStatus(botId: string): Promise<{ id: string; status: string }> {
  const apiKey = process.env.RECALL_AI_API_KEY;
  if (!apiKey) throw new Error("RECALL_AI_API_KEY not configured");

  const res = await fetch(`${RECALL_API}/bot/${botId}/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch bot status: ${await res.text()}`);
  return res.json();
}

/**
 * Get full transcript for a completed bot session.
 * Returns plain text with speaker labels: "Speaker: words..."
 */
export async function getBotTranscript(botId: string): Promise<string | null> {
  const apiKey = process.env.RECALL_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${RECALL_API}/bot/${botId}/transcript/`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const lines: string[] = (data ?? []).map(
      (seg: { speaker: string; words: { text: string }[] }) =>
        `${seg.speaker}: ${seg.words.map((w: { text: string }) => w.text).join(" ")}`
    );
    return lines.join("\n");
  } catch {
    return null;
  }
}
