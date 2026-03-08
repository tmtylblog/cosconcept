/**
 * Memory Extractor — extracts persistent memories from conversations.
 *
 * After each conversation (or periodically during long chats),
 * this module extracts key themes, preferences, facts, and context
 * that Ossy should remember for future sessions.
 *
 * Memory Themes:
 * - firm_capabilities: What the firm does, their services, strengths
 * - partner_preferences: What kind of partners they want/don't want
 * - client_profile: Their ideal clients, industries, deal sizes
 * - personal_style: Communication preferences, level of detail
 * - opportunities: Mentioned opportunities, needs, pipeline
 * - feedback: Feedback on matches, suggestions, platform experience
 * - action_items: Commitments, follow-ups, pending tasks
 * - relationships: Context about specific partners or prospects
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { memoryEntries, memoryThemes, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logUsage } from "@/lib/ai/gateway";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Types ────────────────────────────────────────────────

const MEMORY_THEMES = [
  "firm_capabilities",
  "partner_preferences",
  "client_profile",
  "personal_style",
  "opportunities",
  "feedback",
  "action_items",
  "relationships",
] as const;

type MemoryTheme = (typeof MEMORY_THEMES)[number];

interface ExtractedMemory {
  theme: MemoryTheme;
  content: string;
  confidence: number;
}

// ─── Extraction ───────────────────────────────────────────

/**
 * Extract memories from a conversation's messages.
 * Called by the Inngest background job after a chat session.
 */
export async function extractMemoriesFromConversation(params: {
  conversationId: string;
  userId: string;
  organizationId?: string;
}): Promise<ExtractedMemory[]> {
  // Fetch all messages in the conversation
  const msgs = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.conversationId, params.conversationId))
    .orderBy(messages.createdAt);

  if (msgs.length < 2) return []; // Need at least one exchange

  // Build conversation transcript
  const transcript = msgs
    .map((m) => `${m.role === "user" ? "User" : "Ossy"}: ${m.content}`)
    .join("\n\n");

  // Truncate to fit model context
  const truncated = transcript.slice(0, 12000);

  try {
    const memoryStart = Date.now();
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are a memory extraction system for Ossy, an AI consultant.
Analyze this conversation and extract KEY FACTS that Ossy should remember for future sessions.

ONLY extract information that would be useful in FUTURE conversations.
Do NOT extract trivial, obvious, or temporary information.

CONVERSATION:
${truncated}

Extract memories into these themes:
- firm_capabilities: What the user's firm does, their services, strengths, specialties
- partner_preferences: What kind of partners they want or don't want, deal-breakers
- client_profile: Their ideal clients, industries they serve, typical deal sizes
- personal_style: How they like to communicate, how much detail they want
- opportunities: Business opportunities mentioned, pipeline items, needs
- feedback: Feedback on matches, suggestions, or platform features
- action_items: Commitments made, things to follow up on
- relationships: Context about specific partners, prospects, or contacts

Be concise. Each memory should be a single clear statement.
Only include memories with genuine confidence (>0.6).
Return an empty array if nothing worth remembering was discussed.`,
      schema: z.object({
        memories: z.array(
          z.object({
            theme: z.enum(MEMORY_THEMES),
            content: z.string().describe("A clear, concise statement to remember"),
            confidence: z.number().describe("0-1 how confident this is worth remembering"),
          })
        ),
      }),
      maxOutputTokens: 1024,
    });

    const memoryDuration = Date.now() - memoryStart;

    // Log AI usage
    await logUsage({
      userId: params.userId,
      organizationId: params.organizationId,
      model: "google/gemini-2.0-flash-001",
      feature: "memory",
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      entityType: "conversation",
      entityId: params.conversationId,
      durationMs: memoryDuration,
    });

    const memories = result.object.memories.filter((m) => m.confidence >= 0.6);

    // Store extracted memories
    for (const memory of memories) {
      const id = generateId();
      await db.insert(memoryEntries).values({
        id,
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        theme: memory.theme,
        content: memory.content,
        confidence: memory.confidence,
        sourceConversationId: params.conversationId,
      });
    }

    // Update theme summaries
    const affectedThemes = [...new Set(memories.map((m) => m.theme))];
    for (const theme of affectedThemes) {
      await updateThemeSummary(params.userId, params.organizationId, theme);
    }

    return memories;
  } catch (err) {
    console.error("[MemoryExtractor] Failed:", err);
    return [];
  }
}

// ─── Theme Summary ────────────────────────────────────────

async function updateThemeSummary(
  userId: string,
  organizationId: string | undefined,
  theme: string
): Promise<void> {
  // Count entries for this theme
  const entries = await db
    .select({ content: memoryEntries.content })
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.theme, theme)
      )
    );

  const themeId = `${userId}:${theme}`;

  // Upsert theme record
  await db
    .insert(memoryThemes)
    .values({
      id: themeId,
      userId,
      organizationId: organizationId ?? null,
      theme,
      entryCount: entries.length,
      lastUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: memoryThemes.id,
      set: {
        entryCount: entries.length,
        lastUpdatedAt: new Date(),
      },
    });
}

function generateId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
