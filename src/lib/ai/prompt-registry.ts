/**
 * Centralized AI prompt registry.
 *
 * Every major AI prompt in the platform is registered here with metadata
 * and a default value. Admin can override any prompt via the platformSettings
 * table (key pattern: "prompt:<promptKey>").
 *
 * Usage:
 *   const instructions = await getPrompt("opportunity_extraction");
 */

import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { eq, like } from "drizzle-orm";
import { DEFAULT_EXTRACTION_INSTRUCTIONS } from "@/lib/ai/opportunity-extractor";

// ─── Prompt Metadata ─────────────────────────────────────

export interface PromptEntry {
  key: string;
  title: string;
  description: string;
  model: string;
  sourceFile: string;
  /** Returns the hardcoded default prompt text */
  getDefault: () => string;
}

// ─── Default Prompt Texts ────────────────────────────────
// These are the instruction portions of each prompt (no dynamic context).
// Some are imported from their source files; others are defined inline here
// to avoid circular imports.

const COACHING_ANALYZER_DEFAULT = `Analyze the following dimensions:

1. **Talking Time**: Estimate % of time the caller vs. the other party spoke. Ideal is 40-60% caller.
2. **Value Proposition**: Did they clearly explain what they do and why it matters? Rate 0-1.
3. **Question Quality**: Count discovery questions (open-ended, probing) vs closed questions. More discovery = better.
4. **Topics Covered**: List the main topics discussed.
5. **Next Steps**: Were clear next steps established? What were they?
6. **Action Items**: Extract specific commitments ("I'll send you...", "We need to...").
7. **Partner Recommendations**: Based on topics discussed, what types of partners could help?

Be specific and actionable in feedback.`;

const FIRM_CLASSIFIER_DEFAULT = `You are a firm classification AI for Collective OS, a partnership platform for professional services firms.

Analyze the following firm data and classify it precisely.

### Firm Categories
Select ALL that apply from the provided 30 categories. Most firms fit 1-3 categories.

### Skills (L2 Level)
Select the most relevant L2 skills from the provided taxonomy. Pick 5-15 that best describe the firm's capabilities.

### Industries
List the specific industries/verticals this firm serves (e.g., "Healthcare", "Financial Services", "E-commerce", "SaaS", "Manufacturing"). Use standard industry names.

### Markets
Select countries and regions where this firm operates or serves clients from the provided list.

### Languages
Select business languages this firm works in from the provided list.

### Firm Nature
Determine if this is primarily:
- "service_provider" \u2014 a consulting firm, agency, freelance network, or professional services company that does work FOR clients
- "product_company" \u2014 a SaaS/tech company that sells a software product or platform
- "brand_or_retailer" \u2014 a consumer brand, retailer, manufacturer, or product company
- "hybrid" \u2014 offers both professional services AND has a significant product/brand component
- "unclear" \u2014 not enough evidence to determine

Key signals for service_provider: "our work", "our clients", case studies, portfolio of client projects, "we help", "our team", agency/consultancy/studio language, services pages, team bios with titles like strategist/designer/developer/consultant, "contact us" for a project, "let\u2019s work together", media agency, creative agency, digital agency, marketing agency, PR firm, design studio
Key signals for brand_or_retailer: "Shop now", "Add to cart", product catalog with prices, e-commerce checkout, manufacturing facility, retail store locations, consumer product packaging, "Buy now"
Key signals for product_company: "Sign up", "Start free trial", feature comparison pages, API documentation, per-seat or per-month pricing for a software product, "Log in" to a dashboard

IMPORTANT: If the company name contains "agency", "consulting", "consultancy", "studio", "partners", "advisors", "group", or "collective", it is almost certainly a service_provider unless there is overwhelming evidence otherwise. When in doubt between service_provider and brand_or_retailer, default to service_provider.

Be precise. Only tag what the evidence supports. Don\u2019t guess.`;

const CASE_STUDY_INGESTOR_DEFAULT = `Extract structured case study data from this content.

A case study MUST describe specific work done for a specific client. It should have:
- A clear CLIENT NAME (a real company that hired this firm)
- A description of what was done (challenge, solution, or approach)
- Some evidence of outcomes or results

If ANY of these are missing, set isCaseStudy to false:
- No identifiable client name \u2192 NOT a case study
- Just a few sentences mentioning a brand \u2192 NOT a case study (too thin)
- A generic service description or blog post \u2192 NOT a case study
- A team member bio or profile \u2192 NOT a case study
- A marketing landing page \u2192 NOT a case study

Extract as much detail as the content provides. Be precise about metrics and outcomes.`;

const MEMORY_EXTRACTOR_DEFAULT = `You are a memory extraction system for Ossy, an AI consultant.
Analyze this conversation and extract KEY FACTS that Ossy should remember for future sessions.

ONLY extract information that would be useful in FUTURE conversations.
Do NOT extract trivial, obvious, or temporary information.

Extract memories into these themes:
- firm_capabilities: What the user\u2019s firm does, their services, strengths, specialties
- partner_preferences: What kind of partners they want or don\u2019t want, deal-breakers
- client_profile: Their ideal clients, industries they serve, typical deal sizes
- personal_style: How they like to communicate, how much detail they want
- opportunities: Business opportunities mentioned, pipeline items, needs
- feedback: Feedback on matches, suggestions, or platform features
- action_items: Commitments made, things to follow up on
- relationships: Context about specific partners, prospects, or contacts

Be concise. Each memory should be a single clear statement.
Only include memories with genuine confidence (>0.6).
Return an empty array if nothing worth remembering was discussed.`;

const EMAIL_INTENT_CLASSIFIER_DEFAULT = `You are an AI email classifier for Collective OS, a partnership platform for professional services firms.

Classify inbound emails sent to or CC\u2019d to ossy@joincollectiveos.com.

Intent definitions:
- "opportunity": Email mentions a client need, project, or business opportunity that could be shared with partners
- "follow_up": Email requires a follow-up action or response
- "context": Email provides useful context about a firm, client, or relationship (no action needed)
- "question": Email asks a question that Ossy should answer
- "intro_response": Email is a reply to a three-way intro Ossy sent
- "unrelated": Spam, marketing, or irrelevant content

Extract entities carefully \u2014 only include what\u2019s explicitly mentioned.
For opportunity signals, only populate if the email genuinely describes a business opportunity.`;

const INTRO_GENERATOR_DEFAULT = `You are Ossy, the AI business consultant at Collective OS \u2014 a platform that helps professional services firms grow through partnerships.

You have identified a high-potential partnership match between two firms and you are writing a personalized three-way introduction email to both of them.

Requirements:
- Open by addressing BOTH contacts by their FIRST NAME
- In 2-3 sentences, describe what Firm A does and what makes them great \u2014 make it specific, not generic
- In 2-3 sentences, describe what Firm B does and what makes them great \u2014 make it specific, not generic
- Clearly explain the SPECIFIC reason these two firms should work together \u2014 reference actual services/skills, not vague platitudes
- Mention 1-2 concrete ways they could collaborate (referrals, co-delivery on a project type, etc.)
- End with a clear CTA: invite them to book a 15-min intro call
- Tone: warm, human, confident \u2014 like a trusted advisor making a personal intro, NOT a sales pitch
- Length: 180-220 words maximum
- Sign off as: Ossy, Collective OS

Also provide 3 sharp, specific talking points for their intro call \u2014 things they should actually discuss, not generic "get to know each other" fluff.`;

const QUERY_PARSER_DEFAULT = `Parse this search query into structured filters for a professional services partner search.

Extract structured filters from the query. Map user intent to our taxonomy.
- For skills: map to the closest L2 skill names from the provided list
- For categories: map to the closest firm categories from the provided list
- For markets: map to specific countries or regions from the provided list
- For industries: use standard industry names
- For services: extract 1-3 word service phrases (e.g. "brand strategy", "SEO", "content marketing"). These are partial-matched so keep them short and specific.
- For size: use "micro" (<10), "small" (10-50), "medium" (50-200), "large" (200+)
- For entityType: detect if user is looking for "firm", "expert", "case_study", or null (all)
- For searchIntent: classify as "partner" (default), "expertise" (find people), or "evidence" (find case studies/proof)

Only extract what the query explicitly or strongly implies. Don\u2019t over-extract.`;

const DEEP_RANKER_DEFAULT = `You are ranking potential partnership matches for a professional services firm.

RANKING PRIORITIES (most important first):
1. PROVEN WORK: Firms with case studies rank significantly higher than those without.
2. CASE STUDY PROOF: Skills demonstrated in actual projects are much stronger than self-described skills.
3. COMPLEMENTARY FIT: Focus on entities that fill gaps in what the searcher needs.
4. EVIDENCE QUALITY: Weight case study evidence > specialist profiles > listed skills > self-described categories.
5. TEAM DEPTH: More experts with a skill = deeper capability.
6. CLIENT PORTFOLIO: Client industries reveal implicit expertise.
7. MARKET/LANGUAGE FIT: Weight market presence and language capabilities for geographic queries.
8. SYMBIOTIC PARTNERSHIPS: Known symbiotic category pairs are a natural fit signal.

INSTRUCTIONS:
1. ALWAYS return the requested number of candidates \u2014 never return an empty list
2. For each, provide a 1-2 sentence explanation of WHY this could be relevant
3. Score bidirectional fit: theyWantUs (0-1) and weWantThem (0-1)
4. Give each a final llmScore (0-1) \u2014 use lower scores (0.2-0.4) for partial matches rather than excluding
5. For firms with "No case studies (unproven)" \u2014 lower confidence but don\u2019t exclude

IMPORTANT: Always return results. A partial match with a low score is better than no result.`;

const OSSY_SYSTEM_DEFAULT = `[The Ossy system prompt is very large (~660 lines) and is best edited in the source file directly: src/lib/ai/ossy-prompt.ts]

This prompt defines Ossy's personality, voice principles, onboarding interview flow, tool usage guidelines, and page-specific response modes. Due to its size and complexity (it includes dynamic context injection), it is read-only in this interface.`;

// ─── Registry ────────────────────────────────────────────

export const PROMPT_REGISTRY: PromptEntry[] = [
  {
    key: "opportunity_extraction",
    title: "Opportunity Extraction",
    description: "Extracts business opportunities from call transcripts and emails. Identifies direct and latent signals, priorities, and resolution approaches.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/ai/opportunity-extractor.ts",
    getDefault: () => DEFAULT_EXTRACTION_INSTRUCTIONS,
  },
  {
    key: "coaching_analyzer",
    title: "Call Coaching Analysis",
    description: "Analyzes call transcripts for coaching insights: talking time, value proposition clarity, question quality, topics, next steps, and action items.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/ai/coaching-analyzer.ts",
    getDefault: () => COACHING_ANALYZER_DEFAULT,
  },
  {
    key: "firm_classifier",
    title: "Firm Classification",
    description: "Classifies firms against the COS taxonomy (30 categories, L2 skills, industries, markets). Determines firm nature (service provider vs product vs brand).",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/enrichment/ai-classifier.ts",
    getDefault: () => FIRM_CLASSIFIER_DEFAULT,
  },
  {
    key: "case_study_ingestor",
    title: "Case Study Extraction",
    description: "Extracts structured case study data from web pages/PDFs. Validates that content is a real case study with client name, challenge/solution, and outcomes.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/enrichment/case-study-ingestor.ts",
    getDefault: () => CASE_STUDY_INGESTOR_DEFAULT,
  },
  {
    key: "memory_extractor",
    title: "Memory Extraction",
    description: "Extracts persistent memories from conversations across 8 themes (firm capabilities, partner preferences, client profile, etc.) for future session context.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/ai/memory-extractor.ts",
    getDefault: () => MEMORY_EXTRACTOR_DEFAULT,
  },
  {
    key: "email_intent_classifier",
    title: "Email Intent Classification",
    description: "Classifies inbound emails by intent (opportunity, follow-up, context, question, intro response, unrelated) and extracts structured entities.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/ai/email-intent-classifier.ts",
    getDefault: () => EMAIL_INTENT_CLASSIFIER_DEFAULT,
  },
  {
    key: "intro_generator",
    title: "Partnership Intro Email",
    description: "Generates warm, personalized three-way introduction emails between two matched firms with specific talking points and CTAs.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/email/intro-generator.ts",
    getDefault: () => INTRO_GENERATOR_DEFAULT,
  },
  {
    key: "query_parser",
    title: "Search Query Parser",
    description: "Converts natural language search queries into structured filters (skills, categories, industries, markets, entity type, search intent).",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/matching/query-parser.ts",
    getDefault: () => QUERY_PARSER_DEFAULT,
  },
  {
    key: "deep_ranker",
    title: "Deep Ranking (Layer 3)",
    description: "LLM-powered ranking of ~50 candidates by relevance. Prioritizes proven work, complementary fit, team depth, and bidirectional partnership value.",
    model: "Gemini 2.0 Flash",
    sourceFile: "src/lib/matching/deep-ranker.ts",
    getDefault: () => DEEP_RANKER_DEFAULT,
  },
  {
    key: "ossy_system",
    title: "Ossy System Prompt",
    description: "Master system prompt defining Ossy\u2019s personality, voice principles, onboarding flow, tool usage, and page-specific response modes. Read-only due to size/complexity.",
    model: "Claude Sonnet 4",
    sourceFile: "src/lib/ai/ossy-prompt.ts",
    getDefault: () => OSSY_SYSTEM_DEFAULT,
  },
];

// ─── DB Lookup ───────────────────────────────────────────

const DB_KEY_PREFIX = "prompt:";

/** Legacy key mapping for backward compat */
const LEGACY_KEYS: Record<string, string> = {
  opportunity_extraction: "opportunity_extraction_prompt",
};

/**
 * Get prompt text for a given key.
 * Checks platformSettings DB first (key: "prompt:<key>"), falls back to default.
 */
export async function getPrompt(key: string): Promise<string> {
  const entry = PROMPT_REGISTRY.find((p) => p.key === key);
  if (!entry) {
    console.warn(`[PromptRegistry] Unknown prompt key: ${key}`);
    return "";
  }

  try {
    // Check new key format first
    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, `${DB_KEY_PREFIX}${key}`))
      .limit(1);

    if (row?.value) return row.value;

    // Check legacy key
    const legacyKey = LEGACY_KEYS[key];
    if (legacyKey) {
      const [legacyRow] = await db
        .select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.key, legacyKey))
        .limit(1);
      if (legacyRow?.value) return legacyRow.value;
    }
  } catch (err) {
    console.warn(`[PromptRegistry] DB lookup failed for ${key}:`, err);
  }

  return entry.getDefault();
}

/**
 * Get all prompts with their current text and override status.
 * Used by the admin Key Prompts page.
 */
export async function getAllPrompts(): Promise<
  Array<PromptEntry & { currentText: string; isCustom: boolean }>
> {
  // Batch-load all overrides from DB
  const overrides: Record<string, string> = {};
  try {
    const rows = await db
      .select({ key: platformSettings.key, value: platformSettings.value })
      .from(platformSettings)
      .where(like(platformSettings.key, `${DB_KEY_PREFIX}%`));

    for (const row of rows) {
      const promptKey = row.key.replace(DB_KEY_PREFIX, "");
      overrides[promptKey] = row.value;
    }

    // Also check legacy keys
    for (const [newKey, legacyKey] of Object.entries(LEGACY_KEYS)) {
      if (!overrides[newKey]) {
        const [legacyRow] = await db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.key, legacyKey))
          .limit(1);
        if (legacyRow?.value) overrides[newKey] = legacyRow.value;
      }
    }
  } catch (err) {
    console.warn("[PromptRegistry] Failed to load overrides:", err);
  }

  return PROMPT_REGISTRY.map((entry) => ({
    ...entry,
    currentText: overrides[entry.key] ?? entry.getDefault(),
    isCustom: !!overrides[entry.key],
  }));
}

/**
 * Save a custom prompt override to the DB.
 * Pass null/empty to delete the override (revert to default).
 */
export async function savePrompt(
  key: string,
  text: string | null,
  userId: string
): Promise<void> {
  const dbKey = `${DB_KEY_PREFIX}${key}`;
  const now = new Date();

  if (!text || text.trim() === "") {
    // Delete override
    await db.delete(platformSettings).where(eq(platformSettings.key, dbKey));
    // Also delete legacy key if applicable
    const legacyKey = LEGACY_KEYS[key];
    if (legacyKey) {
      await db.delete(platformSettings).where(eq(platformSettings.key, legacyKey));
    }
    return;
  }

  // Upsert override
  const existing = await db
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .where(eq(platformSettings.key, dbKey))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(platformSettings)
      .set({
        value: text,
        metadata: { updatedBy: userId, version: now.toISOString() },
        updatedAt: now,
      })
      .where(eq(platformSettings.key, dbKey));
  } else {
    await db.insert(platformSettings).values({
      id: `ps_prompt_${key}`,
      key: dbKey,
      value: text,
      metadata: { updatedBy: userId, version: now.toISOString() },
      createdAt: now,
      updatedAt: now,
    });
  }
}
