/**
 * Memory Retriever — fetches relevant memories for Ossy's context.
 *
 * Before each Ossy response, this retrieves the most relevant
 * memories to inject into the system prompt.
 *
 * Retrieval strategy:
 * 1. Fetch all theme summaries for the user
 * 2. Fetch recent entries (last 20) across all themes
 * 3. Format as context block for injection into Ossy's prompt
 *
 * Future: Use vector similarity to find semantically relevant memories
 * based on the current conversation topic.
 */

import { db } from "@/lib/db";
import { memoryEntries, memoryThemes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────

export interface MemoryContext {
  /** Formatted memory block for injection into Ossy's system prompt */
  contextBlock: string;
  /** Number of memories loaded */
  memoryCount: number;
  /** Themes present */
  themes: string[];
}

// ─── Theme labels for display ─────────────────────────────

const THEME_LABELS: Record<string, string> = {
  firm_capabilities: "Their Firm",
  partner_preferences: "Partner Preferences",
  client_profile: "Their Clients",
  personal_style: "Communication Style",
  opportunities: "Opportunities & Pipeline",
  feedback: "Past Feedback",
  action_items: "Action Items",
  relationships: "Relationship Context",
};

// ─── Retrieval ────────────────────────────────────────────

/**
 * Retrieve relevant memories for a user, formatted for Ossy's context.
 *
 * @param userId - The user to retrieve memories for
 * @param maxEntries - Maximum number of individual entries to include (default: 20)
 * @returns Formatted memory context or null if no memories exist
 */
export async function retrieveMemoryContext(
  userId: string,
  maxEntries = 20
): Promise<MemoryContext | null> {
  // Fetch all memory entries for this user, ordered by recency
  const entries = await db
    .select({
      theme: memoryEntries.theme,
      content: memoryEntries.content,
      confidence: memoryEntries.confidence,
      createdAt: memoryEntries.createdAt,
    })
    .from(memoryEntries)
    .where(eq(memoryEntries.userId, userId))
    .orderBy(desc(memoryEntries.createdAt))
    .limit(maxEntries);

  if (entries.length === 0) return null;

  // Group by theme
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.theme]) grouped[entry.theme] = [];
    grouped[entry.theme].push(entry.content);
  }

  // Build context block
  const sections: string[] = [];
  for (const [theme, items] of Object.entries(grouped)) {
    const label = THEME_LABELS[theme] ?? theme;
    const bullets = items.map((item) => `  - ${item}`).join("\n");
    sections.push(`### ${label}\n${bullets}`);
  }

  const contextBlock = `## What You Remember About This User
You've learned the following from previous conversations. Use this context naturally — don't announce that you "remember" things, just demonstrate awareness.

${sections.join("\n\n")}`;

  return {
    contextBlock,
    memoryCount: entries.length,
    themes: Object.keys(grouped),
  };
}

/**
 * Get memory stats for a user (for the settings page).
 */
export async function getMemoryStats(userId: string): Promise<{
  themes: { theme: string; label: string; entryCount: number; lastUpdated: Date | null }[];
  totalEntries: number;
}> {
  const themes = await db
    .select({
      theme: memoryThemes.theme,
      entryCount: memoryThemes.entryCount,
      lastUpdatedAt: memoryThemes.lastUpdatedAt,
    })
    .from(memoryThemes)
    .where(eq(memoryThemes.userId, userId))
    .orderBy(desc(memoryThemes.lastUpdatedAt));

  const totalEntries = themes.reduce(
    (sum, t) => sum + (t.entryCount ?? 0),
    0
  );

  return {
    themes: themes.map((t) => ({
      theme: t.theme,
      label: THEME_LABELS[t.theme] ?? t.theme,
      entryCount: t.entryCount ?? 0,
      lastUpdated: t.lastUpdatedAt,
    })),
    totalEntries,
  };
}

/**
 * Get all memory entries for a specific theme (for the settings page).
 */
export async function getMemoryEntriesByTheme(
  userId: string,
  theme: string
): Promise<{ id: string; content: string; confidence: number | null; createdAt: Date }[]> {
  return db
    .select({
      id: memoryEntries.id,
      content: memoryEntries.content,
      confidence: memoryEntries.confidence,
      createdAt: memoryEntries.createdAt,
    })
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.theme, theme)
      )
    )
    .orderBy(desc(memoryEntries.createdAt));
}

/**
 * Delete a specific memory entry.
 */
export async function deleteMemoryEntry(
  userId: string,
  entryId: string
): Promise<boolean> {
  const result = await db
    .delete(memoryEntries)
    .where(
      and(
        eq(memoryEntries.id, entryId),
        eq(memoryEntries.userId, userId)
      )
    );
  return (result?.rowCount ?? 0) > 0;
}

/**
 * Delete all memories for a theme.
 */
export async function deleteMemoryTheme(
  userId: string,
  theme: string
): Promise<number> {
  const result = await db
    .delete(memoryEntries)
    .where(
      and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.theme, theme)
      )
    );

  // Also delete the theme record
  await db
    .delete(memoryThemes)
    .where(
      and(
        eq(memoryThemes.userId, userId),
        eq(memoryThemes.theme, theme)
      )
    );

  return result?.rowCount ?? 0;
}

/**
 * Delete ALL memories for a user (nuclear option).
 */
export async function deleteAllMemories(userId: string): Promise<number> {
  const result = await db
    .delete(memoryEntries)
    .where(eq(memoryEntries.userId, userId));

  await db
    .delete(memoryThemes)
    .where(eq(memoryThemes.userId, userId));

  return result?.rowCount ?? 0;
}
