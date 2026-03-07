/**
 * Inngest Function: Extract Memories
 *
 * Background job that extracts memories from a conversation
 * after the chat session ends or at periodic intervals.
 */

import { inngest } from "../client";
import { extractMemoriesFromConversation } from "@/lib/ai/memory-extractor";

export const extractMemories = inngest.createFunction(
  {
    id: "memory-extract",
    name: "Extract Conversation Memories",
    retries: 1,
    concurrency: [{ limit: 10 }],
  },
  { event: "memory/extract" },
  async ({ event, step }) => {
    const { conversationId, userId, organizationId } = event.data;

    const memories = await step.run("extract", async () => {
      return extractMemoriesFromConversation({
        conversationId,
        userId,
        organizationId,
      });
    });

    return {
      conversationId,
      memoriesExtracted: memories.length,
      themes: [...new Set(memories.map((m) => m.theme))],
    };
  }
);
