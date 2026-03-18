/**
 * Per-page prompt generators for Ossy contextual awareness.
 *
 * Each function takes a PageContextSnapshot and returns a prompt block
 * that tells Ossy what's on screen and what to notice.
 *
 * The PAGE_MODE_CONFIG map defines per-page response behavior,
 * proactive navigation messages, and context builders.
 */

import type { PageContextSnapshot } from "@/hooks/use-ossy-context";
import type { PageMode } from "@/lib/cos-signal";

// ─── Response Mode Types ─────────────────────────────────

export type ResponseMode = "observe" | "guide" | "interview" | "silent";

export interface PageModeConfig {
  /** How Ossy should respond on this page */
  responseMode: ResponseMode;
  /** What Ossy says when user navigates here (null = stay silent) */
  proactiveOnNav: string | null;
  /** Instructions for reacting to in-page action signals */
  actionGuidance: string;
  /** Build dynamic context from page snapshot */
  contextBuilder: (ctx: PageContextSnapshot | null) => string;
}

// ─── Page Mode Configuration ─────────────────────────────

export const PAGE_MODE_CONFIG: Record<PageMode, PageModeConfig> = {
  dashboard: {
    responseMode: "guide",
    proactiveOnNav: "Welcome back. Take a look around — I'm here if you need anything.",
    actionGuidance: "Brief status updates. Suggest next action if profile is incomplete.",
    contextBuilder: (ctx) => ctx?.page === "dashboard" ? dashboardPrompt(ctx) : "",
  },
  discover: {
    responseMode: "guide",
    proactiveOnNav: "This is where you search the network. Tell me what kind of partner, expert, or case study you're looking for and I'll find matches.",
    actionGuidance: "React to profile views with 1-2 sentence commentary. Never narrate what the user clicked — tell them what they can't see.",
    contextBuilder: () => "", // Discover has its own deep prompt integration
  },
  "firm-overview": {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set by contextBuilder based on completeness
    actionGuidance: "Help fill gaps, acknowledge edits.",
    contextBuilder: (ctx) => ctx?.page === "overview" ? overviewPrompt(ctx) : "",
  },
  "firm-offering": {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set by contextBuilder
    actionGuidance: "Offer to help draft service descriptions.",
    contextBuilder: (ctx) => ctx?.page === "offering" ? offeringPrompt(ctx) : "",
  },
  "firm-experts": {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set by contextBuilder
    actionGuidance: "Prompt team discovery, explain enrichment.",
    contextBuilder: (ctx) => ctx?.page === "experts" ? expertsPrompt(ctx) : "",
  },
  "firm-experience": {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set by contextBuilder
    actionGuidance: "Encourage adding more case studies.",
    contextBuilder: (ctx) => ctx?.page === "experience" ? experiencePrompt(ctx) : "",
  },
  "firm-preferences": {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set by contextBuilder
    actionGuidance: "Help fill remaining preference fields.",
    contextBuilder: (ctx) => ctx?.page === "preferences" ? preferencesPrompt(ctx) : "",
  },
  "partner-matching": {
    responseMode: "interview",
    proactiveOnNav: null, // Handled by the partner-matching page's own event system
    actionGuidance: "React to intro requests with brief acknowledgment.",
    contextBuilder: (ctx) => ctx?.page === "partner-matching" ? partnerMatchingPrompt(ctx) : "",
  },
  partnerships: {
    responseMode: "guide",
    proactiveOnNav: null, // Conditionally set — depends on partnership count
    actionGuidance: "React to accept/decline actions. Congratulate on accepts, empathize on declines.",
    contextBuilder: () => "",
  },
  network: {
    responseMode: "silent",
    proactiveOnNav: null,
    actionGuidance: "Coming soon — stay quiet.",
    contextBuilder: () => "",
  },
  "settings-profile": {
    responseMode: "guide",
    proactiveOnNav: "This is where you manage your personal profile — name, email, avatar. Changes here affect how partners see you.",
    actionGuidance: "Orient to what's editable.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
  "settings-team": {
    responseMode: "guide",
    proactiveOnNav: "Manage who has access to your organization. You can invite team members or change roles.",
    actionGuidance: "Explain team management.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
  "settings-billing": {
    responseMode: "guide",
    proactiveOnNav: "Your current plan and usage. You can upgrade for more enrichment credits and advanced features.",
    actionGuidance: "Help understand plan limits.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
  "settings-notifications": {
    responseMode: "guide",
    proactiveOnNav: "Control which emails and alerts you receive — partnership requests, match notifications, weekly digests.",
    actionGuidance: "Explain notification types.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
  "settings-security": {
    responseMode: "guide",
    proactiveOnNav: "Manage your password and security settings. You can also see active sessions.",
    actionGuidance: "Brief security context.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
  "settings-network": {
    responseMode: "guide",
    proactiveOnNav: "Connect external accounts like LinkedIn and Gmail to expand your network intelligence.",
    actionGuidance: "Explain integration value.",
    contextBuilder: (ctx) => ctx?.page === "settings" ? settingsPrompt(ctx) : "",
  },
};

/**
 * Build the Response Style Rules block for the system prompt.
 */
export function buildResponseStyleBlock(pageMode: PageMode): string {
  const config = PAGE_MODE_CONFIG[pageMode];
  if (!config) return "";

  return `\n## Response Style
Current mode: ${config.responseMode}

Rules:
- "observe": Brief observation (1-2 sentences). Do NOT ask a follow-up question.
- "guide": Tip or suggestion (2-3 sentences). Ask a question ONLY if it would meaningfully change what you recommend.
- "interview": Ask one focused question per response. Bold the question.
- "silent": Do not proactively comment. Only respond to direct user messages.

IMPORTANT: Do not end every response with a question. Most of the time, a statement is better.
When responding to a [CONTEXT_SIGNAL], make a specific observation — never generic "want to know more?" follow-ups.\n`;
}

/**
 * Get the proactive nav message for a page mode, with dynamic
 * overrides based on page context snapshot.
 */
export function getProactiveNavMessage(
  pageMode: PageMode,
  ctx: PageContextSnapshot | null,
): string | null {
  const config = PAGE_MODE_CONFIG[pageMode];
  if (!config) return null;

  // Firm pages: always return a message. Use dynamic detail when context
  // has something specific to highlight, otherwise a brief orientation.
  if (pageMode === "firm-overview") {
    if (ctx?.page === "overview" && ctx.completeness < 80) {
      return `Your profile is ${ctx.completeness}% complete. ${ctx.completeness < 50 ? "Adding more details would help partners find you." : "Almost there — a few more fields would strengthen your matches."}`;
    }
    return "This is your firm overview — your public profile, categories, skills, and industries.";
  }

  if (pageMode === "firm-offering") {
    if (ctx?.page === "offering" && ctx.withoutDescription > 0) {
      return `${ctx.serviceCount} services, ${ctx.withoutDescription} need descriptions.`;
    }
    return "Your services and solutions — what you offer to clients and partners.";
  }

  if (pageMode === "firm-experts") {
    if (ctx?.page === "experts" && ctx.expertCount === 0) {
      return "No team members yet. Adding experts strengthens your matches — even 2-3 key profiles make a difference.";
    }
    return "Your team — the experts whose experience powers your matching.";
  }

  if (pageMode === "firm-experience") {
    if (ctx?.page === "experience" && ctx.caseStudyCount < 3) {
      return `${ctx.caseStudyCount} case studies. Case studies are your strongest matching signal — even 2-3 make a big difference.`;
    }
    return "Your case studies and project portfolio — proof of what you've delivered.";
  }

  if (pageMode === "firm-preferences") {
    if (ctx?.page === "preferences" && ctx.completeness < 100) {
      return `Partner preferences are ${ctx.completeness}% complete.`;
    }
    return "Your partner preferences — what you're looking for in a partner.";
  }

  return config.proactiveOnNav;
}

// ─── Legacy wrapper — keeps existing callers working ─────

/**
 * Generate a page-aware prompt block from the current page context.
 * Returns empty string if no context or nothing interesting to note.
 */
export function generatePageContextPrompt(ctx: PageContextSnapshot | null): string {
  if (!ctx) return "";

  switch (ctx.page) {
    case "overview":
      return overviewPrompt(ctx);
    case "offering":
      return offeringPrompt(ctx);
    case "experts":
      return expertsPrompt(ctx);
    case "experience":
      return experiencePrompt(ctx);
    case "preferences":
      return preferencesPrompt(ctx);
    case "dashboard":
      return dashboardPrompt(ctx);
    case "calls":
      return callsPrompt(ctx);
    case "settings":
      return settingsPrompt(ctx);
    case "partner-matching":
      return partnerMatchingPrompt(ctx);
    case "discover":
      return ""; // Discover has its own deep prompt integration
  }
}

// ─── Per-page prompt builders (unchanged) ────────────────

function overviewPrompt(ctx: Extract<PageContextSnapshot, { page: "overview" }>) {
  const lines: string[] = [
    `\n## Page State: Firm Overview`,
    `Profile completeness: ${ctx.completeness}% (${ctx.filledFields}/${ctx.totalFields} fields)`,
    `Enrichment status: ${ctx.enrichmentStatus}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.enrichmentStatus === "done") {
    lines.push(`- Enrichment just completed. If this is the first time, briefly acknowledge: "I've finished analyzing your company data. Take a look at the categories and skills — anything look off?"`);
  }
  if (ctx.completeness < 50) {
    const gap = ctx.totalFields - ctx.filledFields;
    lines.push(`- Profile is thin (${ctx.completeness}%). Mention: "Your profile is ${ctx.completeness}% complete. Adding more details would help partners find you."`);
    lines.push(`- ${gap} data points are still empty`);
  } else if (ctx.completeness === 100) {
    lines.push(`- Profile is fully complete! Acknowledge: "Your firm profile is fully filled out — that puts you ahead of most firms here."`);
  }
  if (ctx.enrichmentStatus === "loading") {
    lines.push(`- Enrichment is running. Don't interrupt — just acknowledge if asked.`);
  }

  return lines.join("\n");
}

function offeringPrompt(ctx: Extract<PageContextSnapshot, { page: "offering" }>) {
  const lines: string[] = [
    `\n## Page State: Offering (Services)`,
    `Services: ${ctx.serviceCount} visible, ${ctx.hiddenCount} hidden`,
    `With descriptions: ${ctx.withDescription}, without: ${ctx.withoutDescription}`,
    `Deep crawl running: ${ctx.deepCrawlRunning}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.serviceCount > 0 && ctx.withoutDescription > 0) {
    lines.push(`- ${ctx.withoutDescription} services lack descriptions. Suggest: "${ctx.withoutDescription} of your services don't have descriptions. Adding them helps me match you more precisely — want me to help draft one?"`);
  }
  if (ctx.serviceCount === 0 && !ctx.deepCrawlRunning) {
    lines.push(`- Empty state — no services found. Say: "I couldn't find distinct service pages on your site. What's your core offering? I can add services for you."`);
  }
  if (ctx.deepCrawlRunning) {
    lines.push(`- Deep crawl is running — acknowledge silently, don't interrupt.`);
  }
  if (ctx.hiddenCount > 0) {
    lines.push(`- ${ctx.hiddenCount} services are hidden — the user has already curated their list.`);
  }

  return lines.join("\n");
}

function expertsPrompt(ctx: Extract<PageContextSnapshot, { page: "experts" }>) {
  const lines: string[] = [
    `\n## Page State: Experts (Team)`,
    `Total experts: ${ctx.expertCount}`,
    `Enriched: ${ctx.enrichedCount}, Pending enrichment: ${ctx.pendingCount}`,
    `Enrichment credits remaining: ${ctx.creditsRemaining}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.expertCount === 0) {
    lines.push(`- No team members found. Say: "No team members found yet. Your experts' work history directly influences how well you match — even 2-3 key team profiles make a difference."`);
  }
  if (ctx.pendingCount > 0) {
    lines.push(`- ${ctx.pendingCount} experts awaiting enrichment. Mention this if asked about team data.`);
  }
  if (ctx.creditsRemaining === 0 && ctx.pendingCount > 0) {
    lines.push(`- Out of enrichment credits with pending experts. Mention upgrade options if asked.`);
  }

  return lines.join("\n");
}

function experiencePrompt(ctx: Extract<PageContextSnapshot, { page: "experience" }>) {
  const lines: string[] = [
    `\n## Page State: Experience (Case Studies)`,
    `Total: ${ctx.caseStudyCount} (Active: ${ctx.activeCount}, Pending: ${ctx.pendingCount}, Failed: ${ctx.failedCount})`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.caseStudyCount < 3) {
    lines.push(`- Low case study count. Say: "Case studies are the strongest matching signal. Even 2-3 detailed project examples dramatically improve your results."`);
  }
  if (ctx.failedCount > 0) {
    lines.push(`- ${ctx.failedCount} case studies failed. Say: "One case study couldn't be processed — the URL might be behind a login wall. You can add it manually with pasted text."`);
  }
  if (ctx.pendingCount > 0) {
    lines.push(`- ${ctx.pendingCount} case studies processing — acknowledge if asked.`);
  }

  return lines.join("\n");
}

function preferencesPrompt(ctx: Extract<PageContextSnapshot, { page: "preferences" }>) {
  const lines: string[] = [
    `\n## Page State: Partner Preferences`,
    `Completeness: ${ctx.completeness}%`,
    `Filled: ${ctx.filledFields.join(", ") || "none"}`,
    `Empty: ${ctx.emptyFields.join(", ") || "none"}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.emptyFields.length > 0) {
    lines.push(`- Missing fields: ${ctx.emptyFields.join(", ")}. Say: "You've filled ${ctx.filledFields.length} of ${ctx.filledFields.length + ctx.emptyFields.length} preference fields. ${ctx.emptyFields[0]} would narrow your matches significantly."`);
  }
  if (ctx.emptyFields.includes("dealBreaker") && ctx.filledFields.length >= 3) {
    lines.push(`- No deal-breaker set despite other preferences filled. Suggest: "You listed partner types but no deal-breakers — that usually means matches will be too broad. What would make you walk away?"`);
  }
  if (ctx.completeness === 100) {
    lines.push(`- All preferences filled. Acknowledge positively and suggest Discover.`);
  }

  return lines.join("\n");
}

function dashboardPrompt(ctx: Extract<PageContextSnapshot, { page: "dashboard" }>) {
  const lines: string[] = [
    `\n## Page State: Dashboard`,
    `Enrichment stage: ${ctx.enrichmentStage}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.enrichmentStage === "complete") {
    lines.push(`- Dashboard is fully loaded. Guide them: "Your dashboard shows everything I know about your firm. Head to Discover when you're ready to find partners."`);
  }
  if (ctx.enrichmentStage !== "complete" && ctx.enrichmentStage !== "idle") {
    lines.push(`- Enrichment in progress (${ctx.enrichmentStage}). Acknowledge stages as they complete.`);
  }

  return lines.join("\n");
}

function callsPrompt(ctx: Extract<PageContextSnapshot, { page: "calls" }>) {
  const lines: string[] = [
    `\n## Page State: Calls`,
    `Total calls: ${ctx.callCount}, Pending analysis: ${ctx.pendingAnalysis}`,
  ];

  lines.push(`\n### What to notice:`);
  if (ctx.callCount === 0) {
    lines.push(`- No calls recorded yet. Say: "Add me to your calendar events and I'll join automatically to take notes and spot partnership opportunities."`);
  }
  if (ctx.pendingAnalysis > 0) {
    lines.push(`- ${ctx.pendingAnalysis} calls pending analysis. Mention this if asked.`);
  }

  return lines.join("\n");
}

function partnerMatchingPrompt(ctx: Extract<PageContextSnapshot, { page: "partner-matching" }>) {
  const lines: string[] = [
    `\n## Page State: Partner Matching`,
    `Preferences complete: ${ctx.prefsComplete}`,
    `Missing fields: ${ctx.missingFields.join(", ") || "none"}`,
    `Matches found: ${ctx.matchCount}`,
  ];

  lines.push(`\n### What to notice:`);
  if (!ctx.prefsComplete && ctx.missingFields.length > 0) {
    lines.push(`- The user's V2 partner preferences are INCOMPLETE. They are missing: ${ctx.missingFields.join(", ")}.`);
    lines.push(`- The partner matching page cannot show results until these are filled.`);
    lines.push(`- START the V2 preference interview NOW. Ask the 5 questions ONE AT A TIME, conversationally, exactly like onboarding.`);
    lines.push(`- Use the update_profile tool to save each answer. The page will update in real-time as preferences are saved.`);
    lines.push(`- Once all 5 are complete, the page will automatically load partner matches.`);
    lines.push(`- Be proactive: greet the user and explain that you need to learn about their partner preferences before showing matches. Then ask the FIRST missing field question.`);
  } else if (ctx.prefsComplete && ctx.matchCount > 0) {
    lines.push(`- Preferences are complete and ${ctx.matchCount} matches are showing. Help the user explore them.`);
    lines.push(`- If they ask about a specific match, provide strategic advice.`);
    lines.push(`- If they want to request an introduction, encourage them to click the button.`);
  } else if (ctx.prefsComplete && ctx.matchCount === 0) {
    lines.push(`- Preferences are complete but no matches found. Suggest broadening preferences or checking back later.`);
  }

  return lines.join("\n");
}

function settingsPrompt(ctx: Extract<PageContextSnapshot, { page: "settings" }>) {
  const lines: string[] = [
    `\n## Page State: Settings (${ctx.subpage})`,
  ];

  if (ctx.subpage === "memory") {
    lines.push(`If asked about this page: "This is everything I remember about our conversations. Deleting entries means I'll lose that context."`);
  } else {
    lines.push(`Minimal proactive behavior on settings pages. Help if asked but don't proactively comment.`);
  }

  return lines.join("\n");
}
