/**
 * POST /api/admin/embeddings/backfill
 *
 * Backfills Jina AI embeddings for all firm abstraction profiles
 * that have a hiddenNarrative but no embedding yet.
 *
 * Processes in batches of 10 with 500ms delay between batches
 * to respect Jina AI rate limits.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { abstractionProfiles } from "@/lib/db/schema";
import { eq, isNull, isNotNull, and } from "drizzle-orm";

async function generatePassageEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error("JINA_API_KEY not set");
  }

  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [text],
      dimensions: 1024,
      task: "retrieval.passage",
    }),
  });

  if (!response.ok) {
    throw new Error(`Jina API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("No embedding returned from Jina AI");
  }
  return embedding;
}

export async function POST() {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all firm abstraction profiles missing embeddings
  const profiles = await db
    .select({
      id: abstractionProfiles.id,
      hiddenNarrative: abstractionProfiles.hiddenNarrative,
      topServices: abstractionProfiles.topServices,
      topSkills: abstractionProfiles.topSkills,
      topIndustries: abstractionProfiles.topIndustries,
    })
    .from(abstractionProfiles)
    .where(
      and(
        eq(abstractionProfiles.entityType, "firm"),
        isNotNull(abstractionProfiles.hiddenNarrative),
        isNull(abstractionProfiles.embedding)
      )
    );

  if (profiles.length === 0) {
    return Response.json({ processed: 0, errors: 0, message: "No profiles need backfilling" });
  }

  const BATCH_SIZE = 10;
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (profile) => {
        try {
          const services = (profile.topServices as string[] | null) ?? [];
          const skills = (profile.topSkills as string[] | null) ?? [];
          const industries = (profile.topIndustries as string[] | null) ?? [];
          const embeddingText = `${profile.hiddenNarrative}\n\nServices: ${services.join(", ")}\nSkills: ${skills.join(", ")}\nIndustries: ${industries.join(", ")}`;

          const embeddingVector = await generatePassageEmbedding(embeddingText);

          await db
            .update(abstractionProfiles)
            .set({ embedding: embeddingVector })
            .where(eq(abstractionProfiles.id, profile.id));

          processed++;
        } catch (err) {
          console.error(`[EmbeddingBackfill] Failed for profile ${profile.id}:`, err);
          errors++;
        }
      })
    );

    // 500ms delay between batches (skip delay after last batch)
    if (i + BATCH_SIZE < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return Response.json({
    processed,
    errors,
    total: profiles.length,
    message: `Backfill complete: ${processed} embedded, ${errors} failed`,
  });
}
