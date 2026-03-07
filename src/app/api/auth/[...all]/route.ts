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
    return await _POST(req);
  } catch (err) {
    console.error("[AUTH POST ERROR]", err);
    return NextResponse.json(
      { error: String(err), message: (err as Error)?.message, stack: (err as Error)?.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
