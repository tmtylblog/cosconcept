/**
 * AI Response Classifier — Gemini Flash
 *
 * Classifies inbound lead messages into pipeline stages using strict
 * priority-ordered evaluation. Replaces the heuristic sentiment classifier
 * for pipeline stage assignment.
 *
 * Decision framework (evaluated in this order):
 *   Paying → Onboarded → Signed Up → Meeting Confirmed → Meeting Requested →
 *   Referred Elsewhere → Interested → Asked Question → Maybe Later →
 *   Bad Fit → No Budget → Bad Timing → Went with Competitor →
 *   Unsubscribed → Unresponsive → Replied
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { classifyResponseSentiment } from "./sentiment";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const PIPELINE_STAGES = [
  "contacted",
  "interested",
  "maybe_later",
  "asked_question",
  "referred_elsewhere",
  "meeting_requested",
  "meeting_confirmed",
  "signed_up",
  "onboarded",
  "paying",
  "bad_fit",
  "no_budget",
  "bad_timing",
  "went_with_competitor",
  "unresponsive",
  "unsubscribed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface ClassificationResult {
  stage: PipelineStage;
  confidence: number;
  reasoning: string;
}

/** Map heuristic sentiment to a stage as fallback */
function sentimentToStage(sentiment: string): PipelineStage {
  switch (sentiment) {
    case "positive": return "interested";
    case "negative": return "unresponsive";
    case "unsubscribe": return "unsubscribed";
    default: return "contacted";
  }
}

/**
 * Classify an inbound message into a pipeline stage using Gemini Flash.
 * Falls back to heuristic sentiment if AI fails.
 */
export async function classifyResponse(
  message: string,
  context?: {
    currentStage?: string;
    conversationHistory?: string[];
  }
): Promise<ClassificationResult> {
  if (!message || message.trim().length < 5) {
    return { stage: "contacted", confidence: 0.3, reasoning: "Empty or trivial message" };
  }

  const historyContext = context?.conversationHistory?.length
    ? `\n\nPrevious messages (for context only — classify based on the LATEST message):\n${context.conversationHistory.slice(-3).join("\n")}`
    : "";

  const currentStageContext = context?.currentStage
    ? `\nCurrent pipeline stage: ${context.currentStage}`
    : "";

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are a pipeline classification engine for a B2B lead management system.

Classify the following inbound message into exactly ONE pipeline stage.
${currentStageContext}${historyContext}

## MESSAGE TO CLASSIFY
${message.slice(0, 2000)}

## CLASSIFICATION RULES (evaluate in strict priority order)

1. If the lead mentions actively paying, using the product, or being a customer → **paying**
2. If the lead mentions onboarding, setting up, or getting started with the product → **onboarded**
3. If the lead mentions having signed up or created an account → **signed_up**
4. If a meeting is explicitly confirmed with a specific date/time (e.g. "see you Thursday at 2pm", "I've booked us for...", "meeting confirmed", "looking forward to our call on...") → **meeting_confirmed**
5. If the lead shows intent to schedule but no confirmed time (e.g. "let's set up a call", "when are you free?", "send me your calendar link") → **meeting_requested**
6. If the lead refers you to someone else (e.g. "you should talk to Sarah", "let me connect you with...") → **referred_elsewhere**
7. If the lead expresses clear interest (e.g. "sounds interesting", "tell me more", "I'd love to learn more") → **interested**
8. If the lead asks a question without expressing interest or disinterest → **asked_question**
9. If the lead indicates delay or future timing (e.g. "maybe next quarter", "reach out in January", "not now but later") → **maybe_later**
10. If the lead says they're not a fit or wrong target → **bad_fit**
11. If the lead mentions budget constraints → **no_budget**
12. If timing is wrong but not explicitly "later" → **bad_timing**
13. If the lead chose another provider → **went_with_competitor**
14. If the lead requests to stop communication → **unsubscribed**
15. If the lead replies without any clear intent (generic acknowledgment, "ok", "thanks") → **unresponsive**

## OUTPUT RULES
- Pick exactly ONE stage
- Do NOT add explanations or subjective reasoning
- confidence: 0-1 how certain you are
- reasoning: one brief internal note (e.g. "mentions scheduling a call next week")`,
      schema: z.object({
        stage: z.enum(PIPELINE_STAGES),
        confidence: z.number().describe("0-1 confidence"),
        reasoning: z.string().describe("One brief internal note"),
      }),
      maxOutputTokens: 128,
    });

    return result.object;
  } catch (err) {
    console.error("[ResponseClassifier] Gemini failed, falling back to heuristic:", err);
    // Fallback to existing heuristic
    const heuristic = classifyResponseSentiment(message);
    return {
      stage: sentimentToStage(heuristic.sentiment),
      confidence: heuristic.confidence * 0.7, // Discount heuristic confidence
      reasoning: `Heuristic fallback: ${heuristic.sentiment}`,
    };
  }
}
