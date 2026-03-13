/**
 * Response sentiment classifier — Tier 1: heuristic (zero cost)
 *
 * Classifies inbound messages as positive/negative/neutral/unsubscribe
 * based on keyword matching and simple heuristics.
 */

export type Sentiment = "positive" | "negative" | "neutral" | "unsubscribe";

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: number; // 0.0–1.0
}

const UNSUBSCRIBE_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\bstop emailing\b/i,
  /\bstop contacting\b/i,
  /\bnot interested\b/i,
  /\bopt out\b/i,
  /\bdo not contact\b/i,
  /\btake me off\b/i,
  /\bplease remove\b/i,
];

const POSITIVE_PATTERNS = [
  /\binterested\b/i,
  /\blet['']?s chat\b/i,
  /\btell me more\b/i,
  /\bsounds good\b/i,
  /\bsounds great\b/i,
  /\bset up a call\b/i,
  /\bschedule a call\b/i,
  /\bhop on a call\b/i,
  /\bi['']?d love to\b/i,
  /\bi['']?d like to\b/i,
  /\blearn more\b/i,
  /\bwhat are your rates\b/i,
  /\bhow much\b/i,
  /\bwhat do you charge\b/i,
  /\bsend me\b/i,
  /\bshare more\b/i,
  /\byes please\b/i,
  /\bsure\b/i,
  /\babsolutely\b/i,
  /\bwould love\b/i,
  /\blooks interesting\b/i,
  /\bgreat timing\b/i,
  /\bperfect timing\b/i,
  /\bfree this week\b/i,
  /\bfree next week\b/i,
  /\bavailable\b.*\b(call|chat|meet)\b/i,
  /\bcalendar link\b/i,
  /\bcalendly\b/i,
];

const NEGATIVE_PATTERNS = [
  /\bno thanks\b/i,
  /\bno thank you\b/i,
  /\bnot for us\b/i,
  /\bnot a fit\b/i,
  /\bbad timing\b/i,
  /\bnot right now\b/i,
  /\bnot at this time\b/i,
  /\bwe['']?re all set\b/i,
  /\bwe['']?re good\b/i,
  /\bpass on this\b/i,
  /\bnot looking\b/i,
  /\balready have\b/i,
  /\bbusy right now\b/i,
];

const AUTO_REPLY_PATTERNS = [
  /\bout of (?:the )?office\b/i,
  /\bauto[- ]?reply\b/i,
  /\bautomatic reply\b/i,
  /\bi(?:['']?m| am) (?:out|away|on (?:vacation|holiday|leave))\b/i,
  /\bthis is an automated\b/i,
  /\bdo not reply to this\b/i,
];

export function classifyResponseSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { sentiment: "neutral", confidence: 0.5 };
  }

  const cleaned = text.trim();

  // Check auto-replies first (treat as neutral)
  for (const p of AUTO_REPLY_PATTERNS) {
    if (p.test(cleaned)) return { sentiment: "neutral", confidence: 0.9 };
  }

  // Check unsubscribe
  for (const p of UNSUBSCRIBE_PATTERNS) {
    if (p.test(cleaned)) return { sentiment: "unsubscribe", confidence: 0.95 };
  }

  // Check negative
  let negativeHits = 0;
  for (const p of NEGATIVE_PATTERNS) {
    if (p.test(cleaned)) negativeHits++;
  }
  if (negativeHits > 0) {
    return { sentiment: "negative", confidence: Math.min(0.7 + negativeHits * 0.1, 0.95) };
  }

  // Check positive
  let positiveHits = 0;
  for (const p of POSITIVE_PATTERNS) {
    if (p.test(cleaned)) positiveHits++;
  }
  if (positiveHits > 0) {
    return { sentiment: "positive", confidence: Math.min(0.6 + positiveHits * 0.1, 0.95) };
  }

  // Heuristic: longer replies without negative keywords are mildly positive
  // (someone took the time to respond thoughtfully)
  if (cleaned.length > 100 && cleaned.includes("?")) {
    return { sentiment: "positive", confidence: 0.5 };
  }

  return { sentiment: "neutral", confidence: 0.4 };
}
