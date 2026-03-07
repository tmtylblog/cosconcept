import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Migrate guest conversation to authenticated user's account.
 * For now, this is a stub — full implementation will persist messages
 * to the database when conversation storage is built.
 */
export async function POST(req: Request) {
  try {
    const { messages, organizationId } = await req.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    // TODO: Persist guest messages to conversations table
    // when database conversation storage is implemented
    console.log(
      `[Chat Migration] Migrating ${messages?.length ?? 0} messages to org ${organizationId}`
    );

    return NextResponse.json({ success: true, migrated: messages?.length ?? 0 });
  } catch (error) {
    console.error("[Chat Migration] Error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
