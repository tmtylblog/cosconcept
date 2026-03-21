/**
 * Layer 2: Vector Similarity Search
 *
 * Takes ~500 candidates from Layer 1 and re-ranks them
 * using cosine similarity between the query embedding
 * and each firm's abstraction profile embedding.
 *
 * Uses pgvector for efficient similarity search on Neon.
 * When a profile has no embedding, falls back to text overlap scoring.
 */

import { db } from "@/lib/db";
import { abstractionProfiles } from "@/lib/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import type { MatchCandidate } from "./types";

/**
 * Generate an embedding for a search query using Jina AI.
 *
 * Uses jina-embeddings-v3 (1024-dim) with task "retrieval.query".
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
      dimensions: 1024,
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
 * Uses jina-embeddings-v3 (1024-dim) with task "retrieval.passage".
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
      dimensions: 1024,
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
 * Generates a query embedding, then computes cosine similarity against
 * each candidate's stored abstraction profile embedding via pgvector.
 *
 * For candidates with no embedding stored, falls back to text-overlap scoring.
 * Final score: 60% structured score + 40% vector score.
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
    const rows = await db
      .select({
        entityId: abstractionProfiles.entityId,
        similarity: sql<number>`1 - (embedding <=> ${vectorStr}::vector)`,
      })
      .from(abstractionProfiles)
      .where(
        and(
          inArray(abstractionProfiles.id, entityIds),
          sql`embedding IS NOT NULL`
        )
      );

    const similarityMap = new Map(
      rows.map((r) => [r.entityId, r.similarity])
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
      // Non-firm entities (experts, case studies) don't have abstraction profiles
      // or embeddings. Don't penalize them — keep their full structured score.
      if (candidate.entityType && candidate.entityType !== "firm") {
        return {
          ...candidate,
          vectorScore: 0,
          totalScore: candidate.structuredScore,
        };
      }

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

    // Entity diversity: reserve slots for non-firm entities before topK cut.
    // Without this, firms (which get vectorScore boost) always fill all 50 slots.
    const firmScored = scored.filter((c) => !c.entityType || c.entityType === "firm");
    const nonFirmScored = scored.filter((c) => c.entityType && c.entityType !== "firm");
    firmScored.sort((a, b) => b.totalScore - a.totalScore);
    nonFirmScored.sort((a, b) => b.totalScore - a.totalScore);

    // Reserve up to 8 non-firm results, fill rest with firms
    const reserved = nonFirmScored.slice(0, Math.min(8, nonFirmScored.length));
    const firmSlots = topK - reserved.length;
    const topFirms = firmScored.slice(0, firmSlots);
    const diverse = [...reserved, ...topFirms];
    diverse.sort((a, b) => b.totalScore - a.totalScore);
    return diverse;
  }

  // ── Text-overlap fallback (no Jina key or embedding failed) ──
  const profiles = await db
    .select({ entityId: abstractionProfiles.entityId, hiddenNarrative: abstractionProfiles.hiddenNarrative })
    .from(abstractionProfiles)
    .where(inArray(abstractionProfiles.id, entityIds));

  const profileMap = new Map(profiles.map((p) => [p.entityId, p.hiddenNarrative]));
  const queryTerms = rawQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scored = candidates.map((candidate) => {
    // Non-firm entities don't have abstraction profiles — keep full structured score
    if (candidate.entityType && candidate.entityType !== "firm") {
      return {
        ...candidate,
        vectorScore: 0,
        totalScore: candidate.structuredScore,
      };
    }

    const narrative = profileMap.get(candidate.firmId)?.toLowerCase() ?? "";
    let vectorScore = 0;
    if (narrative && queryTerms.length > 0) {
      const matches = queryTerms.filter((t) => narrative.includes(t));
      vectorScore = matches.length / queryTerms.length;
    }
    const totalScore = candidate.structuredScore * 0.6 + vectorScore * 0.4;
    return { ...candidate, vectorScore, totalScore };
  });

  // Entity diversity: reserve slots for non-firm entities before topK cut
  const firmScored2 = scored.filter((c) => !c.entityType || c.entityType === "firm");
  const nonFirmScored2 = scored.filter((c) => c.entityType && c.entityType !== "firm");
  firmScored2.sort((a, b) => b.totalScore - a.totalScore);
  nonFirmScored2.sort((a, b) => b.totalScore - a.totalScore);

  const reserved2 = nonFirmScored2.slice(0, Math.min(8, nonFirmScored2.length));
  const firmSlots2 = topK - reserved2.length;
  const topFirms2 = firmScored2.slice(0, firmSlots2);
  const diverse2 = [...reserved2, ...topFirms2];
  diverse2.sort((a, b) => b.totalScore - a.totalScore);
  return diverse2;
}
