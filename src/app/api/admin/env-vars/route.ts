import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Vercel REST API helper for managing environment variables.
 * Requires VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID env vars.
 */

function getVercelConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) {
    throw new Error("VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required");
  }
  return { token, projectId, teamId };
}

const VERCEL_API = "https://api.vercel.com";

// Known env vars that the app uses, with metadata
const KNOWN_ENV_VARS: {
  key: string;
  label: string;
  description: string;
  phase: string;
  required: boolean;
}[] = [
  { key: "OPENROUTER_API_KEY", label: "OpenRouter", description: "LLM API for Ossy chat and AI classification", phase: "Phase 0", required: true },
  { key: "PDL_API_KEY", label: "People Data Labs", description: "Company firmographic enrichment (size, location, revenue)", phase: "Phase 0", required: true },
  { key: "JINA_API_KEY", label: "Jina Reader", description: "Website scraping for services, clients, about content", phase: "Phase 0", required: false },
  { key: "DATABASE_URL", label: "Neon Postgres", description: "Primary relational database connection string", phase: "Phase 0", required: true },
  { key: "NEO4J_URI", label: "Neo4j URI", description: "Graph database connection URI", phase: "Phase 0", required: true },
  { key: "NEO4J_USERNAME", label: "Neo4j Username", description: "Graph database username", phase: "Phase 0", required: true },
  { key: "NEO4J_PASSWORD", label: "Neo4j Password", description: "Graph database password", phase: "Phase 0", required: true },
  { key: "BETTER_AUTH_SECRET", label: "Better Auth Secret", description: "Secret key for session encryption", phase: "Phase 0", required: true },
  { key: "BETTER_AUTH_URL", label: "Better Auth URL", description: "Base URL for authentication (e.g. https://cos-concept.vercel.app)", phase: "Phase 0", required: true },
  { key: "GOOGLE_CLIENT_ID", label: "Google OAuth Client ID", description: "Google OAuth app client ID for social login", phase: "Phase 0", required: false },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google OAuth Secret", description: "Google OAuth app client secret", phase: "Phase 0", required: false },
  { key: "DEEPGRAM_API_KEY", label: "Deepgram", description: "Speech-to-text and text-to-speech for voice features", phase: "Phase 1", required: false },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs", description: "Premium voice synthesis (TTS fallback)", phase: "Phase 1", required: false },
  { key: "STRIPE_SECRET_KEY", label: "Stripe", description: "Payment processing for subscriptions", phase: "Phase 5", required: false },
  { key: "RECALL_API_KEY", label: "Recall.ai", description: "Meeting recording and call intelligence", phase: "Phase 6", required: false },
  { key: "RESEND_API_KEY", label: "Resend", description: "Transactional and outbound email", phase: "Phase 7", required: false },
  { key: "ADMIN_SECRET", label: "Admin Secret", description: "Internal admin authentication secret", phase: "Phase 0", required: false },
];

// ─── GET: List all env vars and their status ───

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token, projectId, teamId } = getVercelConfig();

    const teamParam = teamId ? `&teamId=${teamId}` : "";
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${projectId}/env?decrypt=false${teamParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Vercel API error: ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    const envVars: Record<string, { id: string; target: string[]; value?: string }> = {};

    for (const env of data.envs || []) {
      envVars[env.key] = {
        id: env.id,
        target: env.target || [],
        // Vercel returns encrypted values — we just track presence, not actual values
      };
    }

    // Map known vars with their status
    const variables = KNOWN_ENV_VARS.map((kv) => ({
      ...kv,
      isSet: !!envVars[kv.key],
      envId: envVars[kv.key]?.id || null,
      targets: envVars[kv.key]?.target || [],
    }));

    return NextResponse.json({ variables });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// ─── POST: Create or update an env var ───

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { key, value } = (await req.json()) as { key: string; value: string };

    if (!key || !value) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }

    // Validate it's a known env var
    const known = KNOWN_ENV_VARS.find((kv) => kv.key === key);
    if (!known) {
      return NextResponse.json({ error: `Unknown env var: ${key}` }, { status: 400 });
    }

    const { token, projectId, teamId } = getVercelConfig();
    const teamParam = teamId ? `?teamId=${teamId}` : "";

    // First check if it already exists
    const listRes = await fetch(
      `${VERCEL_API}/v10/projects/${projectId}/env${teamParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let existingId: string | null = null;
    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = (listData.envs || []).find(
        (e: { key: string; id: string }) => e.key === key
      );
      if (existing) existingId = existing.id;
    }

    if (existingId) {
      // Update existing
      const updateRes = await fetch(
        `${VERCEL_API}/v10/projects/${projectId}/env/${existingId}${teamParam}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value: value.trim(),
            target: ["production"],
            type: "encrypted",
          }),
        }
      );

      if (!updateRes.ok) {
        const text = await updateRes.text();
        return NextResponse.json(
          { error: `Failed to update: ${updateRes.status}`, details: text },
          { status: updateRes.status }
        );
      }

      return NextResponse.json({
        success: true,
        action: "updated",
        key,
        message: `${known.label} updated. Redeploy to activate.`,
      });
    } else {
      // Create new
      const createRes = await fetch(
        `${VERCEL_API}/v10/projects/${projectId}/env${teamParam}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key,
            value: value.trim(),
            target: ["production"],
            type: "encrypted",
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text();
        return NextResponse.json(
          { error: `Failed to create: ${createRes.status}`, details: text },
          { status: createRes.status }
        );
      }

      return NextResponse.json({
        success: true,
        action: "created",
        key,
        message: `${known.label} saved. Redeploy to activate.`,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
