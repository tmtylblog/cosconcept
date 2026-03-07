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
  confidenceScores: jsonb("confidence_scores"),
  evidenceSources: jsonb("evidence_sources"),
  // embedding: vector(1536) — added when pgvector extension is enabled
  lastEnrichedAt: timestamp("last_enriched_at"),
  enrichmentVersion: integer("enrichment_version").default(1),
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

// ─── Analytics (placeholder — Phase 8+) ─────────────────
// See docs/ARCHITECTURE.md for planned analytics events and metrics.
// Tables will be added when analytics phase begins:
// - analytics_events (event_name, event_data, org_id, user_id)
// - org_metrics_snapshot (period aggregates: AI cost, matches, partnerships)
