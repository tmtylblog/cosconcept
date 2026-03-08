import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { neo4jDriver } from "@/lib/neo4j";
import { getStripe } from "@/lib/stripe";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ApiHealthCheck {
  name: string;
  status: "healthy" | "warning" | "error";
  latencyMs: number;
  quota?: {
    used: number;
    limit: number;
    remaining: number;
    unit: string;
    percentUsed: number;
  };
  message?: string;
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

// ─── Individual Checks ─────────────────────────────────

async function checkOpenRouter(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "OpenRouter";
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return { name, status: "error", latencyMs: 0, message: "OPENROUTER_API_KEY not set", checkedAt: new Date().toISOString() };

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
    if (!key) return { name, status: "error", latencyMs: 0, message: "PDL_API_KEY not set", checkedAt: new Date().toISOString() };

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
      message: remaining > 0 || spent > 0 ? undefined : "No usage headers returned",
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

    return {
      name,
      status: "healthy",
      latencyMs,
      message: key ? "Authenticated" : "Using free tier",
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
    if (!key) return { name, status: "error", latencyMs: 0, message: "DEEPGRAM_API_KEY not set", checkedAt: new Date().toISOString() };

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
    if (!key) return { name, status: "error", latencyMs: 0, message: "ELEVENLABS_API_KEY not set", checkedAt: new Date().toISOString() };

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
    if (!key) return { name, status: "error", latencyMs: 0, message: "RESEND_API_KEY not set", checkedAt: new Date().toISOString() };

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
    if (!key) return { name, status: "error", latencyMs: 0, message: "RECALL_API_KEY not set", checkedAt: new Date().toISOString() };

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
    return { name, status: "error", latencyMs: Date.now() - start, message: String(err), checkedAt: new Date().toISOString() };
  }
}

async function checkNeo4j(): Promise<ApiHealthCheck> {
  const start = Date.now();
  const name = "Neo4j";
  try {
    const session = neo4jDriver.session();
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
