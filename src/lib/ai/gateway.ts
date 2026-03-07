/**
 * AI Gateway — wraps all AI model calls with cost tracking.
 *
 * Every AI call in the platform should go through this gateway so we can:
 * 1. Track costs per org, user, feature, and model
 * 2. Log to the aiUsageLog table for analytics
 *
 * Pricing (per 1M tokens, approximate 2025):
 * - Gemini 2.0 Flash: $0.10 input / $0.40 output
 * - Claude Sonnet 4: $3.00 input / $15.00 output
 * - OpenAI text-embedding-3-small: $0.02 input
 */

import { db } from "@/lib/db";
import { aiUsageLog } from "@/lib/db/schema";

// ─── Types ────────────────────────────────────────────────

export type AIModel =
  | "claude-sonnet"
  | "gemini-flash"
  | "gemini-pro"
  | "text-embedding-3-small"
  | string; // Allow any model string for OpenRouter models

export type AIFeature =
  | "enrichment"
  | "matching"
  | "chat"
  | "voice"
  | "classification"
  | "memory"
  | "case_study"
  | "expert"
  | "abstraction";

export interface AIUsageEntry {
  organizationId?: string;
  userId?: string;
  model: AIModel;
  feature: AIFeature;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  entityType?: string;
  entityId?: string;
  durationMs: number;
}

// ─── Model pricing (USD per 1K tokens) ───────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Shorthand names
  "claude-sonnet": { input: 0.003, output: 0.015 },
  "gemini-flash": { input: 0.0001, output: 0.0004 },
  "gemini-pro": { input: 0.00125, output: 0.005 },
  "text-embedding-3-small": { input: 0.00002, output: 0 },
  // OpenRouter model IDs
  "google/gemini-2.0-flash-001": { input: 0.0001, output: 0.0004 },
  "google/gemini-pro-1.5": { input: 0.00125, output: 0.005 },
  "anthropic/claude-sonnet-4": { input: 0.003, output: 0.015 },
  "anthropic/claude-haiku-4-5": { input: 0.0008, output: 0.004 },
  "openai/gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

// ─── Cost calculation ─────────────────────────────────────

/**
 * Calculate estimated cost for a model call.
 */
export function estimateCost(
  model: AIModel,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_COSTS[model];
  if (!rates) return 0;
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

// ─── Usage logging ────────────────────────────────────────

/**
 * Log AI usage to the database.
 */
export async function logAIUsage(entry: AIUsageEntry): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[AI] ${entry.model} | ${entry.feature} | ${entry.inputTokens}in/${entry.outputTokens}out | $${entry.costUsd.toFixed(6)} | ${entry.durationMs}ms`
    );
  }

  const id = `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await db.insert(aiUsageLog).values({
      id,
      organizationId: entry.organizationId ?? null,
      userId: entry.userId ?? null,
      model: entry.model,
      feature: entry.feature,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: entry.costUsd,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      durationMs: entry.durationMs,
    });
  } catch (err) {
    // Don't let logging failures break the AI pipeline
    console.error("[AI Gateway] Failed to log usage:", err);
  }
}

/**
 * Convenience: log usage with auto cost calculation.
 */
export async function logUsage(params: {
  organizationId?: string;
  userId?: string;
  model: AIModel;
  feature: AIFeature;
  inputTokens: number;
  outputTokens: number;
  entityType?: string;
  entityId?: string;
  durationMs: number;
}): Promise<void> {
  const costUsd = estimateCost(params.model, params.inputTokens, params.outputTokens);
  await logAIUsage({ ...params, costUsd });
}

/**
 * Wrap an AI call to automatically track timing and log usage.
 */
export async function withUsageTracking<T>(
  params: {
    organizationId?: string;
    userId?: string;
    model: AIModel;
    feature: AIFeature;
    entityType?: string;
    entityId?: string;
  },
  fn: () => Promise<T>,
  getTokens?: (result: T) => { inputTokens: number; outputTokens: number }
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;

  const tokens = getTokens?.(result) ?? { inputTokens: 0, outputTokens: 0 };
  const costUsd = estimateCost(params.model, tokens.inputTokens, tokens.outputTokens);

  await logAIUsage({
    ...params,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    costUsd,
    durationMs,
  });

  return result;
}
