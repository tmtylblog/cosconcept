/**
 * Phase 2: Targeted Unified Extraction
 *
 * A single LLM call per sub-page that extracts ALL content types present:
 * offerings, evidence of work, client signals, team members.
 *
 * No page-type gating — a page can contain services AND case studies
 * AND client names AND team members simultaneously.
 *
 * The prompt includes firm context from Phase 1 so the LLM knows
 * what terminology this firm uses.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";
import type { FirmIntelligence } from "./firm-intelligence";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─── Schema ─────────────────────────────────────────────────

const UnifiedPageExtractionSchema = z.object({
  offerings: z.array(
    z.object({
      name: z.string().describe("Exact name the firm uses for this offering"),
      description: z.string().describe("2-3 substantive sentences describing what this delivers and who it's for"),
      offeringType: z.enum(["service", "solution"]).describe("'service' = broad category (e.g. Brand, Marketing), 'solution' = specific named offering (e.g. Market Readiness Scan, Performance Audit)"),
      solutions: z.array(z.string()).describe("Specific named solutions, products, or sub-offerings listed under this"),
      skills: z.array(z.string()).describe("Specific skills, tools, or technologies associated with this offering"),
      industries: z.array(z.string()).describe("Industries or verticals this offering targets"),
    })
  ),
  evidenceOfWork: z.array(
    z.object({
      title: z.string(),
      clientName: z.string().optional(),
      challenge: z.string().optional(),
      solution: z.string().optional(),
      outcomes: z.array(z.string()),
      servicesUsed: z.array(z.string()),
      skills: z.array(z.string()),
      industries: z.array(z.string()),
    })
  ),
  clientSignals: z.array(
    z.object({
      name: z.string(),
      context: z.enum([
        "case_study",
        "testimonial",
        "logo_section",
        "client_list",
        "body_mention",
      ]),
    })
  ),
  teamMembers: z.array(
    z.object({
      name: z.string(),
      role: z.string().optional(),
      linkedinUrl: z.string().optional(),
      bio: z.string().optional(),
    })
  ),
  /** URLs on this page that look like individual case study / project pages */
  caseStudyLinks: z.array(z.string()),
});

export type UnifiedPageExtraction = z.infer<typeof UnifiedPageExtractionSchema>;

// ─── Main Function ──────────────────────────────────────────

export async function extractPageUnified(
  content: string,
  url: string,
  firmContext: FirmIntelligence
): Promise<UnifiedPageExtraction> {
  if (!content || content.length < 100) {
    return emptyExtraction();
  }

  try {
    const result = await generateObject({
      model: openrouter.chat("google/gemini-2.0-flash-001"),
      prompt: `You are extracting structured data from a professional services firm's web page.

FIRM CONTEXT:
- Name: This is a ${firmContext.understanding.serviceModel} firm
- Summary: ${firmContext.understanding.summary}
- They call their services "${firmContext.understanding.offeringTerminology}"
- They call their work evidence "${firmContext.understanding.evidenceTerminology}"

PAGE URL: ${url}

PAGE CONTENT:
${content.slice(0, 8000)}

Extract ALL of the following that are present on this page. A single page often contains multiple types of content — extract everything you find.

## 1. OFFERINGS
Services, practice areas, solutions, capabilities, programs, engagement models, workshops, audits, or any other packaged offering this firm provides.

IMPORTANT RULES:
- Use the EXACT name the firm uses. If they call it "Market Readiness Scan", use that — don't rename it.
- Description MUST be 2-3 substantive sentences. Explain what this delivers, how it works, and who it's for. Use the firm's own language. Never leave blank or write just a few words.
- Classify each as "service" (broad category like Brand, Marketing, Technology) or "solution" (specific named offering like Market Readiness Scan, Performance Audit, Growth Accelerator).
- Under "solutions": list any specific named sub-offerings, workshops, frameworks, or packaged products mentioned.
- Do NOT create duplicate entries. If "Brand" and "Brand Strategy" refer to the same offering, pick the most specific name.
- Do NOT extract navigation labels or vague section headers as separate offerings.
- If you find associated skills (tools, technologies, methodologies) or target industries, include them.

## 2. EVIDENCE OF WORK
Case studies, project descriptions, success stories, client results, portfolio items — anything showing work the firm has done. For each, extract:
- Title or project name
- Client name (the company that HIRED this firm — not the firm itself)
- Challenge/problem addressed (if described)
- Solution/approach (if described)
- Outcomes/results (metrics, achievements)
- Services or capabilities demonstrated
- Skills/tools/technologies mentioned
- Industries/verticals involved

## 3. CLIENT SIGNALS
Company names that appear to be CLIENTS of this firm. These might appear in:
- "Trusted by" or "Our clients" sections
- Case study or project descriptions
- Testimonial attributions ("— Name, Title at CompanyName")
- Logo sections
- Body text mentions of work done for specific companies
For each, note the context where you found them.
Do NOT include: the firm's own name, tool/platform names, generic industry terms, or partner/vendor names.

## 4. TEAM MEMBERS
People who work at this firm — names, titles/roles, LinkedIn URLs if visible, brief bio.

## 5. CASE STUDY LINKS
Any URLs on this page that appear to link to individual case study or project detail pages.
Look for links within portfolio sections, "read more" links on project cards, etc.
EXCLUDE from case study links:
- Blog post URLs (containing /blog/, /news/, /insights/, /articles/)
- Team member profile URLs (containing /team/, /people/, /our-collective/, or that look like a single person's name)
- Service/offering detail pages (containing /services/, /practices/, /capabilities/, /approach/)
- Contact, about, careers, legal pages`,
      schema: UnifiedPageExtractionSchema,
      maxOutputTokens: 2048,
    });

    return result.object;
  } catch (err) {
    console.warn(`[TargetedExtractor] Extraction failed for ${url}:`, err);
    return emptyExtraction();
  }
}

function emptyExtraction(): UnifiedPageExtraction {
  return {
    offerings: [],
    evidenceOfWork: [],
    clientSignals: [],
    teamMembers: [],
    caseStudyLinks: [],
  };
}
