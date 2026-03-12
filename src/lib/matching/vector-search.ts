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
import { inArray, sql } from "drizzle-orm";
import type { MatchCandidate } from "./types";

/**
 * Generate an embedding for a search query using Jina AI.
 *
 * Uses jina-embeddings-v3 (1536-dim) with task "retrieval.query".
 * Used for the query side of asymmetric retrieval.
 */
export async function generateQueryEmbedding(
  queryText: string
): Promise<number[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[VectorSearch] JINA_API_KEY not set, skipping embedding");
    return [];
  }

  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [queryText],
      dimensions: 1536,
      task: "retrieval.query",
    }),
  });

  if (!response.ok) {
    console.error("[VectorSearch] Jina embedding failed:", response.statusText);
    return [];
  }

  const data = await response.json();
  return data.data?.[0]?.embedding ?? [];
}

/**
 * Generate an embedding for a firm's abstraction profile using Jina AI.
 *
 * Uses jina-embeddings-v3 (1536-dim) with task "retrieval.passage".
 * Used for the document/passage side of asymmetric retrieval.
 */
export async function generateFirmEmbedding(
  narrativeText: string
): Promise<number[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[VectorSearch] JINA_API_KEY not set, skipping embedding");
    return [];
  }

  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [narrativeText],
      dimensions: 1536,
      task: "retrieval.passage",
    }),
  });

  if (!response.ok) {
    console.error("[VectorSearch] Jina firm embedding failed:", response.statusText);
    return [];
  }

  const data = await response.json();
  return data.data?.[0]?.embedding ?? [];
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

  const firmIds = candidates.map((c) => c.firmId);
  const entityIds = firmIds.map((id) => `abs_${id}`);

  // Try to generate a query embedding for real cosine similarity
  const queryEmbedding = await generateQueryEmbedding(rawQuery);

  if (queryEmbedding.length > 0) {
    // ── Pgvector path: cosine similarity via SQL ─────────
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // Get cosine similarity scores for firms that have embeddings
    const rows = await db.execute<{ entity_id: string; similarity: number }>(
      sql`SELECT entity_id,
               (1 - (embedding <=> ${vectorStr}::vector)) AS similarity
          FROM abstraction_profiles
          WHERE id = ANY(${entityIds}::text[])
            AND embedding IS NOT NULL`
    );

    const similarityMap = new Map(
      (rows as unknown as { rows: { entity_id: string; similarity: number }[] }).rows.map(
        (r) => [r.entity_id, r.similarity]
      )
    );

    // For firms without embeddings yet, fall back to text overlap
    const profilesWithoutEmbedding =
      similarityMap.size < candidates.length
        ? await db
            .select({ entityId: abstractionProfiles.entityId, hiddenNarrative: abstractionProfiles.hiddenNarrative })
            .from(abstractionProfiles)
            .where(inArray(abstractionProfiles.id, entityIds))
        : [];
    const narrativeMap = new Map(
      profilesWithoutEmbedding.map((p) => [p.entityId, p.hiddenNarrative])
    );
    const queryTerms = rawQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    const scored = candidates.map((candidate) => {
      let vectorScore = similarityMap.get(candidate.firmId) ?? 0;

      if (!similarityMap.has(candidate.firmId)) {
        const narrative = narrativeMap.get(candidate.firmId)?.toLowerCase() ?? "";
        if (narrative && queryTerms.length > 0) {
          const matches = queryTerms.filter((t) => narrative.includes(t));
          vectorScore = matches.length / queryTerms.length;
        }
      }

      const totalScore = candidate.structuredScore * 0.6 + vectorScore * 0.4;
      return { ...candidate, vectorScore, totalScore };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);
    return scored.slice(0, topK);
  }

  // ── Text-overlap fallback (no Jina key or embedding failed) ──
  const profiles = await db
    .select({ entityId: abstractionProfiles.entityId, hiddenNarrative: abstractionProfiles.hiddenNarrative })
    .from(abstractionProfiles)
    .where(inArray(abstractionProfiles.id, entityIds));

  const profileMap = new Map(profiles.map((p) => [p.entityId, p.hiddenNarrative]));
  const queryTerms = rawQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scored = candidates.map((candidate) => {
    const narrative = profileMap.get(candidate.firmId)?.toLowerCase() ?? "";
    let vectorScore = 0;
    if (narrative && queryTerms.length > 0) {
      const matches = queryTerms.filter((t) => narrative.includes(t));
      vectorScore = matches.length / queryTerms.length;
    }
    const totalScore = candidate.structuredScore * 0.6 + vectorScore * 0.4;
    return { ...candidate, vectorScore, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, topK);
}
