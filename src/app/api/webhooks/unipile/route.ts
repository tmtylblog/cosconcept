/**
 * POST /api/webhooks/unipile
 *
 * Receives real-time events from Unipile (new messages, account status changes).
 * Register this URL in your Unipile dashboard as the notify_url.
 *
 * Events handled:
 *  - message_received → upsert message + update conversation preview
 *  - OK/CREDENTIALS/ERROR/CONNECTING/STOPPED → update account status
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { growthOpsLinkedInAccounts, growthOpsConversations, growthOpsMessages } from "@/lib/db/schema";
import { validateUnipileWebhook, resolveMessageDirection } from "@/lib/growth-ops/UnipileClient";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

function randomId() {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  // Validate webhook signature
  const headerMap: Record<string, string | null> = {
    "unipile-auth": req.headers.get("unipile-auth"),
    "Unipile-Auth": req.headers.get("Unipile-Auth"),
  };
  if (!validateUnipileWebhook(headerMap)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Unipile may send event as: the status value directly ("OK"), or an event name
  // ("account_connected") alongside a separate status field. Normalise both.
  const rawEvent = (body.event ?? "") as string;
  const rawStatus = (body.status ?? "") as string;
  const STATUS_VALUES = ["OK", "CREDENTIALS", "ERROR", "CONNECTING", "STOPPED"];
  const resolvedStatus = STATUS_VALUES.find((s) => s === rawEvent || s === rawStatus) ?? null;

  try {
    // ── Account status changes (including new connections) ────────────────
    if (resolvedStatus) {
      const unipileAccountId = (body.account_id ?? body.id) as string;
      // Unipile may nest profile data — check multiple locations
      const acctData = (body.account ?? {}) as Record<string, unknown>;
      const displayName = (
        body.name ?? body.display_name ?? acctData.name ?? acctData.display_name ?? body.username ?? acctData.username ?? ""
      ) as string;
      const linkedinUsername = (body.username ?? acctData.username ?? body.linkedin_username ?? null) as string | null;

      if (unipileAccountId) {
        // Try update first; if no rows affected, this is a new account — insert it
        const updated = await db
          .update(growthOpsLinkedInAccounts)
          .set({
            status: resolvedStatus,
            // Always update name/username if we have them — fixes blank-name ghost rows
            ...(displayName ? { displayName } : {}),
            ...(linkedinUsername ? { linkedinUsername } : {}),
            updatedAt: new Date(),
          })
          .where(eq(growthOpsLinkedInAccounts.unipileAccountId, unipileAccountId));

        // @ts-expect-error — rowCount is available on the underlying result
        if ((updated?.rowCount ?? updated?.length ?? 0) === 0) {
          // New account connected — create the row
          await db
            .insert(growthOpsLinkedInAccounts)
            .values({
              id: randomId(),
              unipileAccountId,
              displayName: displayName || unipileAccountId,
              linkedinUsername,
              status: resolvedStatus,
            })
            .onConflictDoNothing();
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── New message received ───────────────────────────────────────────────
    if (rawEvent === "message_received" || body.object === "Message") {
      const msg = body.message as Record<string, unknown> | undefined ?? body;
      const chatId = (msg.chat_id ?? msg.chatId) as string | undefined;
      const messageId = (msg.id ?? msg.message_id) as string | undefined;
      const text = (msg.text ?? msg.body ?? "") as string;
      const senderId = msg.sender_id as string | undefined;
      const accountId = (msg.account_id ?? body.account_id) as string | undefined;
      const timestamp = msg.timestamp as string | undefined;

      if (!chatId || !messageId) {
        return NextResponse.json({ ok: true, skipped: "missing chatId or messageId" });
      }

      // Look up the account in our DB
      const accountRows = accountId
        ? await db
            .select()
            .from(growthOpsLinkedInAccounts)
            .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
            .limit(1)
        : [];

      const acctDbId = accountRows[0]?.id;

      // Get participant provider ID for direction resolution
      const convoRows = acctDbId
        ? await db
            .select({ participantProviderId: growthOpsConversations.participantProviderId })
            .from(growthOpsConversations)
            .where(
              and(
                eq(growthOpsConversations.linkedinAccountId, acctDbId),
                eq(growthOpsConversations.chatId, chatId),
              ),
            )
            .limit(1)
        : [];
      const participantProviderId = convoRows[0]?.participantProviderId ?? null;

      const isOutbound = resolveMessageDirection(
        { id: messageId, is_sender: msg.is_sender as boolean | undefined, sender_id: senderId },
        participantProviderId,
      );

      // Upsert message
      if (acctDbId) {
        await db
          .insert(growthOpsMessages)
          .values({
            id: randomId(),
            linkedinAccountId: acctDbId,
            chatId,
            messageId,
            senderProviderId: senderId ?? "",
            isOutbound,
            body: text,
            sentAt: timestamp ? new Date(timestamp) : new Date(),
          })
          .onConflictDoNothing();

        // Update conversation preview
        await db
          .update(growthOpsConversations)
          .set({
            lastMessagePreview: text.slice(0, 200),
            lastMessageAt: timestamp ? new Date(timestamp) : new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(growthOpsConversations.linkedinAccountId, acctDbId),
              eq(growthOpsConversations.chatId, chatId),
            ),
          );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, event: "unhandled" });
  } catch (err) {
    console.error("[unipile-webhook]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
