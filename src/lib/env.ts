import { z } from "zod/v4";

/**
 * Environment variable validation.
 * Fails fast at startup if required vars are missing.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.url("Must be a valid Neon PostgreSQL connection URL"),

  // Neo4j
  NEO4J_URI: z.string().min(1, "Neo4j URI is required"),
  NEO4J_USERNAME: z.string().min(1, "Neo4j username is required"),
  NEO4J_PASSWORD: z.string().min(1, "Neo4j password is required"),

  // Auth
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "Auth secret must be at least 32 characters"),
  BETTER_AUTH_URL: z.url("Must be a valid URL"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "Google client ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "Google client secret is required"),

  // AI — OpenRouter (required for Ossy chat)
  OPENROUTER_API_KEY: z.string().min(1, "OpenRouter API key is required"),

  // Stripe (optional until billing is live)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_YEARLY_PRICE_ID: z.string().optional(),

  // Optional in Phase 0, required later
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  PROXYCURL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error("Invalid environment variables. Check .env.local");
  }

  return result.data;
}

export const env = validateEnv();
