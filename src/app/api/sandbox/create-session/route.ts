/**
 * POST /api/sandbox/create-session
 *
 * Creates a sandbox test user + org + firm, generates a one-time login token,
 * and returns the login URL. Auth: superadmin session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createSandboxUser } from "@/lib/sandbox/create-test-user";
import { createToken } from "@/lib/sandbox/token-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  try {
    const body = await req.json();
    const name = body.name as string | undefined;
    const domain = body.domain as string | undefined;
    const mode = (body.mode as "onboarding" | "pre-onboarded") || "onboarding";

    const result = await createSandboxUser({ name, domain, mode });
    const normalizedDomain = domain?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const token = await createToken({
      userId: result.userId,
      orgId: result.orgId,
      domain: normalizedDomain,
      mode,
    });
    const loginUrl = `/api/sandbox/enter?token=${token}`;

    return NextResponse.json({
      success: true,
      loginUrl,
      userId: result.userId,
      orgId: result.orgId,
      firmId: result.firmId,
      email: result.email,
      name: result.name,
    });
  } catch (error) {
    console.error("[Sandbox] Create session error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
