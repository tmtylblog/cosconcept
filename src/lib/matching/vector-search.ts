/**
 * Layer 2: Vector Similarity Search
 *
 * Takes ~500 candidates from Layer 1 and re-ranks them
 * using cosine similarity between the query embedding
 * and each firm's abstraction profile embedding.
 *
 * Uses pgvector for efficient similarity search on Neon.
 * When pgvector is not yet enabled, falls back to scoring
 * based on text overlap.
 */

import { db } from "@/lib/db";
import { abstractionProfiles } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import type { MatchCandidate } from "./types";

/**
 * Generate an embedding for a search query using OpenAI.
 *
 * Uses text-embedding-3-small (1536-dim) for cost efficiency.
 * Cost: ~$0.00002 per query.
 */
export async function generateQueryEmbedding(
  queryText: string
): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[VectorSearch] OPENAI_API_KEY not set, skipping embedding");
    return [];
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: queryText,
    }),
  });

  if (!response.ok) {
    console.error("[VectorSearch] Embedding failed:", response.statusText);
    return [];
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    console.error("[VectorSearch] No embedding returned from OpenAI");
    return [];
  }
  return data.data[0].embedding;
}

/**
 * Layer 2: Re-rank candidates using vector similarity.
 *
 * For each candidate, computes cosine similarity between
 * the query embedding and the firm's abstraction embedding.
 *
 * When pgvector is fully enabled, this uses SQL:
 *   SELECT * FROM abstraction_profiles
 *   WHERE entity_id = ANY($firmIds)
 *   ORDER BY embedding <=> $queryEmbedding
 *
 * Currently uses a text-based fallback since pgvector
 * columns need manual setup on Neon.
 */
export async function vectorRerank(
  candidates: MatchCandidate[],
  rawQuery: string,
  topK = 50
): Promise<MatchCandidate[]> {
  if (candidates.length === 0) return [];

  // Load abstraction profiles for candidates
  const firmIds = candidates.map((c) => c.firmId);
  const entityIds = firmIds.map((id) => `abs_${id}`);

  const profiles = await db
    .select()
    .from(abstractionProfiles)
    .where(inArray(abstractionProfiles.id, entityIds));

  // Create lookup map
  const profileMap = new Map(
    profiles.map((p) => [p.entityId, p])
  );

  // Score each candidate using text-based similarity
  // (pgvector cosine similarity would be used when embedding column is active)
  const queryTerms = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored = candidates.map((candidate) => {
    const profile = profileMap.get(candidate.firmId);
    let vectorScore = 0;

    if (profile?.hiddenNarrative) {
      const narrative = profile.hiddenNarrative.toLowerCase();
      // Simple term overlap scoring (replaced by cosine similarity with pgvector)
      const matches = queryTerms.filter((term) => narrative.includes(term));
      vectorScore = queryTerms.length > 0 ? matches.length / queryTerms.length : 0;
    }

    // Combine scores: 60% structured + 40% vector
    const totalScore =
      candidate.structuredScore * 0.6 + vectorScore * 0.4;

    return {
      ...candidate,
      vectorScore,
      totalScore,
    };
  });

  // Sort by combined score and take top K
  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, topK);
}
