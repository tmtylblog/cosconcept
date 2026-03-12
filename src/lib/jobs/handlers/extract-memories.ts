/**
 * Handler: extract-memories
 * Extracts memories from a conversation after a chat session.
 */

import { extractMemoriesFromConversation } from "@/lib/ai/memory-extractor";

interface Payload {
  conversationId: string;
  userId: string;
  organizationId?: string;
}

export async function handleExtractMemories(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { conversationId, userId, organizationId } = payload as unknown as Payload;

  const memories = await extractMemoriesFromConversation({
    conversationId,
    userId,
    organizationId,
  });

  return {
    conversationId,
    memoriesExtracted: memories.length,
    themes: [...new Set(memories.map((m) => m.theme))],
  };
}
