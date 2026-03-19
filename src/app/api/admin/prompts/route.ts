/**
 * GET  /api/admin/prompts — List all prompts with current text + override status
 * PUT  /api/admin/prompts — Save or reset a prompt override
 *
 * Auth: superadmin session required (inherits from /api/admin/* middleware gate).
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAllPrompts, savePrompt, PROMPT_REGISTRY } from "@/lib/ai/prompt-registry";

export const dynamic = "force-dynamic";

async function requireSuperadmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const prompts = await getAllPrompts();

    // Strip getDefault function for JSON serialization, add defaultText instead
    const serialized = prompts.map(({ getDefault, ...rest }) => ({
      ...rest,
      defaultText: getDefault(),
    }));

    return NextResponse.json({ prompts: serialized });
  } catch (error) {
    console.error("[Admin] Prompts list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { key, text } = body as { key: string; text: string | null };

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    // Validate key exists in registry
    if (!PROMPT_REGISTRY.find((p) => p.key === key)) {
      return NextResponse.json({ error: `Unknown prompt key: ${key}` }, { status: 400 });
    }

    // Validate text length if provided
    if (text && text.trim().length < 20) {
      return NextResponse.json(
        { error: "Prompt must be at least 20 characters" },
        { status: 400 }
      );
    }

    await savePrompt(key, text, session.user.id);

    return NextResponse.json({
      success: true,
      key,
      action: text ? "saved" : "reset",
    });
  } catch (error) {
    console.error("[Admin] Prompts save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
