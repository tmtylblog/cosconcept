/**
 * Discover and ingest case study / portfolio pages for enriched firms.
 * Only processes real (non-test) firms.
 *
 * Run: node scripts/_discover_case_studies.mjs [limit]
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
const LIMIT = parseInt(process.argv[2] || "9999");
const CONCURRENCY = 3;

const CS_PATHS = [
  "/case-studies", "/case-study", "/work", "/our-work", "/portfolio",
  "/projects", "/success-stories", "/clients/results", "/results",
  "/impact", "/client-work", "/featured-work",
];

function uid() {
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUrl(website) {
  if (!website) return null;
  let url = website.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

async function scrapeUrl(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Authorization: `Bearer ${JINA_KEY}`,
        Accept: "text/plain",
        "X-Return-Format": "text",
        "X-Timeout": "12",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 300) return null;
    if (/just a moment|checking your browser|access denied|403 forbidden|404 not found|page not found|not found|error 404/i.test(text.slice(0, 300))) return null;
    return text.slice(0, 6000);
  } catch {
    return null;
  }
}

async function extractCaseStudies(firmName, pageUrl, content) {
  const prompt = `Analyze this page from "${firmName}" (${pageUrl}) and extract case study entries.

PAGE CONTENT:
${content.slice(0, 4000)}

Return JSON with up to 5 case studies. Only include real project/client work entries.
{
  "caseStudies": [
    {
      "title": "specific project title",
      "clientName": "client name or null",
      "summary": "what was done and result (1-2 sentences)",
      "skills": ["skill1"],
      "industries": ["industry1"]
    }
  ]
}
If no specific case studies found (e.g., 404, generic page, no client work), return {"caseStudies":[]}.`;

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
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return [];
    const parsed = JSON.parse(text);
    return (parsed.caseStudies || []).filter(cs => cs.title);
  } catch {
    return [];
  }
}

async function processFirm(firm) {
  const baseUrl = normalizeUrl(firm.website);
  if (!baseUrl) return { found: 0, tried: 0 };

  // Skip obviously fake/test domains
  if (/example\.com|test\.|localhost|placeholder/i.test(baseUrl)) return { found: 0, tried: 0 };

  let totalFound = 0;
  let tried = 0;

  for (const path of CS_PATHS) {
    const pageUrl = baseUrl + path;
    const content = await scrapeUrl(pageUrl);
    tried++;
    if (!content) continue;

    const caseStudies = await extractCaseStudies(firm.name, pageUrl, content);
    if (caseStudies.length === 0) continue;

    for (const cs of caseStudies.slice(0, 5)) {
      await sql`
        INSERT INTO firm_case_studies (
          id, firm_id, organization_id, source_url, source_type,
          title, summary, status, auto_tags,
          ingested_at, last_ingested_at, created_at, updated_at
        ) VALUES (
          ${uid()}, ${firm.firm_id}, ${firm.org_id}, ${pageUrl}, 'url',
          ${cs.title.slice(0, 200)},
          ${cs.summary?.slice(0, 500) ?? null},
          'active',
          ${JSON.stringify({
            skills: cs.skills || [],
            industries: cs.industries || [],
            services: [],
            markets: [],
            languages: ["English"],
            clientName: cs.clientName || null,
          })},
          NOW(), NOW(), NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `;
      totalFound++;
    }
    // Stop after first successful path
    if (totalFound > 0) break;
  }

  return { found: totalFound, tried };
}

// Only real (non-test) firms without active case studies
const firms = await sql`
  SELECT sf.id as firm_id, sf.organization_id as org_id, sf.name, sf.website
  FROM service_firms sf
  WHERE sf.enrichment_status = 'enriched'
    AND sf.website IS NOT NULL
    AND sf.name NOT LIKE 'Test %'
    AND sf.website NOT LIKE '%example.com%'
    AND NOT EXISTS (
      SELECT 1 FROM firm_case_studies fcs
      WHERE fcs.firm_id = sf.id AND fcs.status = 'active'
    )
  ORDER BY sf.id
  LIMIT ${LIMIT}
`;

console.log(`\nDiscovering case studies for ${firms.length} real firms (${CONCURRENCY} concurrent)...\n`);

let processed = 0, firmsWith = 0, totalCases = 0;
const start = Date.now();

for (let i = 0; i < firms.length; i += CONCURRENCY) {
  const batch = firms.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(f => processFirm(f).catch(() => ({ found: 0, tried: 0 }))));

  for (const r of results) {
    processed++;
    if (r.found > 0) { firmsWith++; totalCases += r.found; }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  const eta = processed > 0 ? Math.round((firms.length - processed) * (Date.now() - start) / processed / 1000) : "?";
  process.stdout.write(`\r  [${processed}/${firms.length}] ${firmsWith} firms with cases, ${totalCases} total | ${elapsed}s elapsed, ~${eta}s left   `);
  await new Promise(r => setTimeout(r, 400));
}

const final = await sql`SELECT COUNT(*) as t, COUNT(DISTINCT firm_id) as f FROM firm_case_studies WHERE status='active'`;
console.log(`\n\nDone: ${firmsWith}/${processed} firms got case studies, ${totalCases} total`);
console.log(`firm_case_studies (active): ${final[0].t} rows, ${final[0].f} firms`);
