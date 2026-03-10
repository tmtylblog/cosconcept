import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

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
  preferredFirmTypes: jsonb("preferred_firm_types").$type<string[]>(),
  preferredSizeBands: jsonb("preferred_size_bands").$type<string[]>(),
  preferredIndustries: jsonb("preferred_industries").$type<string[]>(),
  preferredMarkets: jsonb("preferred_markets").$type<string[]>(),
  partnershipModels: jsonb("partnership_models").$type<string[]>(),
  dealBreakers: jsonb("deal_breakers").$type<string[]>(),
  growthGoals: text("growth_goals"),
  rawOnboardingData: jsonb("raw_onboarding_data"),
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
  // embedding: vector(1536) — added when pgvector extension is enabled
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
// Status lifecycle: open → shared → claimed → won | lost | expired
export const leadStatusEnum = pgEnum("lead_status", [
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

// ─── Firm Case Studies (user-managed) ─────────────────

export const firmCaseStudies = pgTable("firm_case_studies", {
  id: text("id").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => serviceFirms.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),

  // Source — what the user provided
  sourceUrl: text("source_url").notNull(),
  sourceType: text("source_type").notNull().default("url"), // "url" | "pdf_url"
  userNotes: text("user_notes"),

  // Status
  status: caseStudyStatusEnum("status").notNull().default("pending"),
  statusMessage: text("status_message"),

  // Visible layer (system-generated, user can't edit)
  title: text("title"),
  summary: text("summary"), // AI-generated 2-sentence summary
  autoTags: jsonb("auto_tags").$type<{
    skills: string[];
    industries: string[];
    services: string[];
    clientName: string | null;
  }>(),

  // Full AI analysis (not editable by user)
  cosAnalysis: jsonb("cos_analysis"),

  // Graph + abstraction linkage
  graphNodeId: text("graph_node_id"),
  abstractionProfileId: text("abstraction_profile_id"),

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
