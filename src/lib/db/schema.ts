import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  real,
  pgEnum,
  customType,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// pgvector custom type — stores 1024-dim float arrays as PostgreSQL vector (Jina v3 max)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(",").map(Number);
  },
});

// ─── Enums ───────────────────────────────────────────────

export const sizeBandEnum = pgEnum("size_band", [
  "individual",
  "micro_1_10",
  "small_11_50",
  "emerging_51_200",
  "mid_201_500",
  "upper_mid_501_1000",
  "large_1001_5000",
  "major_5001_10000",
  "global_10000_plus",
]);

export const firmTypeEnum = pgEnum("firm_type", [
  "fractional_interim",
  "staff_augmentation",
  "embedded_teams",
  "boutique_agency",
  "project_consulting",
  "managed_service_provider",
  "advisory",
  "global_consulting",
  "freelancer_network",
  "agency_collective",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "pro",
  "enterprise",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
]);

// ─── Better Auth tables ──────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Profile fields
  jobTitle: text("job_title"),
  phone: text("phone"),       // E.164 format e.g. +14155552671 (for future WhatsApp)
  linkedinUrl: text("linkedin_url"),
  // Admin plugin fields
  role: text("role").default("user"), // user | admin | superadmin
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  // Admin plugin: impersonation tracking
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Better Auth organization plugin tables ──────────────

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull().default("member"),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Subscriptions & Billing ────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: subscriptionPlanEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  giftExpiresAt: timestamp("gift_expires_at"),
  giftReturnPlan: subscriptionPlanEnum("gift_return_plan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptionEvents = pgTable("subscription_events", {
  id: text("id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  data: jsonb("data"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── COS domain tables ──────────────────────────────────

export const serviceFirms = pgTable("service_firms", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website"),
  description: text("description"),
  foundedYear: integer("founded_year"),
  sizeBand: sizeBandEnum("size_band"),
  firmType: firmTypeEnum("firm_type"),
  isPlatformMember: boolean("is_platform_member").notNull().default(false),
  profileCompleteness: real("profile_completeness").default(0),
  partnershipReadinessScore: real("partnership_readiness_score"),
  responseVelocity: real("response_velocity"),
  // Enrichment data — stores the full enrichment response for hydration
  enrichmentData: jsonb("enrichment_data"),
  enrichmentStatus: text("enrichment_status").default("pending"), // pending | enriched | verified
  classificationConfidence: real("classification_confidence"),
  // Entity type: service_firm (default), potential_client (brand/retailer wanting services)
  entityType: text("entity_type").default("service_firm"),
  // Waitlist tracking for potential clients (brands)
  registeredInterestEmail: text("registered_interest_email"),
  registeredInterestAt: timestamp("registered_interest_at"),
  // Track A: canonical Company node link
  graphNodeId: text("graph_node_id"), // Neo4j Company node ID
  isCosCustomer: boolean("is_cos_customer").default(false),
  cosCustomerSince: timestamp("cos_customer_since"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Enrichment Cache (domain-keyed, no auth required) ──────
// Stores enrichment results keyed by domain so any user (guest or auth)
// enriching the same domain gets instant results without re-calling paid APIs.
export const enrichmentCache = pgTable("enrichment_cache", {
  id: text("id").primaryKey(), // domain as id (e.g. "chameleoncollective.com")
  domain: text("domain").notNull().unique(),
  firmName: text("firm_name"),
  enrichmentData: jsonb("enrichment_data").notNull(),
  // Guest onboarding preferences (persisted per-domain so they survive tab close)
  guestPreferences: jsonb("guest_preferences").$type<Record<string, string | string[]>>(),
  // Track which stages were completed so partial results can be gap-filled
  hasPdl: boolean("has_pdl").notNull().default(false),
  hasScrape: boolean("has_scrape").notNull().default(false),
  hasClassify: boolean("has_classify").notNull().default(false),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partnerPreferences = pgTable("partner_preferences", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  // Legacy taxonomy arrays — deprecated in Track A; data lives in Neo4j PREFERS edges.
  // Kept for backward compat until migrate-partnership-prefs-to-edges confirms full coverage.
  preferredFirmTypes: jsonb("preferred_firm_types").$type<string[]>(),
  preferredSizeBands: jsonb("preferred_size_bands").$type<string[]>(),
  preferredIndustries: jsonb("preferred_industries").$type<string[]>(),
  preferredMarkets: jsonb("preferred_markets").$type<string[]>(),
  partnershipModels: jsonb("partnership_models").$type<string[]>(),
  dealBreakers: jsonb("deal_breakers").$type<string[]>(),
  growthGoals: text("growth_goals"),
  rawOnboardingData: jsonb("raw_onboarding_data"),
  // Track A: rate range for deal sizing preferences
  rateStart: integer("rate_start"), // min hourly/daily rate preference (USD)
  rateEnd: integer("rate_end"), // max hourly/daily rate preference (USD)
  projectSizeRanges: jsonb("project_size_ranges").$type<string[]>(), // e.g. ["10k-50k", "50k-250k"]
  // Track A: tracks when Neo4j PREFERS/AVOIDS edges were last written from this data
  preferencesSyncedAt: timestamp("preferences_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const abstractionProfiles = pgTable("abstraction_profiles", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // firm | expert | case_study
  entityId: text("entity_id").notNull(),
  hiddenNarrative: text("hidden_narrative"),
  topServices: jsonb("top_services").$type<string[]>(),
  topSkills: jsonb("top_skills").$type<string[]>(),
  topIndustries: jsonb("top_industries").$type<string[]>(),
  typicalClientProfile: text("typical_client_profile"),
  partnershipReadiness: jsonb("partnership_readiness").$type<{
    openToPartnerships: boolean;
    preferredPartnerTypes: string[];
    partnershipGoals: string[];
  }>(),
  confidenceScores: jsonb("confidence_scores"),
  evidenceSources: jsonb("evidence_sources"),
  embedding: vector("embedding"),
  lastEnrichedAt: timestamp("last_enriched_at"),
  enrichmentVersion: integer("enrichment_version").default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Solution Partners (tech platforms in the knowledge graph) ───

export const solutionPartnerCategoryEnum = pgEnum("solution_partner_category", [
  "crm",
  "marketing_automation",
  "ecommerce",
  "analytics",
  "project_management",
  "developer_tools",
  "cloud_infrastructure",
  "communication",
  "design",
  "payments",
  "customer_support",
  "data_integration",
  "other",
]);

export const solutionPartners = pgTable("solution_partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  category: solutionPartnerCategoryEnum("category"),
  description: text("description"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  graphNodeId: text("graph_node_id"),
  // Track A: link to canonical Company node
  canonicalCompanyId: text("canonical_company_id"),
  isVerified: boolean("is_verified").notNull().default(false),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Chat tables ────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  title: text("title"),
  mode: text("mode").notNull().default("general"), // general | onboarding
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── AI usage tracking ──────────────────────────────────

export const aiUsageLog = pgTable("ai_usage_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  feature: text("feature").notNull(), // enrichment | matching | chat | voice | classification
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: real("cost_usd"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Enrichment Audit Trail ─────────────────────────────

export const enrichmentAuditLog = pgTable("enrichment_audit_log", {
  id: text("id").primaryKey(),
  firmId: text("firm_id").references(() => serviceFirms.id, {
    onDelete: "set null",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  phase: text("phase").notNull(), // pdl | jina | classifier | linkedin | case_study | onboarding | memory | deep_crawl
  source: text("source").notNull(), // URL, API name, etc.
  rawInput: text("raw_input"), // What was sent to the enrichment source
  rawOutput: text("raw_output"), // What came back (full response, truncated if huge)
  extractedData: jsonb("extracted_data"), // Structured data we stored
  model: text("model"), // AI model used (if applicable)
  costUsd: real("cost_usd"), // Cost of this enrichment step
  confidence: real("confidence"), // Confidence score (if applicable)
  durationMs: integer("duration_ms"), // Processing time in ms
  status: text("status").notNull().default("success"), // success | error | skipped
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Onboarding Funnel Tracking ──────────────────────────

export const onboardingEvents = pgTable("onboarding_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  firmId: text("firm_id").references(() => serviceFirms.id, {
    onDelete: "set null",
  }),
  domain: text("domain"), // The firm domain being onboarded
  stage: text("stage").notNull(), // domain_submitted | cache_lookup | enrichment_stage_done | enrichment_complete | interview_answer | onboarding_complete
  event: text("event").notNull(), // Specific event within stage (e.g. cache_hit_full, pdl_done, desiredPartnerServices)
  metadata: jsonb("metadata"), // Stage-specific context (gaps[], source, questionNumber, etc.)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Ossy Memory System ────────────────────────────────

export const memoryEntries = pgTable("memory_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  theme: text("theme").notNull(), // e.g., "partner_preferences", "firm_capabilities", "personal_style"
  content: text("content").notNull(), // The memory content
  confidence: real("confidence").default(0.8), // How confident Ossy is about this memory
  sourceConversationId: text("source_conversation_id").references(
    () => conversations.id,
    { onDelete: "set null" }
  ),
  sourceMessageId: text("source_message_id"),
  // embedding: vector(1536) — added when pgvector extension is enabled
  expiresAt: timestamp("expires_at"), // Optional expiry for time-bound memories
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memoryThemes = pgTable("memory_themes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  theme: text("theme").notNull(), // Theme identifier
  summary: text("summary"), // AI-generated summary of all entries in this theme
  entryCount: integer("entry_count").default(0),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Partnerships ──────────────────────────────────────

export const partnershipStatusEnum = pgEnum("partnership_status", [
  "suggested",
  "requested",
  "accepted",
  "declined",
  "inactive",
]);

export const partnershipTypeEnum = pgEnum("partnership_type", [
  "trusted_partner",
  "collective",
  "vendor_network",
]);

export const partnerships = pgTable("partnerships", {
  id: text("id").primaryKey(),
  firmAId: text("firm_a_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  firmBId: text("firm_b_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  status: partnershipStatusEnum("status").notNull().default("suggested"),
  type: partnershipTypeEnum("type").notNull().default("trusted_partner"),
  initiatedBy: text("initiated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  matchScore: real("match_score"), // From matching engine
  matchExplanation: text("match_explanation"), // "Why this match" from LLM
  notes: text("notes"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partnershipEvents = pgTable("partnership_events", {
  id: text("id").primaryKey(),
  partnershipId: text("partnership_id")
    .notNull()
    .references(() => partnerships.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // requested | accepted | declined | message | referral | intro_sent
  actorId: text("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Opportunities & Leads ──────────────────────────────

// Opportunity = private intelligence, AI-extracted from a call/email
// Status lifecycle: new → in_review → actioned | dismissed
export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "new",
  "in_review",
  "actioned",
  "dismissed",
]);

// Lead = shareable with partner network, promoted from an opportunity
// Status lifecycle: draft → open → shared → claimed → won | lost | expired
export const leadStatusEnum = pgEnum("lead_status", [
  "draft",
  "open",
  "shared",
  "claimed",
  "won",
  "lost",
  "expired",
]);

export const caseStudyStatusEnum = pgEnum("case_study_status", [
  "pending",
  "ingesting",
  "active",
  "blocked",
  "failed",
  "deleted",
]);

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // The opportunity itself
  title: text("title").notNull(),
  description: text("description"),
  evidence: text("evidence"), // The quote/signal from the source text
  signalType: text("signal_type").notNull().default("direct"), // "direct" | "latent"
  priority: text("priority").notNull().default("medium"), // "high" | "medium" | "low"

  // Resolution: can we handle this internally, or does it need a partner?
  resolutionApproach: text("resolution_approach").notNull().default("network"), // "self" | "network" | "hybrid"

  // Taxonomy-keyed fields — same vocabulary as enrichment classification
  requiredCategories: jsonb("required_categories").$type<string[]>().default([]),
  requiredSkills: jsonb("required_skills").$type<string[]>().default([]),
  requiredIndustries: jsonb("required_industries").$type<string[]>().default([]),
  requiredMarkets: jsonb("required_markets").$type<string[]>().default([]),

  // Value / scope signals
  estimatedValue: text("estimated_value"), // "10k-25k", "50k-100k", etc.
  timeline: text("timeline"), // "immediate", "1-3 months", "3-6 months"

  // Client company — links to enrichmentCache by domain
  clientDomain: text("client_domain"),
  clientName: text("client_name"), // real or anonymized display name
  anonymizeClient: boolean("anonymize_client").notNull().default(false),
  clientSizeBand: sizeBandEnum("client_size_band"),

  // Source
  source: text("source").notNull().default("manual"), // "call" | "email" | "manual"
  sourceId: text("source_id"), // callTranscripts.id or emailMessages.id

  // Attachments: RFPs, briefs, SOW drafts, etc.
  attachments: jsonb("attachments")
    .$type<{ name: string; url: string; type: string; size: number }[]>()
    .default([]),

  status: opportunityStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Lead = opportunity promoted for sharing with the partner network
export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  opportunityId: text("opportunity_id").references(() => opportunities.id, {
    onDelete: "set null",
  }),

  // Lead content (required for quality gate)
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),

  // Taxonomy-keyed — same vocabulary as partner preferences + firm profiles
  requiredCategories: jsonb("required_categories").$type<string[]>().default([]),
  requiredSkills: jsonb("required_skills").$type<string[]>().default([]),
  requiredIndustries: jsonb("required_industries").$type<string[]>().default([]),
  requiredMarkets: jsonb("required_markets").$type<string[]>().default([]),

  // Value / scope
  estimatedValue: text("estimated_value"),
  timeline: text("timeline"),

  // Client context
  clientDomain: text("client_domain"),
  clientName: text("client_name"),
  anonymizeClient: boolean("anonymize_client").notNull().default(false),
  clientSizeBand: sizeBandEnum("client_size_band"),
  clientType: text("client_type"), // additional free-text context

  // Hidden quality score (internal only, not exposed to partners)
  qualityScore: integer("quality_score").notNull().default(0),
  qualityBreakdown: jsonb("quality_breakdown").$type<Record<string, number>>(),

  // Attachments
  attachments: jsonb("attachments")
    .$type<{ name: string; url: string; type: string; size: number }[]>()
    .default([]),

  status: leadStatusEnum("status").notNull().default("open"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Lead shares — which partner firms have been sent a given lead
export const leadShares = pgTable("lead_shares", {
  id: text("id").primaryKey(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  sharedWithFirmId: text("shared_with_firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  sharedBy: text("shared_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at"),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Referrals ─────────────────────────────────────────

export const referrals = pgTable("referrals", {
  id: text("id").primaryKey(),
  partnershipId: text("partnership_id").references(() => partnerships.id, {
    onDelete: "set null",
  }),
  opportunityId: text("opportunity_id").references(() => opportunities.id, {
    onDelete: "set null",
  }),
  referringFirmId: text("referring_firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  receivingFirmId: text("receiving_firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | converted | lost
  estimatedValue: text("estimated_value"),
  actualValue: text("actual_value"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Email Threads ────────────────────────────────────

export const emailThreads = pgTable("email_threads", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  participants: jsonb("participants").$type<string[]>(), // email addresses
  partnershipId: text("partnership_id").references(() => partnerships.id, {
    onDelete: "set null",
  }),
  opportunityId: text("opportunity_id").references(() => opportunities.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("active"), // active | archived | resolved
  intent: text("intent"), // opportunity | follow_up | context | question | intro
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Email Messages ───────────────────────────────────

export const emailMessages = pgTable("email_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => emailThreads.id, { onDelete: "cascade" }),
  externalMessageId: text("external_message_id"), // Resend/provider message ID
  direction: text("direction").notNull(), // inbound | outbound
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmails: jsonb("to_emails").$type<string[]>().notNull(),
  ccEmails: jsonb("cc_emails").$type<string[]>(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  // AI-extracted metadata
  extractedIntent: text("extracted_intent"), // opportunity | follow_up | context | question
  extractedEntities: jsonb("extracted_entities").$type<{
    firmNames?: string[];
    personNames?: string[];
    skills?: string[];
    industries?: string[];
    values?: string[];
  }>(),
  confidence: real("confidence"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Email Approval Queue ─────────────────────────────

export const emailApprovalQueue = pgTable("email_approval_queue", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emailType: text("email_type").notNull(), // intro | follow_up | opportunity_share | digest
  toEmails: jsonb("to_emails").$type<string[]>().notNull(),
  ccEmails: jsonb("cc_emails").$type<string[]>(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  context: jsonb("context").$type<{
    partnershipId?: string;
    opportunityId?: string;
    reason?: string;
  }>(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | sent
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  sentAt: timestamp("sent_at"),
  externalMessageId: text("external_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Imported Companies (from n8n migration) ───────────

export const importedCompanies = pgTable("imported_companies", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(), // original n8n companies.id
  source: text("source").notNull().default("n8n"), // "n8n" | "manual" | etc.

  // ── Core identity ──
  name: text("name").notNull(),
  domain: text("domain"),
  logoUrl: text("logo_url"), // Clearbit logo
  description: text("description"),

  // ── Industry classification ──
  industry: text("industry"), // Legacy / PDL industry
  sector: text("sector"), // Clearbit category.sector
  industryGroup: text("industry_group"), // Clearbit category.industryGroup
  subIndustry: text("sub_industry"), // Clearbit category.subIndustry

  // ── Size & revenue ──
  size: text("size"), // Legacy text size band
  employeeCountExact: integer("employee_count_exact"), // PDL/Clearbit exact count
  employeeRange: text("employee_range"), // "51-200", "201-500", etc.
  revenue: text("revenue"), // Legacy revenue text
  estimatedRevenue: text("estimated_revenue"), // Revenue range from enrichment

  // ── Location ──
  location: text("location"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  countryCode: text("country_code"),

  // ── Company info ──
  foundedYear: integer("founded_year"),
  companyType: text("company_type"), // public / private / subsidiary
  parentDomain: text("parent_domain"), // Corporate parent domain

  // ── Online presence ──
  websiteUrl: text("website_url"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  facebookUrl: text("facebook_url"),

  // ── Technology & tags ──
  techStack: jsonb("tech_stack").$type<string[]>(), // From Clearbit
  tags: jsonb("tags").$type<string[]>(), // Descriptive keywords

  // ── Funding (from PDL) ──
  fundingRaised: text("funding_raised"),
  latestFundingStage: text("latest_funding_stage"),

  // ── Classification ──
  isIcp: boolean("is_icp"), // true = professional services firm, false = potential client
  icpClassification: text("icp_classification"), // "professional_services" | "saas" | "investor" | etc.
  classificationConfidence: real("classification_confidence"),

  // ── Graph sync ──
  graphNodeId: text("graph_node_id"), // Neo4j node ID once synced
  serviceFirmId: text("service_firm_id").references(() => serviceFirms.id, {
    onDelete: "set null",
  }),
  // Track A: canonical Neo4j Company node id (set by migrate-client-nodes-to-company job)
  canonicalCompanyId: text("canonical_company_id"),

  // ── Enrichment tracking ──
  enrichedAt: timestamp("enriched_at"),
  enrichmentSources: jsonb("enrichment_sources").$type<Record<string, string>>(),

  // ── Provenance ──
  reviewTags: jsonb("review_tags").$type<string[]>().default([]),
  meta: jsonb("meta").$type<{
    source: string;
    migratedAt: string;
    originalCreatedAt?: string;
    lastResearchedAt?: string;
    researchFlags?: Record<string, boolean>;
    confidence?: number;
  }>(),
  legacyData: jsonb("legacy_data"), // Full raw n8n row preserved

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Imported Contacts (from n8n migration) ────────────

export const importedContacts = pgTable("imported_contacts", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(), // n8n contacts.id
  source: text("source").notNull().default("n8n"),
  companyId: text("company_id").references(() => importedCompanies.id, {
    onDelete: "set null",
  }),

  // Primary fields
  firstName: text("first_name"),
  lastName: text("last_name"),
  name: text("name"),
  email: text("email"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  photoUrl: text("photo_url"),
  headline: text("headline"),
  shortBio: text("short_bio"),
  city: text("city"),
  state: text("state"),
  country: text("country"),

  // Classification
  isPartner: boolean("is_partner"),
  isIcp: boolean("is_icp"),
  profileMatch: text("profile_match"),
  profileMatchJustification: text("profile_match_justification"),
  expertClassification: text("expert_classification"), // "expert" | "internal" | "ambiguous"

  // Graph sync
  graphNodeId: text("graph_node_id"),
  // Track A: canonical Neo4j Person node id (set by migrate-legacy-user-to-person job)
  canonicalPersonId: text("canonical_person_id"),

  // Provenance
  reviewTags: jsonb("review_tags").$type<string[]>().default([]),
  meta: jsonb("meta").$type<{
    source: string;
    migratedAt: string;
    originalCreatedAt?: string;
    lastResearchedAt?: string;
    confidence?: number;
  }>(),
  legacyData: jsonb("legacy_data"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Imported Outreach (from n8n fact.messages) ────────

export const importedOutreach = pgTable("imported_outreach", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(), // n8n message_id
  source: text("source").notNull().default("n8n"),
  companyId: text("company_id").references(() => importedCompanies.id, {
    onDelete: "set null",
  }),
  contactId: text("contact_id").references(() => importedContacts.id, {
    onDelete: "set null",
  }),

  messageType: text("message_type"), // from n8n message_type
  messageModule: text("message_module"), // from n8n message_module
  message: text("message"),
  direction: text("direction"), // "outbound" | "inbound"
  senderOrgId: text("sender_org_id"),
  recipientOrgId: text("recipient_org_id"),
  opportunityTitle: text("opportunity_title"),
  sentAt: timestamp("sent_at"),

  meta: jsonb("meta"),
  legacyData: jsonb("legacy_data"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Imported Clients (from legacy platform) ──────────

export const importedClients = pgTable("imported_clients", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(), // Legacy client company UUID
  source: text("source").notNull().default("legacy"),

  // ── Core identity ──
  name: text("name").notNull(),
  domain: text("domain"), // Normalized domain (e.g., "att.com")
  logoUrl: text("logo_url"), // Clearbit logo
  description: text("description"), // Company summary

  // ── Industry classification ──
  industry: text("industry"), // Legacy or PDL industry
  sector: text("sector"), // Clearbit category.sector
  industryGroup: text("industry_group"), // Clearbit category.industryGroup
  subIndustry: text("sub_industry"), // Clearbit category.subIndustry

  // ── Size & revenue ──
  employeeCount: text("employee_count"), // Legacy text value
  employeeCountExact: integer("employee_count_exact"), // PDL/Clearbit exact count
  employeeRange: text("employee_range"), // "51-200", "201-500", etc.
  estimatedRevenue: text("estimated_revenue"), // Revenue range string
  annualRevenue: text("annual_revenue"), // More precise if available

  // ── Location ──
  location: text("location"), // Full formatted location
  city: text("city"),
  state: text("state"),
  country: text("country"),
  countryCode: text("country_code"),

  // ── Company info ──
  website: text("website"), // Original website value (may be messy)
  foundedYear: integer("founded_year"),
  companyType: text("company_type"), // public / private / subsidiary
  parentDomain: text("parent_domain"), // Corporate parent domain

  // ── Online presence ──
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  facebookUrl: text("facebook_url"),

  // ── Technology & tags ──
  techStack: jsonb("tech_stack").$type<string[]>(), // From Clearbit
  tags: jsonb("tags").$type<string[]>(), // Descriptive keywords

  // ── Funding (from PDL) ──
  fundingRaised: text("funding_raised"), // Total raised USD
  latestFundingStage: text("latest_funding_stage"),

  // ── Relationships ──
  serviceFirmSourceId: text("service_firm_source_id"), // Legacy organisation.id
  serviceFirmName: text("service_firm_name"), // Denormalized for display
  importedCompanyId: text("imported_company_id").references(
    () => importedCompanies.id,
    { onDelete: "set null" }
  ),

  // ── Enrichment tracking ──
  enrichedAt: timestamp("enriched_at"), // When last enriched
  enrichmentSources: jsonb("enrichment_sources").$type<Record<string, string>>(), // { pdl: "2024-01-15", clearbit: "2024-01-15" }

  // ── Graph sync ──
  // Track A: canonical Neo4j Company node id (set by migrate-client-nodes-to-company job)
  canonicalCompanyId: text("canonical_company_id"),

  // ── Provenance ──
  legacyData: jsonb("legacy_data"),
  meta: jsonb("meta"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Imported Case Studies (from legacy platform) ─────

export const importedCaseStudies = pgTable("imported_case_studies", {
  id: text("id").primaryKey(),
  sourceId: text("source_id"), // Legacy authorId (not unique)
  source: text("source").notNull().default("legacy"),

  // Author firm info
  authorOrgSourceId: text("author_org_source_id"), // Legacy organisation.id
  authorOrgName: text("author_org_name"), // Denormalized

  // Content
  content: text("content"), // HTML content from "about" field
  status: text("status").default("published"),

  // Structured metadata (flattened from nested arrays)
  clientCompanies: jsonb("client_companies").$type<
    { id: string; name: string }[]
  >(),
  industries: jsonb("industries").$type<{ id: string; name: string }[]>(),
  skills: jsonb("skills").$type<{ id: string; name: string }[]>(),
  links: jsonb("links").$type<string[]>(),
  markets: jsonb("markets").$type<string[]>(),
  expertUsers: jsonb("expert_users").$type<{ id: string; name: string }[]>(),

  // Resolved FK to imported_companies (author firm)
  importedCompanyId: text("imported_company_id").references(
    () => importedCompanies.id,
    { onDelete: "set null" }
  ),

  // Provenance
  legacyData: jsonb("legacy_data"),
  meta: jsonb("meta"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Firm Services (auto-discovered + user-editable) ──────
// Structured services extracted from the firm's website via deep crawl.
// Auto-approved (visible by default). User can edit descriptions and hide.

export const firmServices = pgTable("firm_services", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),

  // Service data
  name: text("name").notNull(),
  description: text("description"), // AI-generated, user-editable
  sourceUrl: text("source_url"), // link to page where found
  sourcePageTitle: text("source_page_title"),
  subServices: jsonb("sub_services").$type<string[]>(),

  // Visibility
  isHidden: boolean("is_hidden").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Firm Case Studies (auto-discovered + user-managed) ───
// Case studies discovered from website via deep crawl and ingested automatically.
// Auto-approved (visible by default). User can hide or manually add more.

export const firmCaseStudies = pgTable("firm_case_studies", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),

  // Source — discovered from website or user-provided
  sourceUrl: text("source_url").notNull(),
  sourceType: text("source_type").notNull().default("url"), // "url" | "pdf_url" | "text"
  userNotes: text("user_notes"),

  // Status
  status: caseStudyStatusEnum("status").notNull().default("pending"),
  statusMessage: text("status_message"),

  // Visible layer (system-generated, user can't edit content — it stays on their site)
  title: text("title"),
  summary: text("summary"), // AI-generated hidden summary for search (not shown to user)
  thumbnailUrl: text("thumbnail_url"), // og:image or screenshot from source page
  autoTags: jsonb("auto_tags").$type<{
    skills: string[];
    industries: string[];
    services: string[];
    markets: string[];
    languages: string[];
    clientName: string | null;
  }>(),

  // Visibility — user can hide (not delete) from their profile
  isHidden: boolean("is_hidden").notNull().default(false),

  // Full AI analysis (not editable by user)
  cosAnalysis: jsonb("cos_analysis"),

  // Graph + abstraction linkage
  graphNodeId: text("graph_node_id"),
  abstractionProfileId: text("abstraction_profile_id"),

  // Multi-format ingestion — new columns (migration 0011_case_study_preview)
  fileStorageKey: text("file_storage_key"),
  sourceMetadata: jsonb("source_metadata").$type<{
    videoDuration?: string;
    slideCount?: number;
    transcriptLength?: number;
    videoId?: string;
    thumbnailSource?: string;
  }>(),
  previewImageUrl: text("preview_image_url"),

  // Timestamps
  ingestedAt: timestamp("ingested_at"),
  lastIngestedAt: timestamp("last_ingested_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Migration Batches (tracking) ─────────────────────

export const migrationBatches = pgTable("migration_batches", {
  id: text("id").primaryKey(),
  source: text("source").notNull().default("n8n"),
  entityType: text("entity_type").notNull(), // "companies" | "contacts" | "outreach" | "research"
  batchNumber: integer("batch_number").notNull(),
  totalInBatch: integer("total_in_batch").notNull(),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  errorDetails: jsonb("error_details"),
  status: text("status").notNull().default("pending"), // pending | processing | complete | failed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Legacy Users (imported from old COS platform) ────
// Stores user records from the legacy Collective OS platform with their
// original roles. Linked to service_firms by matching org names.
// These are NOT Better Auth users — they're reference records for role management.

export const legacyUsers = pgTable("legacy_users", {
  id: text("id").primaryKey(),
  legacyUserId: text("legacy_user_id").notNull(), // Original UUID from user-basic.json
  legacyOrgId: text("legacy_org_id"), // Original org UUID
  legacyOrgName: text("legacy_org_name"), // Original org business_name

  // User info
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  title: text("title"), // Job title

  // Legacy roles (stored as JSON array)
  legacyRoles: jsonb("legacy_roles").$type<string[]>().default([]),

  // Linked to current platform
  firmId: text("firm_id").references(() => serviceFirms.id, {
    onDelete: "set null",
  }),
  // If this person later signs up, link to their Better Auth user
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  migratedAt: timestamp("migrated_at"), // Set when promoted to standard users table
});

// ─── Settings (key-value store) ───────────────────────

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Scheduled Calls (from calendar invites) ──────────

export const scheduledCallStatusEnum = pgEnum("scheduled_call_status", [
  "pending",
  "recording",
  "done",
  "failed",
  "cancelled",
]);

export const meetingPlatformEnum = pgEnum("meeting_platform", [
  "google_meet",
  "zoom",
  "teams",
  "other",
]);

export const callTypeEnum = pgEnum("call_type", [
  "partnership",
  "client",
  "unknown",
]);

export const scheduledCalls = pgTable("scheduled_calls", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  meetingTitle: text("meeting_title"),
  meetingTime: timestamp("meeting_time"),
  meetingLink: text("meeting_link"),
  platform: meetingPlatformEnum("platform").default("other"),
  participants: jsonb("participants").$type<string[]>(),
  partnershipId: text("partnership_id").references(() => partnerships.id, {
    onDelete: "set null",
  }),
  callType: callTypeEnum("call_type").default("unknown"),
  sourceEmailThreadId: text("source_email_thread_id").references(
    () => emailThreads.id,
    { onDelete: "set null" }
  ),
  transcriptId: text("transcript_id"), // FK to callTranscripts, set after call
  recallBotId: text("recall_bot_id"),
  status: scheduledCallStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Call Recordings ──────────────────────────────────

export const callRecordings = pgTable("call_recordings", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  scheduledCallId: text("scheduled_call_id").references(
    () => scheduledCalls.id,
    { onDelete: "set null" }
  ),
  callType: callTypeEnum("call_type").default("unknown"),
  partnerFirmId: text("partner_firm_id").references(() => serviceFirms.id, {
    onDelete: "set null",
  }),
  platform: meetingPlatformEnum("platform").default("other"),
  durationSeconds: integer("duration_seconds"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Call Transcripts ─────────────────────────────────

export const transcriptStatusEnum = pgEnum("transcript_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const callTranscripts = pgTable("call_transcripts", {
  id: text("id").primaryKey(),
  callRecordingId: text("call_recording_id").references(
    () => callRecordings.id,
    { onDelete: "cascade" }
  ),
  scheduledCallId: text("scheduled_call_id").references(
    () => scheduledCalls.id,
    { onDelete: "set null" }
  ),
  fullText: text("full_text"),
  segments: jsonb("segments").$type<
    { speaker: string; startMs: number; endMs: number; text: string }[]
  >(),
  processingStatus: transcriptStatusEnum("processing_status")
    .notNull()
    .default("pending"),
  deepgramJobId: text("deepgram_job_id"),
  coachingReportId: text("coaching_report_id"), // FK set after coaching runs
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Expert Profiles ──────────────────────────────────────

export const expertDivisionEnum = pgEnum("expert_division", [
  "collective_member",
  "expert",
  "trusted_expert",
]);

export const specialistProfileSourceEnum = pgEnum("specialist_profile_source", [
  "ai_generated",
  "user_created",
  "ai_suggested_user_confirmed",
]);

export const specialistProfileStatusEnum = pgEnum("specialist_profile_status", [
  "draft",
  "published",
  "archived",
]);

export const qualityStatusEnum = pgEnum("quality_status", [
  "strong",
  "partial",
  "weak",
  "incomplete",
]);

export const exampleTypeEnum = pgEnum("example_type", [
  "project",
  "role",
]);

/**
 * expertProfiles — canonical expert entity (replaces importedContacts as the
 * primary profile record once a firm's roster is enriched via PDL).
 */
export const expertProfiles = pgTable("expert_profiles", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  importedContactId: text("imported_contact_id").references(
    () => importedContacts.id,
    { onDelete: "set null" }
  ),

  // Identity
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name"),
  email: text("email"),
  title: text("title"),
  headline: text("headline"),
  photoUrl: text("photo_url"),
  linkedinUrl: text("linkedin_url"),
  location: text("location"),
  bio: text("bio"),

  // PDL source
  pdlId: text("pdl_id"),
  pdlData: jsonb("pdl_data").$type<{
    id?: string;
    experience?: {
      company: { name: string; website: string | null; industry: string | null };
      title: string;
      startDate: string | null;
      endDate: string | null;
      isCurrent: boolean;
      summary?: string;
    }[];
    skills?: string[];
    education?: {
      school: { name: string };
      degrees?: string[];
      startDate?: string;
      endDate?: string;
    }[];
    summary?: string;
  }>(),
  pdlEnrichedAt: timestamp("pdl_enriched_at"),

  // Computed / denormalized from specialist profiles
  topSkills: jsonb("top_skills").$type<string[]>(),
  topIndustries: jsonb("top_industries").$type<string[]>(),
  division: expertDivisionEnum("division"),

  // Track A: canonical Person node link
  personNodeId: text("person_node_id"), // Neo4j Person node ID

  // Meta
  isPublic: boolean("is_public").notNull().default(true),
  profileCompleteness: real("profile_completeness").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * specialistProfiles — user-curated niche profiles (e.g. "Fractional CMO for B2B SaaS").
 * These are the primary search-facing "face" of an expert when quality is high enough.
 */
export const specialistProfiles = pgTable("specialist_profiles", {
  id: text("id").primaryKey(),
  expertProfileId: text("expert_profile_id")
    .notNull()
    .references(() => expertProfiles.id, { onDelete: "cascade" }),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),

  // Core content (quality-scored)
  title: text("title"),
  bodyDescription: text("body_description"),

  // Taxonomy (L2 COS skills, industries, services)
  skills: jsonb("skills").$type<string[]>(),
  industries: jsonb("industries").$type<string[]>(),
  services: jsonb("services").$type<string[]>(),

  // Quality
  qualityScore: real("quality_score").default(0),
  qualityStatus: qualityStatusEnum("quality_status").default("incomplete"),

  // Flags
  source: specialistProfileSourceEnum("source").notNull().default("user_created"),
  isSearchable: boolean("is_searchable").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: specialistProfileStatusEnum("status").notNull().default("draft"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * specialistProfileExamples — up to 3 proof-point work examples per specialist profile.
 */
export const specialistProfileExamples = pgTable("specialist_profile_examples", {
  id: text("id").primaryKey(),
  specialistProfileId: text("specialist_profile_id")
    .notNull()
    .references(() => specialistProfiles.id, { onDelete: "cascade" }),

  exampleType: exampleTypeEnum("example_type").notNull().default("project"),
  title: text("title"),
  subject: text("subject"),

  // Context (optional but encouraged)
  companyName: text("company_name"),
  companyIndustry: text("company_industry"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isCurrent: boolean("is_current").notNull().default(false),

  // PDL source link
  isPdlSource: boolean("is_pdl_source").notNull().default(false),
  pdlExperienceIndex: integer("pdl_experience_index"),

  position: integer("position").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Track A: New Taxonomy Enums ─────────────────────────

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "stub",
  "pending",
  "enriched",
  "needs_linkedin",
]);

export const industryLevelEnum = pgEnum("industry_level", ["L1", "L2", "L3"]);

export const marketLevelEnum = pgEnum("market_level", ["L1", "L2", "L3"]);

export const companySourceEnum = pgEnum("company_source", [
  "scraped",
  "imported",
  "pdl",
  "user_created",
  "self_registered",
]);

export const personSourceEnum = pgEnum("person_source", [
  "scraped",
  "imported",
  "user_created",
  "self_registered",
]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "full_time",
  "fractional",
  "advisor",
  "board",
  "embedded",
]);

// ─── Network Scan ────────────────────────────────────────────────────────────

/**
 * networkConnections — OAuth tokens for Gmail/Outlook network scanning.
 * One row per user per provider. Separate from Better Auth accounts table
 * so login OAuth and scanning OAuth have independent scope/token lifecycles.
 */
export const networkConnections = pgTable("network_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),
  provider: text("provider").notNull(), // "google" | "microsoft"
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"),
  providerEmail: text("provider_email"), // which email account was connected
  lastScanAt: timestamp("last_scan_at"),
  scanStatus: text("scan_status").default("idle"), // idle | scanning | done | error
  scanError: text("scan_error"),
  emailsProcessed: integer("emails_processed").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * networkRelationships — scored relationship between a user's org and a firm domain.
 * Populated by the network-scan background job after processing email headers.
 */
export const networkRelationships = pgTable("network_relationships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").notNull(),
  firmDomain: text("firm_domain").notNull(),
  firmName: text("firm_name").notNull(),
  firmId: text("firm_id"), // null if firm is not yet on COS
  firmWebsite: text("firm_website"),
  tier: text("tier").notNull(), // "weak" | "fair" | "strong"
  strength: real("strength").notNull().default(0),
  emailCount: integer("email_count").default(0),
  sentCount: integer("sent_count").default(0),
  receivedCount: integer("received_count").default(0),
  lastContactAt: timestamp("last_contact_at"),
  bidirectional: boolean("bidirectional").default(false),
  provider: text("provider").notNull(), // "google" | "microsoft"
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("net_rel_user_domain_provider_idx").on(t.userId, t.firmDomain, t.provider),
]);

export const preferenceSourceEnum = pgEnum("preference_source", [
  "stated",
  "revealed",
  "ai_inferred",
]);

// Note: leadStatusEnum above includes "draft" (added Track A). All new leads start as "draft".

// ─── Track A: Taxonomy Mirror Tables ─────────────────────

export const firmCategories = pgTable("firm_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  definition: text("definition"),
  theme: text("theme"),
  sampleOrgs: text("sample_orgs"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const techCategories = pgTable("tech_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deliveryModels = pgTable("delivery_models", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serviceCategories = pgTable("service_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  serviceCategoryId: text("service_category_id").references(
    () => serviceCategories.id,
    { onDelete: "set null" }
  ),
  description: text("description"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const industries = pgTable("industries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: industryLevelEnum("level"),
  parentId: text("parent_id").references((): AnyPgColumn => industries.id, {
    onDelete: "set null",
  }),
  sector: text("sector"),
  linkedinValue: text("linkedin_value"),
  crunchbaseValue: text("crunchbase_value"),
  cosLegacyId: text("cos_legacy_id"),
  cosLegacyName: text("cos_legacy_name"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const industryMappings = pgTable("industry_mappings", {
  id: text("id").primaryKey(),
  canonicalIndustryId: text("canonical_industry_id")
    .notNull()
    .references(() => industries.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // linkedin | crunchbase | cos_legacy
  externalValue: text("external_value").notNull(),
  externalLabel: text("external_label"),
  confidence: real("confidence"),
  mappedBy: text("mapped_by"), // admin | ai | auto
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const unmappedIndustries = pgTable("unmapped_industries", {
  id: text("id").primaryKey(),
  rawValue: text("raw_value").notNull(),
  source: text("source").notNull(),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  exampleCompany: text("example_company"),
  status: text("status").notNull().default("pending"), // pending | mapped | ignored
  mappedToId: text("mapped_to_id").references(() => industries.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const markets = pgTable("markets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: marketLevelEnum("level"),
  parentId: text("parent_id").references((): AnyPgColumn => markets.id, {
    onDelete: "set null",
  }),
  isoCode: text("iso_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  radiusKm: real("radius_km"),
  population: integer("population"),
  graphNodeId: text("graph_node_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Coaching Reports ─────────────────────────────────

export const coachingReports = pgTable("coaching_reports", {
  id: text("id").primaryKey(),
  callRecordingId: text("call_recording_id").references(
    () => callRecordings.id,
    { onDelete: "cascade" }
  ),
  scheduledCallId: text("scheduled_call_id").references(
    () => scheduledCalls.id,
    { onDelete: "set null" }
  ),
  talkingTimeRatio: jsonb("talking_time_ratio").$type<{
    userPercent: number;
    otherPercent: number;
    assessment: string;
  }>(),
  valueProposition: jsonb("value_proposition").$type<{
    clarity: number;
    mentioned: boolean;
    feedback: string;
  }>(),
  questionQuality: jsonb("question_quality").$type<{
    discoveryQuestions: number;
    closedQuestions: number;
    score: number;
    feedback: string;
  }>(),
  topicsCovered: jsonb("topics_covered").$type<string[]>(),
  nextSteps: jsonb("next_steps").$type<{ established: boolean; items: string[] }>(),
  actionItems: jsonb("action_items").$type<
    { description: string; assignee: string; deadline?: string }[]
  >(),
  overallScore: integer("overall_score"),
  topRecommendation: text("top_recommendation"),
  recommendedExperts: jsonb("recommended_experts").$type<
    { name: string; firm: string; reason: string; profileUrl?: string }[]
  >(),
  recommendedCaseStudies: jsonb("recommended_case_studies").$type<
    { title: string; firm: string; relevance: string; url?: string }[]
  >(),
  sentToFirmAAt: timestamp("sent_to_firm_a_at"),
  sentToFirmBAt: timestamp("sent_to_firm_b_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Background Jobs Queue ─────────────────────────────
// Replaces Inngest for background job processing.
// Jobs are claimed atomically and processed by /api/jobs/worker.

export const backgroundJobs = pgTable("background_jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // e.g. "firm-case-study-ingest", "deep-crawl"
  status: text("status").notNull().default("pending"), // pending|running|done|failed|cancelled
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  priority: integer("priority").notNull().default(0), // higher = picked first
  runAt: timestamp("run_at").notNull().defaultNow(), // when to process (supports delays)
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Growth Ops ───────────────────────────────────────

export const growthOpsLinkedInAccounts = pgTable("growth_ops_linkedin_accounts", {
  id: text("id").primaryKey(),
  unipileAccountId: text("unipile_account_id").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  linkedinUsername: text("linkedin_username"),
  accountType: text("account_type").notNull().default("basic"), // basic | premium | sales_navigator | recruiter
  status: text("status").notNull().default("CONNECTING"), // CONNECTING | OK | CREDENTIALS | ERROR
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Cached LinkedIn conversations (enriched with participant name/avatar). */
export const growthOpsConversations = pgTable("growth_ops_conversations", {
  id: text("id").primaryKey(),
  linkedinAccountId: text("linkedin_account_id").notNull().references(() => growthOpsLinkedInAccounts.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull(),
  participantProviderId: text("participant_provider_id").notNull().default(""),
  participantName: text("participant_name").notNull().default(""),
  participantHeadline: text("participant_headline"),
  participantProfileUrl: text("participant_profile_url"),
  participantAvatarUrl: text("participant_avatar_url"),
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  unreadCount: integer("unread_count").notNull().default(0),
  isInmailThread: boolean("is_inmail_thread").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [{ name: "growth_ops_conversations_account_chat_unique", columns: [t.linkedinAccountId, t.chatId] }]);

/** Cached LinkedIn messages. Always fetch live; this is a fallback cache. */
export const growthOpsMessages = pgTable("growth_ops_messages", {
  id: text("id").primaryKey(),
  linkedinAccountId: text("linkedin_account_id").notNull().references(() => growthOpsLinkedInAccounts.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull(),
  messageId: text("message_id").notNull().unique(),
  senderProviderId: text("sender_provider_id").notNull().default(""),
  isOutbound: boolean("is_outbound").notNull().default(false),
  body: text("body").notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  isInmail: boolean("is_inmail").notNull().default(false),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Daily usage tracking per LinkedIn account. */
export const growthOpsDailyUsage = pgTable("growth_ops_daily_usage", {
  id: text("id").primaryKey(),
  linkedinAccountId: text("linkedin_account_id").notNull().references(() => growthOpsLinkedInAccounts.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  invitesSent: integer("invites_sent").notNull().default(0),
  messagesSent: integer("messages_sent").notNull().default(0),
  inmailsSent: integer("inmails_sent").notNull().default(0),
  profileViews: integer("profile_views").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [{ name: "growth_ops_daily_usage_account_date_unique", columns: [t.linkedinAccountId, t.date] }]);

export const growthOpsTargetLists = pgTable("growth_ops_target_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const growthOpsInviteTargets = pgTable("growth_ops_invite_targets", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull().references(() => growthOpsTargetLists.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull(),
  unipileProviderId: text("unipile_provider_id"),
  status: text("status").notNull().default("pending"), // pending | invited | failed | skipped
  invitedAt: timestamp("invited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const growthOpsInviteCampaigns = pgTable("growth_ops_invite_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetListId: text("target_list_id").notNull().references(() => growthOpsTargetLists.id, { onDelete: "restrict" }),
  linkedinAccountId: text("linkedin_account_id").notNull().references(() => growthOpsLinkedInAccounts.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"), // draft | active | paused | completed
  dailyMin: integer("daily_min").notNull().default(15),
  dailyMax: integer("daily_max").notNull().default(19),
  inviteMessage: text("invite_message"),
  // Safety & scheduling
  activeDays: jsonb("active_days").$type<string[]>().notNull().default(["mon","tue","wed","thu","fri","sat"]),
  activeHoursStart: integer("active_hours_start").notNull().default(8),  // UTC hour 0-23
  activeHoursEnd: integer("active_hours_end").notNull().default(18),
  // Counters
  totalSent: integer("total_sent").notNull().default(0),
  totalAccepted: integer("total_accepted").notNull().default(0),
  // State
  pauseReason: text("pause_reason"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const growthOpsInviteQueue = pgTable("growth_ops_invite_queue", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => growthOpsInviteCampaigns.id, { onDelete: "cascade" }),
  targetId: text("target_id").notNull().references(() => growthOpsInviteTargets.id, { onDelete: "cascade" }),
  linkedinAccountId: text("linkedin_account_id").notNull().references(() => growthOpsLinkedInAccounts.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at").notNull(),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  unipileProviderId: text("unipile_provider_id"), // cached after first resolve
  status: text("status").notNull().default("queued"), // queued | sent | accepted | failed | skipped
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const growthOpsHubspotCache = pgTable("growth_ops_hubspot_cache", {
  id: text("id").primaryKey(),
  dealId: text("deal_id").notNull().unique(),
  pipelineId: text("pipeline_id").notNull(),
  pipelineLabel: text("pipeline_label").notNull().default(""),
  stageId: text("stage_id").notNull(),
  stageLabel: text("stage_label").notNull().default(""),
  stageOrder: integer("stage_order").notNull().default(0),
  dealData: jsonb("deal_data").notNull().$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

// ─── Domain aliases ─────────────────────────────────────
// Admin-managed mapping of alternate domains to service firms.
// Handles cases where email domain ≠ website domain and
// redirect resolution doesn't catch it (e.g. vanity domains,
// country-specific domains, acquisitions).

export const domainAliases = pgTable("domain_aliases", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),           // e.g. "chameleon.co"
  firmId: text("firm_id").notNull().references(() => serviceFirms.id, { onDelete: "cascade" }),
  note: text("note"),                                   // admin note: "email alias for chameleoncollective.com"
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Acquisition Pipeline (COS-native CRM) ──────────────
// See docs/context/crm-acquisition.md for full context.
// HubSpot is synced into these tables bidirectionally.
// acq_ prefix = "acquisition" — prospective COS customers,
// NOT the same as Opportunities/Leads which are platform-to-platform.

export const acqCompanies = pgTable("acq_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  sizeEstimate: text("size_estimate"),
  hubspotCompanyId: text("hubspot_company_id").unique(),
  hubspotSyncedAt: timestamp("hubspot_synced_at"),
  cosOrgId: text("cos_org_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const acqContacts = pgTable("acq_contacts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  linkedinUrl: text("linkedin_url"),
  companyId: text("company_id").references(() => acqCompanies.id, { onDelete: "set null" }),
  hubspotContactId: text("hubspot_contact_id").unique(),
  hubspotOwnerId: text("hubspot_owner_id"),
  hubspotSyncedAt: timestamp("hubspot_synced_at"),
  cosUserId: text("cos_user_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const acqDeals = pgTable("acq_deals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactId: text("contact_id").references(() => acqContacts.id, { onDelete: "set null" }),
  companyId: text("company_id").references(() => acqCompanies.id, { onDelete: "set null" }),
  hubspotDealId: text("hubspot_deal_id").unique(),
  hubspotPipelineId: text("hubspot_pipeline_id"),
  hubspotStageId: text("hubspot_stage_id"),
  stageLabel: text("stage_label").notNull().default(""),
  dealValue: text("deal_value"),
  status: text("status").notNull().default("open"), // open | won | lost
  closedAt: timestamp("closed_at"),
  hubspotSyncedAt: timestamp("hubspot_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const attributionEvents = pgTable("attribution_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  contactId: text("contact_id").references(() => acqContacts.id, { onDelete: "set null" }),
  instantlyCampaignId: text("instantly_campaign_id"),
  instantlyCampaignName: text("instantly_campaign_name"),
  linkedinCampaignId: text("linkedin_campaign_id").references(() => growthOpsInviteCampaigns.id, { onDelete: "set null" }),
  linkedinInviteTargetId: text("linkedin_invite_target_id").references(() => growthOpsInviteTargets.id, { onDelete: "set null" }),
  matchMethod: text("match_method").notNull().default("none"), // email_exact | linkedin_url | name_domain | none
  matchedAt: timestamp("matched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
