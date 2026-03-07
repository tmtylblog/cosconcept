/**
 * AI Cost Gateway — tracks all LLM usage and cost.
 * Phase 0 stub: logging only, no actual API calls yet.
 * Full implementation comes in Phase 1 (Ossy Chat Core).
 */

export type AIModel =
  | "claude-sonnet"
  | "gemini-flash"
  | "gemini-pro"
  | "text-embedding-3-small";

export type AIFeature =
  | "enrichment"
  | "matching"
  | "chat"
  | "voice"
  | "classification";

export interface AIUsageEntry {
  model: AIModel;
  feature: AIFeature;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  entityType?: string;
  entityId?: string;
  durationMs: number;
}

// Cost per 1K tokens (approximate, as of 2025)
const MODEL_COSTS: Record<AIModel, { input: number; output: number }> = {
  "claude-sonnet": { input: 0.003, output: 0.015 },
  "gemini-flash": { input: 0.000075, output: 0.0003 },
  "gemini-pro": { input: 0.00125, output: 0.005 },
  "text-embedding-3-small": { input: 0.00002, output: 0 },
};

/**
 * Calculate estimated cost for a model call.
 */
export function estimateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_COSTS[model];
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

/**
 * Log AI usage. In Phase 0, this is a no-op console log.
 * Phase 1+ will persist to ai_usage_log table.
 */
export async function logAIUsage(entry: AIUsageEntry): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[AI] ${entry.model} | ${entry.feature} | ${entry.inputTokens}in/${entry.outputTokens}out | $${entry.costUsd.toFixed(6)} | ${entry.durationMs}ms`
    );
  }
  // TODO Phase 1: persist to ai_usage_log table via Drizzle
}
