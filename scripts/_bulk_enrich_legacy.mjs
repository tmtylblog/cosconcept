/**
 * Bulk enrichment for legacy firms stuck in 'partial' status.
 *
 * For each firm: Jina scrape → Gemini classify → save → embed.
 * Resumable: skips firms already enriched.
 *
 * Run: node scripts/_bulk_enrich_legacy.mjs
 * Limit: node scripts/_bulk_enrich_legacy.mjs 50  (first 50)
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const sql = neon(env.DATABASE_URL);
const OPENROUTER_KEY = env.OPENROUTER_API_KEY;
const JINA_KEY = env.JINA_API_KEY;
const BATCH_LIMIT = parseInt(process.argv[2] || "9999");
const CONCURRENCY = 3; // parallel firms at once

// ─── Taxonomy (from data/ CSVs) ──────────────────────────────
const CATEGORIES = readFileSync(new URL("../data/categories.csv", import.meta.url), "utf8")
  .split("\n").slice(1).map(l => l.split(",")[0]).filter(Boolean);

const SKILLS_L2 = [...new Set(
  readFileSync(new URL("../data/skills-L1.csv", import.meta.url), "utf8")
    .split("\n").slice(1).map(l => l.split(",")[1]).filter(Boolean)
)];

const MARKETS = [
  "Global","North America","Latin America","Europe","EMEA","Asia Pacific","APAC",
  "Middle East","Africa","Australia","United States","United Kingdom","Canada",
  "Germany","France","Singapore","India","UAE","Netherlands","Spain","Italy",
];

// ─── Jina scrape ──────────────────────────────────────────────
async function scrapeWebsite(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${JINA_KEY}`,
        Accept: "text/plain",
        "X-Return-Format": "text",
        "X-Timeout": "15",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 100) return null;
    // Check for blocks
    if (/just a moment|checking your browser|access denied|ddos protection/i.test(text)) return null;
    return text.slice(0, 8000); // cap at 8K chars
  } catch {
    return null;
  }
}

// ─── Gemini classification ────────────────────────────────────
async function classifyFirm(firmName, website, industry, scraped) {
  const categoriesList = CATEGORIES.slice(0, 30).join(", ");
  const skillsSample = SKILLS_L2.slice(0, 50).join(", "); // sample for prompt length
  const marketsList = MARKETS.join(", ");

  const content = scraped
    ? `Firm: ${firmName}\nWebsite: ${website}\nIndustry: ${industry || "unknown"}\n\nWebsite content:\n${scraped}`
    : `Firm: ${firmName}\nWebsite: ${website}\nIndustry: ${industry || "unknown"}\n(no website content available)`;

  const prompt = `Classify this professional services firm for a B2B partnership platform.

${content}

Based on the above, return a JSON object with ONLY these fields:
- categories: array of 1-3 most fitting firm categories from: ${categoriesList}
- skills: array of 5-15 relevant skills from: ${skillsSample} (and other common B2B skills)
- industries: array of 1-5 industries they serve (e.g. "Technology", "Healthcare", "E-commerce", "Finance", "Retail")
- markets: array of 1-3 geographic markets from: ${marketsList}
- languages: array of business languages (usually ["English"])
- services: array of 3-8 specific services they offer

Return only valid JSON, no explanation.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Jina embedding ──────────────────────────────────────────
async function generateEmbedding(text) {
  try {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${JINA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jina-embeddings-v3", input: [text], dimensions: 1024, task: "retrieval.passage" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ─── Process one firm ─────────────────────────────────────────
async function processFirm(firm) {
  const ed = firm.enrichment_data || {};
  const cd = ed.companyData || {};

  // 1. Scrape website
  const scraped = await scrapeWebsite(firm.website);

  // 2. Classify
  const classification = await classifyFirm(
    firm.name,
    firm.website,
    cd.industry,
    scraped
  );

  if (!classification) return { status: "classify_failed" };

  // 3. Build enrichment_data update
  const newEnrichmentData = {
    ...ed,
    extracted: {
      services: classification.services || [],
      aboutPitch: scraped ? scraped.slice(0, 500) : "",
      clients: [],
      teamMembers: [],
      caseStudyUrls: [],
    },
    classification: {
      categories: classification.categories || [],
      skills: classification.skills || [],
      industries: classification.industries || [],
      markets: classification.markets || [],
      languages: classification.languages || ["English"],
      confidence: 0.7,
      firmNature: "service_provider",
    },
  };

  // 4. Update service_firms
  await sql`
    UPDATE service_firms
    SET
      enrichment_data = ${JSON.stringify(newEnrichmentData)},
      enrichment_status = 'enriched',
      updated_at = NOW()
    WHERE id = ${firm.id}
  `;

  // 5. Generate narrative + embedding for abstraction profile
  const skills = classification.skills?.slice(0, 10).join(", ") || "";
  const services = classification.services?.slice(0, 8).join(", ") || "";
  const industries = classification.industries?.slice(0, 5).join(", ") || "";
  const markets = classification.markets?.join(", ") || "";
  const categories = classification.categories?.join(", ") || "";

  const narrative = scraped
    ? `${firm.name} is a ${categories} firm serving ${industries || "various industries"} in ${markets || "multiple markets"}. They offer ${services || "professional services"} with expertise in ${skills || "various capabilities"}.`
    : `${firm.name} (${firm.website}) operates as a ${categories || "professional services"} firm. Industry: ${cd.industry || "professional services"}. Markets: ${markets || "unknown"}.`;

  const embeddingText = `${narrative}\n\nServices: ${services}\nSkills: ${skills}\nIndustries: ${industries}`;
  const embedding = await generateEmbedding(embeddingText);

  const profileId = `abs_${firm.id}`;
  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    await sql`
      INSERT INTO abstraction_profiles (
        id, entity_type, entity_id, hidden_narrative,
        top_services, top_skills, top_industries,
        embedding, last_enriched_at, created_at, updated_at
      ) VALUES (
        ${profileId}, 'firm', ${firm.id}, ${narrative},
        ${JSON.stringify(classification.services?.slice(0, 10) || [])},
        ${JSON.stringify(classification.skills?.slice(0, 15) || [])},
        ${JSON.stringify(classification.industries?.slice(0, 10) || [])},
        ${vectorStr}::vector, NOW(), NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        hidden_narrative = EXCLUDED.hidden_narrative,
        top_services = EXCLUDED.top_services,
        top_skills = EXCLUDED.top_skills,
        top_industries = EXCLUDED.top_industries,
        embedding = EXCLUDED.embedding,
        last_enriched_at = NOW(), updated_at = NOW()
    `;
    return { status: "ok", scraped: !!scraped };
  } else {
    // Save profile without embedding (can embed later)
    await sql`
      INSERT INTO abstraction_profiles (
        id, entity_type, entity_id, hidden_narrative,
        top_services, top_skills, top_industries,
        last_enriched_at, created_at, updated_at
      ) VALUES (
        ${profileId}, 'firm', ${firm.id}, ${narrative},
        ${JSON.stringify(classification.services?.slice(0, 10) || [])},
        ${JSON.stringify(classification.skills?.slice(0, 15) || [])},
        ${JSON.stringify(classification.industries?.slice(0, 10) || [])},
        NOW(), NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        hidden_narrative = EXCLUDED.hidden_narrative,
        top_services = EXCLUDED.top_services,
        top_skills = EXCLUDED.top_skills,
        top_industries = EXCLUDED.top_industries,
        last_enriched_at = NOW(), updated_at = NOW()
    `;
    return { status: "ok_no_embed", scraped: !!scraped };
  }
}

// ─── Main ─────────────────────────────────────────────────────
const firms = await sql`
  SELECT id, name, website, enrichment_data
  FROM service_firms
  WHERE enrichment_status = 'partial'
    AND website IS NOT NULL AND website != ''
  ORDER BY id
  LIMIT ${BATCH_LIMIT}
`;

console.log(`\nEnriching ${firms.length} legacy firms (CONCURRENCY=${CONCURRENCY})...\n`);

let done = 0, ok = 0, scraped = 0, failed = 0;
const startTime = Date.now();

// Process in batches of CONCURRENCY
for (let i = 0; i < firms.length; i += CONCURRENCY) {
  const batch = firms.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(f => processFirm(f).catch(err => ({ status: "error", err: err.message }))));

  for (let j = 0; j < batch.length; j++) {
    const r = results[j];
    done++;
    if (r.status === "ok" || r.status === "ok_no_embed") {
      ok++;
      if (r.scraped) scraped++;
    } else {
      failed++;
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const eta = done > 0 ? Math.round((firms.length - done) * (Date.now() - startTime) / done / 1000) : "?";
    process.stdout.write(`\r[${done}/${firms.length}] ✓${ok} ✗${failed} | scraped=${scraped} | ${elapsed}s elapsed, ~${eta}s left   `);
  }

  // Small pause between batches
  if (i + CONCURRENCY < firms.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}

// Final status
const finalStats = await sql`
  SELECT
    COUNT(*) FILTER (WHERE enrichment_status = 'enriched') as enriched,
    COUNT(*) FILTER (WHERE enrichment_status = 'partial') as partial,
    COUNT(*) as total
  FROM service_firms
`;
const embedStats = await sql`
  SELECT
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    COUNT(*) as total
  FROM abstraction_profiles WHERE entity_type = 'firm'
`;

console.log(`\n\n=== Done ===`);
console.log(`Processed: ${done} | Success: ${ok} | Failed: ${failed} | Scraped: ${scraped}/${done}`);
console.log(`\nFirm status: enriched=${finalStats[0].enriched} partial=${finalStats[0].partial} total=${finalStats[0].total}`);
console.log(`Abstraction profiles: ${embedStats[0].with_embedding}/${embedStats[0].total} with embeddings`);
