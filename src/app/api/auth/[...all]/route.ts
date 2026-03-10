import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

// Force dynamic — auth routes must not be prerendered at build time
export const dynamic = "force-dynamic";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  try {
    return await _GET(req);
  } catch (err) {
    console.error("[AUTH GET ERROR]", err);
    return NextResponse.json(
      { error: String(err), message: (err as Error)?.message, stack: (err as Error)?.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const response = await _POST(req);

    // Debug: if Better Auth returns a 500, intercept and add error details
    if (response.status >= 500) {
      const cloned = response.clone();
      let body: string;
      try {
        body = await cloned.text();
      } catch {
        body = "(could not read body)";
      }
      console.error("[AUTH POST 500]", {
        url: req.nextUrl.pathname,
        status: response.status,
        body: body || "(empty)",
        headers: Object.fromEntries(response.headers.entries()),
      });

      // If body is empty, return a diagnostic error
      if (!body || body.length === 0) {
        return NextResponse.json(
          {
            error: "Better Auth returned empty 500",
            debug: {
              url: req.nextUrl.pathname,
              status: response.status,
              headers: Object.fromEntries(response.headers.entries()),
            },
          },
          { status: 500 }
        );
      }
    }

    return response;
  } catch (err) {
    console.error("[AUTH POST ERROR]", err);
    return NextResponse.json(
      { error: String(err), message: (err as Error)?.message, stack: (err as Error)?.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
