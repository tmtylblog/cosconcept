/**
 * GET/PUT /api/admin/calls/settings
 *
 * Manage the configurable extraction prompt used for opportunity detection.
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_EXTRACTION_INSTRUCTIONS } from "@/lib/ai/opportunity-extractor";

export const dynamic = "force-dynamic";

const PROMPT_KEY = "opportunity_extraction_prompt";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let prompt = DEFAULT_EXTRACTION_INSTRUCTIONS;
  let isCustom = false;
  let updatedAt: string | null = null;

  try {
    const row = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, PROMPT_KEY))
      .limit(1);

    if (row[0]) {
      prompt = row[0].value;
      isCustom = true;
      updatedAt = row[0].updatedAt?.toISOString() ?? null;
    }
  } catch {
    // Table may not exist yet — return default
  }

  return Response.json({
    prompt,
    isCustom,
    defaultPrompt: DEFAULT_EXTRACTION_INSTRUCTIONS,
    updatedAt,
  });
}

export async function PUT(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { prompt } = (await req.json()) as { prompt: string };

  if (!prompt || prompt.length < 50) {
    return Response.json({ error: "Prompt too short (min 50 chars)" }, { status: 400 });
  }

  // Upsert
  const existing = await db
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .where(eq(platformSettings.key, PROMPT_KEY))
    .limit(1);

  if (existing[0]) {
    await db
      .update(platformSettings)
      .set({
        value: prompt,
        metadata: { updatedBy: session.user.id, version: Date.now() },
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.key, PROMPT_KEY));
  } else {
    await db.insert(platformSettings).values({
      id: uid("ps"),
      key: PROMPT_KEY,
      value: prompt,
      metadata: { updatedBy: session.user.id, version: 1 },
    });
  }

  return Response.json({ success: true });
}
