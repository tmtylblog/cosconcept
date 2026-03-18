/**
 * Per-page prompt generators for Ossy contextual awareness.
 *
 * Each function takes a PageContextSnapshot and returns a prompt block
 * that tells Ossy what's on screen and what to notice.
 */

import type { PageContextSnapshot } from "@/hooks/use-ossy-context";

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
