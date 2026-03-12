import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UnipileClient } from "@/lib/growth-ops/UnipileClient";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const action = req.nextUrl.searchParams.get("action");
  try {
    if (action === "listAccounts") {
      const data = await UnipileClient.listAccounts();
      return NextResponse.json(data);
    }
    if (action === "listChats") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
      const data = await UnipileClient.listChats(accountId, cursor);
      return NextResponse.json(data);
    }
    if (action === "getChatMessages") {
      const chatId = req.nextUrl.searchParams.get("chatId") ?? "";
      const data = await UnipileClient.getChatMessages(chatId);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as { action: string; [key: string]: unknown };
  try {
    if (body.action === "generateAuthLink") {
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/growth-ops/linkedin/accounts`;
      const data = await UnipileClient.generateHostedAuthLink(callbackUrl);
      return NextResponse.json(data);
    }
    if (body.action === "generateReconnectLink") {
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/growth-ops/linkedin/accounts`;
      const data = await UnipileClient.generateReconnectLink(body.accountId as string, callbackUrl);
      return NextResponse.json(data);
    }
    if (body.action === "sendMessage") {
      const data = await UnipileClient.sendMessage(body.chatId as string, body.text as string);
      return NextResponse.json(data);
    }
    if (body.action === "resolveUser") {
      const data = await UnipileClient.resolveLinkedInUser(body.linkedinUrl as string, body.accountId as string);
      return NextResponse.json(data);
    }
    if (body.action === "sendInvite") {
      const data = await UnipileClient.sendInvite(body.providerId as string, body.accountId as string, body.message as string | undefined);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
