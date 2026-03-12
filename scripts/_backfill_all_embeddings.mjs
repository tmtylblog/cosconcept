/**
 * Full abstraction + embedding backfill for all enriched firms.
 *
 * For firms missing abstraction profiles: creates one from enrichment_data.
 * For firms with profiles but no embedding: generates the embedding.
 *
 * Run: node scripts/_backfill_all_embeddings.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const sql = neon(env.DATABASE_URL);
const OPENROUTER_KEY = env.OPENROUTER_API_KEY;
const JINA_KEY = env.JINA_API_KEY;

// ─── Step 1: Check current state ──────────────────────────────
const [enrichedFirms, existingProfiles] = await Promise.all([
  sql`SELECT id, name, website, enrichment_data FROM service_firms WHERE enrichment_status = 'enriched'`,
  sql`SELECT id, entity_id, embedding IS NOT NULL as has_embedding, hidden_narrative IS NOT NULL as has_narrative FROM abstraction_profiles WHERE entity_type = 'firm'`,
]);

const profileMap = new Map(existingProfiles.map((p) => [p.entity_id, p]));
const firmsMissingProfile = enrichedFirms.filter((f) => !profileMap.has(f.id));
const firmsNeedEmbedding = existingProfiles.filter((p) => p.has_narrative && !p.has_embedding);

console.log(`\n=== Backfill Status ===`);
console.log(`Enriched firms: ${enrichedFirms.length}`);
console.log(`Existing abstraction profiles: ${existingProfiles.length}`);
console.log(`Firms missing profiles: ${firmsMissingProfile.length}`);
console.log(`Profiles missing embeddings: ${firmsNeedEmbedding.length}`);

// ─── Helper: Generate embedding ────────────────────────────────
async function generateEmbedding(text) {
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${JINA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [text],
      dimensions: 1024,
      task: "retrieval.passage",
    }),
  });
  if (!res.ok) throw new Error(`Jina error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data?.[0]?.embedding;
}

// ─── Helper: Generate narrative from enrichment data ───────────
async function generateNarrative(firm) {
  const ed = firm.enrichment_data || {};
  const cls = ed.classification || {};
  const ext = ed.extracted || {};
  const caseStudies = ed.caseStudies || [];

  const prompt = `You are analyzing a professional services firm. Based on the data below, write a concise 3-4 sentence hidden narrative that captures what this firm truly does, who they serve, and what makes them distinctive. Focus on observable facts, not marketing language.

Firm: ${firm.name}
Website: ${firm.website || "unknown"}
Categories: ${(cls.categories || []).join(", ") || "unknown"}
Skills: ${(cls.skills || []).slice(0, 15).join(", ") || "unknown"}
Industries: ${(cls.industries || []).join(", ") || "unknown"}
Markets: ${(cls.markets || []).join(", ") || "unknown"}
Services: ${(ext.services || []).slice(0, 10).join(", ") || "unknown"}
Case studies: ${caseStudies.slice(0, 3).map(cs => cs.title || "").filter(Boolean).join("; ") || "none"}

Write a factual, search-optimized narrative (no fluff, no "they are committed to", just what they do):`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── Step 2: Create missing abstraction profiles ───────────────
if (firmsMissingProfile.length > 0) {
  console.log(`\n--- Creating ${firmsMissingProfile.length} missing abstraction profiles ---`);

  let created = 0, errors = 0;
  for (const firm of firmsMissingProfile) {
    try {
      const ed = firm.enrichment_data || {};
      const cls = ed.classification || {};
      const ext = ed.extracted || {};

      const narrative = await generateNarrative(firm);
      const profileId = `abs_${firm.id}`;

      const topSkills = (cls.skills || []).slice(0, 15);
      const topServices = (ext.services || []).slice(0, 10);
      const topIndustries = (cls.industries || []).slice(0, 10);

      // Generate embedding text
      const embeddingText = `${narrative}\n\nServices: ${topServices.join(", ")}\nSkills: ${topSkills.join(", ")}\nIndustries: ${topIndustries.join(", ")}`;
      const embedding = await generateEmbedding(embeddingText);

      if (!embedding) throw new Error("No embedding returned");

      const vectorStr = `[${embedding.join(",")}]`;

      await sql`
        INSERT INTO abstraction_profiles (
          id, entity_type, entity_id, hidden_narrative,
          top_services, top_skills, top_industries,
          embedding, last_enriched_at, created_at, updated_at
        ) VALUES (
          ${profileId}, 'firm', ${firm.id}, ${narrative},
          ${JSON.stringify(topServices)}, ${JSON.stringify(topSkills)}, ${JSON.stringify(topIndustries)},
          ${vectorStr}::vector, NOW(), NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          hidden_narrative = EXCLUDED.hidden_narrative,
          top_services = EXCLUDED.top_services,
          top_skills = EXCLUDED.top_skills,
          top_industries = EXCLUDED.top_industries,
          embedding = EXCLUDED.embedding,
          last_enriched_at = NOW(),
          updated_at = NOW()
      `;

      created++;
      process.stdout.write(`\r  ✓ ${created}/${firmsMissingProfile.length} — ${firm.name.slice(0, 40)}`);

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors++;
      console.log(`\n  ✗ ${firm.name}: ${err.message}`);
    }
  }
  console.log(`\n  Done: ${created} created, ${errors} errors`);
}

// ─── Step 3: Embed profiles that have narrative but no embedding ─
if (firmsNeedEmbedding.length > 0) {
  console.log(`\n--- Embedding ${firmsNeedEmbedding.length} profiles missing embeddings ---`);

  // Fetch full data for these profiles
  const profileIds = firmsNeedEmbedding.map(p => p.id);
  const fullProfiles = await sql`
    SELECT id, hidden_narrative, top_services, top_skills, top_industries
    FROM abstraction_profiles
    WHERE id = ANY(${profileIds}) AND hidden_narrative IS NOT NULL
  `;

  let embedded = 0, errors = 0;
  for (const profile of fullProfiles) {
    try {
      const services = (profile.top_services || []).join(", ");
      const skills = (profile.top_skills || []).join(", ");
      const industries = (profile.top_industries || []).join(", ");
      const embeddingText = `${profile.hidden_narrative}\n\nServices: ${services}\nSkills: ${skills}\nIndustries: ${industries}`;

      const embedding = await generateEmbedding(embeddingText);
      if (!embedding) throw new Error("No embedding returned");

      const vectorStr = `[${embedding.join(",")}]`;
      await sql`UPDATE abstraction_profiles SET embedding = ${vectorStr}::vector, updated_at = NOW() WHERE id = ${profile.id}`;

      embedded++;
      process.stdout.write(`\r  ✓ ${embedded}/${fullProfiles.length}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors++;
      console.log(`\n  ✗ ${profile.id}: ${err.message}`);
    }
  }
  console.log(`\n  Done: ${embedded} embedded, ${errors} errors`);
}

// ─── Final status ──────────────────────────────────────────────
const finalCount = await sql`
  SELECT
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    COUNT(*) FILTER (WHERE embedding IS NULL) as without_embedding,
    COUNT(*) as total
  FROM abstraction_profiles
  WHERE entity_type = 'firm'
`;

console.log(`\n=== Final State ===`);
console.log(`Total firm profiles: ${finalCount[0].total}`);
console.log(`With embeddings: ${finalCount[0].with_embedding}`);
console.log(`Without embeddings: ${finalCount[0].without_embedding}`);
console.log(`\n${finalCount[0].with_embedding === finalCount[0].total ? "✓ All profiles have embeddings!" : "⚠ Some profiles still missing embeddings"}`);
