/**
 * Person Enrichment Orchestrator
 *
 * Provider chain: EnrichLayer (cheap, ~$0.02) → PDL (fallback, ~$0.28) → null
 *
 * EnrichLayer is tried first for cost savings. Falls back to PDL when:
 * - EnrichLayer returns 404 (not found)
 * - EnrichLayer returns 403 (no credits)
 * - EnrichLayer returns 429 (rate limited)
 * - ENRICHLAYER_API_KEY is not configured
 */

import type { PdlPerson } from "./pdl";
import { enrichPerson as pdlEnrichPerson } from "./pdl";
import {
  enrichLayerPerson,
  normalizeToEnrichedPerson,
  EnrichLayerNoCreditsError,
  EnrichLayerRateLimitError,
} from "./enrichlayer";

export interface PersonEnrichmentResult {
  person: PdlPerson | null;
  provider: "enrichlayer" | "pdl" | null;
  fallbackReason?: string;
}

/**
 * Enrich a person with automatic provider fallback.
 *
 * Chain: EnrichLayer → PDL → null
 */
export async function enrichPersonWithFallback(params: {
  name?: string;
  companyName?: string;
  companyWebsite?: string;
  linkedinUrl?: string;
  email?: string;
}): Promise<PersonEnrichmentResult> {
  // Try EnrichLayer first (if configured)
  if (process.env.ENRICHLAYER_API_KEY) {
    try {
      const raw = await enrichLayerPerson({
        linkedinUrl: params.linkedinUrl,
        name: params.name,
        company: params.companyName,
      });

      if (raw) {
        const person = normalizeToEnrichedPerson(raw);
        console.log(`[PersonEnrich] EnrichLayer hit: ${person.fullName}`);
        return { person, provider: "enrichlayer" };
      }

      // 404 — not found in EnrichLayer, try PDL
      console.log(`[PersonEnrich] EnrichLayer miss, falling back to PDL`);
    } catch (err) {
      if (err instanceof EnrichLayerNoCreditsError) {
        console.warn(`[PersonEnrich] EnrichLayer no credits, falling back to PDL`);
        return tryPdl(params, "enrichlayer_no_credits");
      }
      if (err instanceof EnrichLayerRateLimitError) {
        console.warn(`[PersonEnrich] EnrichLayer rate limited, falling back to PDL`);
        return tryPdl(params, "enrichlayer_rate_limited");
      }
      console.error(`[PersonEnrich] EnrichLayer error, falling back to PDL:`, err);
    }

    return tryPdl(params, "enrichlayer_not_found");
  }

  // EnrichLayer not configured — go straight to PDL
  return tryPdl(params, "enrichlayer_not_configured");
}

async function tryPdl(
  params: {
    name?: string;
    companyName?: string;
    companyWebsite?: string;
    linkedinUrl?: string;
    email?: string;
  },
  fallbackReason: string
): Promise<PersonEnrichmentResult> {
  try {
    const person = await pdlEnrichPerson(params);
    if (person) {
      console.log(`[PersonEnrich] PDL hit: ${person.fullName}`);
      return { person, provider: "pdl", fallbackReason };
    }
    return { person: null, provider: null, fallbackReason };
  } catch (err) {
    const msg = String(err);
    // PDL 402 = out of credits
    if (msg.includes("402")) {
      console.error(`[PersonEnrich] PDL credits exhausted (402)`);
      return { person: null, provider: null, fallbackReason: "pdl_no_credits" };
    }
    throw err;
  }
}
