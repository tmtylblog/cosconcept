/**
 * Thread Detector — inline heuristic for classifying messages as
 * continuation vs new topic. Runs in < 1ms with zero AI calls.
 *
 * Used by the chat API route to do quick thread assignment before
 * the background AI classifier (Inngest) refines the result.
 */

export interface ThreadSignal {
  /** true = likely continuing the same thread */
  isContinuation: boolean;
  /** 0.0-1.0 confidence in the classification */
  confidence: number;
  /** Rough topic category if a new topic is detected */
  topicHint?: string;
}

/** Known topic buckets with keyword triggers */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  partner_search: ["partner", "match", "search", "find", "discover", "agency", "consultant", "fractional"],
  firm_profile: ["profile", "services", "update", "our firm", "my firm", "offering"],
  case_studies: ["case study", "case studies", "project", "portfolio", "work", "example"],
  client_research: ["research", "client", "prospect", "pitch", "prepare", "meeting"],
  onboarding: ["onboarding", "getting started", "set up", "preferences"],
  platform_help: ["how do i", "settings", "billing", "subscription", "account", "help", "bug"],
};

/** Words that signal the user is continuing a prior thread */
const CONTINUATION_SIGNALS = [
  "it", "that", "they", "them", "those", "this",
  "what about", "also", "and", "plus", "another",
  "more", "other", "else", "too", "additionally",
  "same", "similar", "like that", "like those",
  "narrow", "filter", "refine", "instead",
  "tell me more", "go deeper", "expand on",
  "yes", "yeah", "sure", "ok", "right",
  "no", "not", "nah",
];

/** Words that signal a topic pivot */
const PIVOT_SIGNALS = [
  "actually", "by the way", "switching", "different",
  "new topic", "unrelated", "change of subject",
  "forget that", "never mind", "instead",
  "can you", "how do i", "what is",
];

/**
 * Detect whether a user message continues the current thread or pivots to a new topic.
 *
 * @param userMessage - The user's latest message
 * @param recentMessages - Last 4-6 messages for context (role + content)
 * @param currentThreadTopic - The active thread's topic category (if any)
 * @param lastMessageAge - Seconds since the last message (for time-gap detection)
 */
export function detectThreadSignal(
  userMessage: string,
  recentMessages: Array<{ role: string; content: string }>,
  currentThreadTopic?: string,
  lastMessageAge?: number,
): ThreadSignal {
  const msg = userMessage.toLowerCase().trim();
  const words = msg.split(/\s+/);

  // ── Time gap check ─────────────────────────────────────
  // If > 30 minutes since last message, lean toward new thread
  if (lastMessageAge && lastMessageAge > 30 * 60) {
    const detectedTopic = detectTopic(msg);
    if (detectedTopic && detectedTopic !== currentThreadTopic) {
      return { isContinuation: false, confidence: 0.7, topicHint: detectedTopic };
    }
    // Time gap but same topic keywords — probably continuing
    return { isContinuation: true, confidence: 0.5, topicHint: detectedTopic ?? undefined };
  }

  // ── Short messages (< 5 words) — almost always continuations ──
  if (words.length <= 4) {
    // Check for pivot signals even in short messages
    if (PIVOT_SIGNALS.some(s => msg.includes(s))) {
      return { isContinuation: false, confidence: 0.6, topicHint: detectTopic(msg) ?? undefined };
    }
    return { isContinuation: true, confidence: 0.85 };
  }

  // ── Continuation signals ───────────────────────────────
  const hasContinuationSignal = CONTINUATION_SIGNALS.some(s => {
    // Match at word boundary for short signals
    if (s.length <= 4) return words[0] === s || words.slice(0, 2).join(" ") === s;
    return msg.includes(s);
  });

  if (hasContinuationSignal) {
    return { isContinuation: true, confidence: 0.85 };
  }

  // ── Pivot signals ──────────────────────────────────────
  const hasPivotSignal = PIVOT_SIGNALS.some(s => msg.includes(s));
  if (hasPivotSignal) {
    const detectedTopic = detectTopic(msg);
    if (detectedTopic && detectedTopic !== currentThreadTopic) {
      return { isContinuation: false, confidence: 0.75, topicHint: detectedTopic };
    }
  }

  // ── Topic mismatch detection ───────────────────────────
  const detectedTopic = detectTopic(msg);
  if (detectedTopic && currentThreadTopic && detectedTopic !== currentThreadTopic) {
    return { isContinuation: false, confidence: 0.65, topicHint: detectedTopic };
  }

  // ── Recent context overlap ─────────────────────────────
  // Check if key nouns from the last assistant message appear in the user's message
  if (recentMessages.length > 0) {
    const lastAssistant = recentMessages.filter(m => m.role === "assistant").pop();
    if (lastAssistant) {
      const assistantWords = new Set(
        lastAssistant.content.toLowerCase().split(/\s+/).filter(w => w.length > 4)
      );
      const overlap = words.filter(w => w.length > 4 && assistantWords.has(w));
      if (overlap.length >= 2) {
        return { isContinuation: true, confidence: 0.8 };
      }
    }
  }

  // ── Default: assume continuation with moderate confidence ──
  return { isContinuation: true, confidence: 0.5, topicHint: detectedTopic ?? undefined };
}

/** Match a message against known topic buckets. Returns the best match or null. */
function detectTopic(msg: string): string | null {
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const score = keywords.filter(kw => msg.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestScore > 0 ? bestTopic : null;
}
