import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNeo4jDriver } from "@/lib/neo4j";
import { getStripe } from "@/lib/stripe";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ApiHealthCheck {
  name: string;
  status: "healthy" | "warning" | "error" | "not_configured";
  latencyMs: number;
  quota?: {
    used: number;
    limit: number;
    remaining: number;
    unit: string;
    percentUsed: number;
  };
  message?: string;
  phase?: string; // Which build phase this service is needed for
  checkedAt: string;
}

/** Run a check with a timeout */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = 8000
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    ),
  ]);
}

function notConfigured(name: string, envVar: string, phase: string): ApiHealthCheck {
  return {
    name,
    status: "not_configured",
    latencyMs: 0,
    message: `${envVar} not set`,
    phase,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Individual Checks ─────────────────────────────────

async function checkOpenRouter(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "OpenRouter";
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return notConfigured(name, "OPENROUTER_API_KEY", "Phase 0");

    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    }

    const data = await res.json();
    const totalCredits = data.data?.total_credits ?? 0;
    const totalUsage = data.data?.total_usage ?? 0;
    const remaining = totalCredits - totalUsage;
    const percentUsed = totalCredits > 0 ? (totalUsage / totalCredits) * 100 : 0;

    return {
      name,
      status: percentUsed > 80 ? "warning" : "healthy",
      latencyMs,
      quota: {
        used: Math.round(totalUsage * 100) / 100,
        limit: Math.round(totalCredits * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        unit: "$",
        percentUsed: Math.round(percentUsed),
      },
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkPDL(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "People Data Labs";
  try {
    const key = process.env.PDL_API_KEY;
    if (!key) return notConfigured(name, "PDL_API_KEY", "Phase 0");

    // Use a domain that won't match — 404 is free, no credit charge
    // But response headers still show remaining credits
    const res = await fetch(
      `https://api.peopledatalabs.com/v5/company/enrich?api_key=${key}&website=test.invalid`,
      { method: "GET" }
    );
    const latencyMs = Date.now() - start;

    const remaining = parseInt(res.headers.get("x-totallimit-remaining") || "0", 10);
    const spent = parseInt(res.headers.get("x-totallimit-used") || "0", 10);
    const limit = remaining + spent;

    // 402 = payment required (out of credits)
    if (res.status === 402) {
      return {
        name,
        status: "error",
        latencyMs,
        quota: { used: spent, limit, remaining: 0, unit: "credits", percentUsed: 100 },
        message: "Credits exhausted (402)",
        checkedAt: new Date().toISOString(),
      };
    }

    // 404 = no match (expected for test.invalid) — headers still have usage
    const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;
    return {
      name,
      status: percentUsed > 80 ? "warning" : "healthy",
      latencyMs,
      quota: remaining > 0 || spent > 0
        ? { used: spent, limit, remaining, unit: "credits", percentUsed: Math.round(percentUsed) }
        : undefined,
      message: remaining > 0 || spent > 0 ? undefined : "Connected (no usage headers returned)",
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkJina(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Jina Reader";
  try {
    const key = process.env.JINA_API_KEY;
    const fetchHeaders: Record<string, string> = { Accept: "text/plain" };
    if (key) fetchHeaders["Authorization"] = `Bearer ${key}`;

    const res = await fetch("https://r.jina.ai/https://example.com", {
      headers: fetchHeaders,
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    }

    // Extract rate limit / token info from response headers
    const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
    const rateLimitLimit = res.headers.get("x-ratelimit-limit");
    const tokensRemaining = res.headers.get("x-tokens-remaining");
    const tokensUsed = res.headers.get("x-tokens-used");

    // Try to build quota from available headers
    let quota: ApiHealthCheck["quota"] | undefined;

    if (tokensRemaining && tokensUsed) {
      const remaining = parseInt(tokensRemaining, 10);
      const used = parseInt(tokensUsed, 10);
      const limit = remaining + used;
      const percentUsed = limit > 0 ? (used / limit) * 100 : 0;
      quota = { used, limit, remaining, unit: "tokens", percentUsed: Math.round(percentUsed) };
    } else if (rateLimitRemaining && rateLimitLimit) {
      const remaining = parseInt(rateLimitRemaining, 10);
      const limit = parseInt(rateLimitLimit, 10);
      const used = limit - remaining;
      const percentUsed = limit > 0 ? (used / limit) * 100 : 0;
      quota = { used, limit, remaining, unit: "requests", percentUsed: Math.round(percentUsed) };
    }

    return {
      name,
      status: quota && quota.percentUsed > 80 ? "warning" : "healthy",
      latencyMs,
      quota,
      message: key ? "Authenticated" : "Using free tier (no API key)",
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkDeepgram(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Deepgram";
  try {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return notConfigured(name, "DEEPGRAM_API_KEY", "Phase 1");

    // Get projects list first
    const projRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` },
    });
    const latencyMs = Date.now() - start;

    if (!projRes.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${projRes.status}`, checkedAt: new Date().toISOString() };
    }

    const projData = await projRes.json();
    const projectId = projData.projects?.[0]?.project_id;

    if (projectId) {
      // Get balance
      const balRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
        headers: { Authorization: `Token ${key}` },
      });
      if (balRes.ok) {
        const balData = await balRes.json();
        const balance = balData.balances?.[0];
        if (balance) {
          const remaining = balance.amount ?? 0;
          const unit = balance.units ?? "$";
          return {
            name,
            status: remaining < 5 ? "warning" : "healthy",
            latencyMs: Date.now() - start,
            quota: {
              used: 0,
              limit: remaining,
              remaining,
              unit,
              percentUsed: 0,
            },
            message: `Balance: ${remaining} ${unit}`,
            checkedAt: new Date().toISOString(),
          };
        }
      }
    }

    return { name, status: "healthy", latencyMs, message: "Connected", checkedAt: new Date().toISOString() };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkElevenLabs(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "ElevenLabs";
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return notConfigured(name, "ELEVENLABS_API_KEY", "Phase 1");

    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": key },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    }

    const data = await res.json();
    const used = data.character_count ?? 0;
    const limit = data.character_limit ?? 0;
    const remaining = limit - used;
    const percentUsed = limit > 0 ? (used / limit) * 100 : 0;

    return {
      name,
      status: percentUsed > 80 ? "warning" : "healthy",
      latencyMs,
      quota: {
        used,
        limit,
        remaining,
        unit: "characters",
        percentUsed: Math.round(percentUsed),
      },
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkResend(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Resend";
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return notConfigured(name, "RESEND_API_KEY", "Phase 7");

    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    }

    return { name, status: "healthy", latencyMs, message: "Connected", checkedAt: new Date().toISOString() };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkRecall(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Recall.ai";
  try {
    const key = process.env.RECALL_API_KEY;
    if (!key) return notConfigured(name, "RECALL_API_KEY", "Phase 6");

    const res = await fetch("https://us-west-2.recall.ai/api/v1/billing/usage/", {
      headers: { Authorization: `Token ${key}` },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, status: "error", latencyMs, message: `HTTP ${res.status}`, checkedAt: new Date().toISOString() };
    }

    const data = await res.json();
    return {
      name,
      status: "healthy",
      latencyMs,
      message: `Bot hours used: ${data.total_bot_hours ?? "unknown"}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkStripe(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Stripe";
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    const latencyMs = Date.now() - start;

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;

    return {
      name,
      status: "healthy",
      latencyMs,
      message: `Balance: $${available.toFixed(2)}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = String(err);
    // Distinguish "not configured" from actual Stripe errors
    if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("not set") || msg.includes("not configured")) {
      return notConfigured(name, "STRIPE_SECRET_KEY", "Phase 5");
    }
    return { name, status: "error", latencyMs: Date.now() - start, message: msg, checkedAt: new Date().toISOString() };
  }
}

async function checkNeo4j(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Neo4j";
  try {
    const session = getNeo4jDriver().session();
    try {
      await session.run("RETURN 1 AS ping");
      const latencyMs = Date.now() - start;
      return { name, status: "healthy", latencyMs, message: "Connected", checkedAt: new Date().toISOString() };
    } finally {
      await session.close();
    }
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkNeonDB(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Neon Postgres";
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    return { name, status: "healthy", latencyMs, message: "Connected", checkedAt: new Date().toISOString() };
  } catch (err) {
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

// ─── Main Handler ─────────────────────────────────────

export async function GET() {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run all checks in parallel with timeouts
  const results = await Promise.all([
    withTimeout(checkOpenRouter),
    withTimeout(checkPDL),
    withTimeout(checkJina),
    withTimeout(checkDeepgram),
    withTimeout(checkElevenLabs),
    withTimeout(checkResend),
    withTimeout(checkRecall),
    withTimeout(checkStripe),
    withTimeout(checkNeo4j),
    withTimeout(checkNeonDB),
  ].map(p => p.catch((err): ApiHealthCheck => ({
    name: "Unknown",
    status: "error",
    latencyMs: 0,
    message: String(err),
    checkedAt: new Date().toISOString(),
  }))));

  const hasErrors = results.some(r => r.status === "error");
  const hasWarnings = results.some(r => r.status === "warning");

  return NextResponse.json({
    overall: hasErrors ? "error" : hasWarnings ? "warning" : "healthy",
    services: results,
    checkedAt: new Date().toISOString(),
  });
}
