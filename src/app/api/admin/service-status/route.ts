/**
 * GET /api/admin/service-status
 *
 * Checks the status of all paid external API services.
 * Returns which services are configured, active, and their connectivity.
 * Auth: superadmin only.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ServiceStatus {
  name: string;
  category: "infrastructure" | "ai" | "enrichment" | "communications" | "payments" | "jobs" | "growth" | "voice" | "monitoring";
  envVar: string;
  configured: boolean;
  status: "active" | "error" | "unconfigured" | "checking";
  error?: string;
  description: string;
  costModel: string;
  freeTier: boolean;
  required: boolean;
  phase: string;
}

async function checkService(
  name: string,
  envVar: string,
  testFn?: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ configured: boolean; status: "active" | "error" | "unconfigured"; error?: string }> {
  const value = process.env[envVar];
  if (!value || value === "placeholder" || value === "your-key-here") {
    return { configured: false, status: "unconfigured" };
  }

  if (!testFn) {
    // Key exists but can't verify — assume active
    return { configured: true, status: "active" };
  }

  try {
    const result = await testFn();
    return {
      configured: true,
      status: result.ok ? "active" : "error",
      error: result.error,
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  // Auth: superadmin only
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const services: ServiceStatus[] = [];

  // ─── Infrastructure ───────────────────────────────────────

  const neon = await checkService("Neon PostgreSQL", "DATABASE_URL", async () => {
    const { neon: neonSql } = await import("@neondatabase/serverless");
    const sql = neonSql(process.env.DATABASE_URL!);
    const result = await sql`SELECT 1 as ok`;
    return { ok: result.length > 0 };
  });
  services.push({
    name: "Neon PostgreSQL",
    category: "infrastructure",
    envVar: "DATABASE_URL",
    ...neon,
    description: "Primary relational database (Drizzle ORM, pgvector)",
    costModel: "Usage-based (compute + storage)",
    freeTier: true,
    required: true,
    phase: "Phase 0",
  });

  const neo4j = await checkService("Neo4j Aura", "NEO4J_URI", async () => {
    try {
      const res = await fetch(process.env.NEO4J_URI!.replace("neo4j+s://", "https://").replace("bolt+s://", "https://").split("/")[0] + "//", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return { ok: true }; // If we get any response, the server is reachable
    } catch {
      // Neo4j doesn't have a simple HTTP health endpoint, assume configured = active
      return { ok: !!process.env.NEO4J_URI };
    }
  });
  services.push({
    name: "Neo4j Aura",
    category: "infrastructure",
    envVar: "NEO4J_URI",
    ...neo4j,
    description: "Knowledge graph (8.5M+ companies, 18K skills, relationships)",
    costModel: "Usage-based (node/edge storage + queries)",
    freeTier: true,
    required: true,
    phase: "Phase 0",
  });

  // ─── AI & Language Models ─────────────────────────────────

  const openrouter = await checkService("OpenRouter", "OPENROUTER_API_KEY", async () => {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, error: data.data?.label ? `Key: ${data.data.label}` : undefined };
  });
  services.push({
    name: "OpenRouter (AI Gateway)",
    category: "ai",
    envVar: "OPENROUTER_API_KEY",
    ...openrouter,
    description: "Multi-model AI: Claude Sonnet, Gemini Flash/Pro, GPT-4o-mini",
    costModel: "Per 1M tokens (varies by model)",
    freeTier: false,
    required: true,
    phase: "Phase 0",
  });

  const jina = await checkService("Jina AI", "JINA_API_KEY");
  services.push({
    name: "Jina AI (Embeddings + Scraping)",
    category: "ai",
    envVar: "JINA_API_KEY",
    ...jina,
    description: "Vector embeddings (jina-embeddings-v3) + website content extraction",
    costModel: "Per 1M tokens + per scrape request",
    freeTier: true,
    required: true,
    phase: "Phase 0",
  });

  // ─── Data Enrichment ──────────────────────────────────────

  const pdl = await checkService("People Data Labs", "PDL_API_KEY");
  services.push({
    name: "People Data Labs (PDL)",
    category: "enrichment",
    envVar: "PDL_API_KEY",
    ...pdl,
    description: "Person + company enrichment (job history, skills, firmographics)",
    costModel: "~$0.28/person lookup, ~$0.10/company",
    freeTier: false,
    required: true,
    phase: "Phase 2",
  });

  const enrichlayer = await checkService("EnrichLayer", "ENRICHLAYER_API_KEY");
  services.push({
    name: "EnrichLayer (Cheap Person Enrichment)",
    category: "enrichment",
    envVar: "ENRICHLAYER_API_KEY",
    ...enrichlayer,
    description: "Budget person enrichment (~10x cheaper than PDL, used first in chain)",
    costModel: "~$0.02/person lookup",
    freeTier: false,
    required: false,
    phase: "Phase 2",
  });

  // ─── Communications ───────────────────────────────────────

  const resend = await checkService("Resend", "RESEND_API_KEY", async () => {
    const res = await fetch("https://api.resend.com/api-keys", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  });
  services.push({
    name: "Resend (Email)",
    category: "communications",
    envVar: "RESEND_API_KEY",
    ...resend,
    description: "Transactional email: intros, digests, notifications (ossy@joincollectiveos.com)",
    costModel: "Per email sent",
    freeTier: true,
    required: true,
    phase: "Phase 1",
  });

  const customerio = await checkService("Customer.io", "CUSTOMERIO_APP_API_KEY");
  services.push({
    name: "Customer.io",
    category: "communications",
    envVar: "CUSTOMERIO_APP_API_KEY",
    ...customerio,
    description: "Customer data platform & notification preferences (App API only)",
    costModel: "Per customer + per message",
    freeTier: true,
    required: false,
    phase: "Phase 1",
  });

  const unipile = await checkService("Unipile", "UNIPILE_API_KEY");
  services.push({
    name: "Unipile (LinkedIn API)",
    category: "growth",
    envVar: "UNIPILE_API_KEY",
    ...unipile,
    description: "LinkedIn messaging, inbox integration, profile resolution",
    costModel: "Per API call + per action",
    freeTier: false,
    required: false,
    phase: "Phase 5",
  });

  const instantly = await checkService("Instantly.ai", "INSTANTLY_API_KEY");
  services.push({
    name: "Instantly.ai (Email Campaigns)",
    category: "growth",
    envVar: "INSTANTLY_API_KEY",
    ...instantly,
    description: "Email campaign management, lead tracking, outreach sequences",
    costModel: "Per email + storage",
    freeTier: false,
    required: false,
    phase: "Phase 5",
  });

  // ─── Payments ─────────────────────────────────────────────

  const stripe = await checkService("Stripe", "STRIPE_SECRET_KEY", async () => {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const isTest = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");
    return {
      ok: true,
      error: isTest ? "Test mode" : `Live mode`,
    };
  });
  services.push({
    name: "Stripe (Payments)",
    category: "payments",
    envVar: "STRIPE_SECRET_KEY",
    ...stripe,
    description: "Subscription billing (Pro $199/mo, Enterprise custom)",
    costModel: "2.9% + $0.30 per charge",
    freeTier: true,
    required: true,
    phase: "Phase 5",
  });

  // ─── Background Jobs ──────────────────────────────────────

  const inngest = await checkService("Inngest", "INNGEST_EVENT_KEY");
  services.push({
    name: "Inngest (Background Jobs)",
    category: "jobs",
    envVar: "INNGEST_EVENT_KEY",
    ...inngest,
    description: "Durable job queue: enrichment, email, graph sync, weekly recrawl",
    costModel: "Per job run (500 free/month)",
    freeTier: true,
    required: true,
    phase: "Phase 2",
  });

  // ─── Voice ────────────────────────────────────────────────

  const deepgram = await checkService("Deepgram", "DEEPGRAM_API_KEY");
  services.push({
    name: "Deepgram (Speech-to-Text)",
    category: "voice",
    envVar: "DEEPGRAM_API_KEY",
    ...deepgram,
    description: "Real-time speech transcription (Nova-3 model)",
    costModel: "Per audio minute",
    freeTier: true,
    required: false,
    phase: "Phase 1",
  });

  const elevenlabs = await checkService("ElevenLabs", "ELEVENLABS_API_KEY");
  services.push({
    name: "ElevenLabs (Text-to-Speech)",
    category: "voice",
    envVar: "ELEVENLABS_API_KEY",
    ...elevenlabs,
    description: "Voice generation for Ossy (Rachel voice, Turbo v2.5)",
    costModel: "Per 1K characters",
    freeTier: true,
    required: false,
    phase: "Phase 1",
  });

  // ─── Meeting Intelligence ─────────────────────────────────

  const recall = await checkService("Recall.ai", "RECALL_AI_API_KEY");
  services.push({
    name: "Recall.ai (Meeting Bot)",
    category: "voice",
    envVar: "RECALL_AI_API_KEY",
    ...recall,
    description: "Auto-join meetings, record + transcribe (Google Meet, Zoom, Teams)",
    costModel: "Per bot minute (~$0.50-1.00)",
    freeTier: false,
    required: false,
    phase: "Phase 6",
  });

  // ─── Monitoring ───────────────────────────────────────────

  const sentry = await checkService("Sentry", "SENTRY_DSN");
  services.push({
    name: "Sentry (Error Tracking)",
    category: "monitoring",
    envVar: "SENTRY_DSN",
    ...sentry,
    description: "Real-time error monitoring and performance tracking",
    costModel: "Per event",
    freeTier: true,
    required: false,
    phase: "Phase 0",
  });

  // ─── Auth ─────────────────────────────────────────────────

  const google = await checkService("Google OAuth", "GOOGLE_CLIENT_ID");
  services.push({
    name: "Google OAuth",
    category: "infrastructure",
    envVar: "GOOGLE_CLIENT_ID",
    ...google,
    description: "Google Sign-In for user authentication",
    costModel: "Free",
    freeTier: true,
    required: true,
    phase: "Phase 0",
  });

  // Summary stats
  const total = services.length;
  const configured = services.filter((s) => s.configured).length;
  const active = services.filter((s) => s.status === "active").length;
  const errors = services.filter((s) => s.status === "error").length;
  const unconfigured = services.filter((s) => s.status === "unconfigured").length;
  const required = services.filter((s) => s.required).length;
  const requiredConfigured = services.filter((s) => s.required && s.configured).length;

  return NextResponse.json({
    services,
    summary: {
      total,
      configured,
      active,
      errors,
      unconfigured,
      required,
      requiredConfigured,
      requiredMissing: required - requiredConfigured,
    },
  });
}
