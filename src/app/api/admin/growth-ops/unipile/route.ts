import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  growthOpsLinkedInAccounts,
  growthOpsConversations,
  growthOpsMessages,
  growthOpsDailyUsage,
} from "@/lib/db/schema";
import { UnipileClient, resolveMessageDirection, type UnipileMessage } from "@/lib/growth-ops/UnipileClient";
import { getLimitsForAccountType } from "@/lib/growth-ops/linkedin-limits";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

function randomId() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Background: persist messages to local cache ──────────────────────────────

async function persistMessages(
  linkedinAccountDbId: string,
  chatId: string,
  items: UnipileMessage[],
  participantProviderId?: string | null,
) {
  for (const msg of items) {
    const isOutbound = resolveMessageDirection(msg, participantProviderId);
    await db
      .insert(growthOpsMessages)
      .values({
        id: randomId(),
        linkedinAccountId: linkedinAccountDbId,
        chatId,
        messageId: msg.id,
        senderProviderId: msg.sender_id ?? "",
        isOutbound,
        body: msg.text ?? "",
        isRead: !!msg.seen,
        sentAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      })
      .onConflictDoNothing();
  }
}

// ── Background: enrich conversation participant info via profile lookup ───────

async function enrichConversations(
  convos: { id: string; participantProviderId: string }[],
  unipileAccountId: string,
) {
  const BATCH = 5;
  for (let i = 0; i < convos.length; i += BATCH) {
    const batch = convos.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (conv) => {
        if (!conv.participantProviderId) return;
        try {
          const profile = await UnipileClient.getProfile(conv.participantProviderId, unipileAccountId);
          const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
          if (!name && !profile.profile_picture_url) return;
          await db
            .update(growthOpsConversations)
            .set({
              participantName: name || undefined,
              participantHeadline: profile.headline ?? null,
              participantProfileUrl: profile.public_identifier
                ? `https://linkedin.com/in/${profile.public_identifier}`
                : null,
              participantAvatarUrl: profile.profile_picture_url ?? null,
              updatedAt: new Date(),
            })
            .where(eq(growthOpsConversations.id, conv.id));
        } catch {
          // Non-critical — enrichment fails silently
        }
      }),
    );
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const action = req.nextUrl.searchParams.get("action");

  try {
    // ── listAccounts ──────────────────────────────────────────────────────
    if (action === "listAccounts") {
      const data = await UnipileClient.listAccounts();
      return NextResponse.json(data);
    }

    // ── listConversations — DB-cached, live-seeded ─────────────────────
    if (action === "listConversations") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ conversations: [] });
      const acct = accountRow[0];

      // Fetch from DB cache
      let convos = await db
        .select()
        .from(growthOpsConversations)
        .where(eq(growthOpsConversations.linkedinAccountId, acct.id))
        .orderBy(desc(growthOpsConversations.lastMessageAt))
        .limit(50);

      // If empty, seed from Unipile live
      if (convos.length === 0) {
        const live = await UnipileClient.listChats(accountId, { limit: 100 });
        const items = live.items ?? [];

        for (const chat of items) {
          const other = chat.attendees?.find((a) => !a.is_self);
          const participantProviderId =
            other?.attendee_provider_id ?? chat.attendee_provider_id ?? "";
          // Use attendee name if available; fall back to chat.name only if it
          // doesn't look like a generic subject (e.g. "Referral?", "InMail").
          const rawChatName = chat.name ?? "";
          const chatNameIsGeneric = /^(referral\??|inmail|sponsored|hi|hey|hello|\s*)$/i.test(rawChatName.trim());
          const participantName = other?.attendee_name || (!chatNameIsGeneric ? rawChatName : "") || "";
          const isInmail = chat.content_type === "inmail";
          const lastText = chat.last_message?.text ?? null;
          const lastAt = chat.timestamp ? new Date(chat.timestamp) : null;

          await db
            .insert(growthOpsConversations)
            .values({
              id: randomId(),
              linkedinAccountId: acct.id,
              chatId: chat.id,
              participantProviderId,
              participantName,
              lastMessageAt: lastAt,
              lastMessagePreview: lastText,
              isInmailThread: isInmail,
            })
            .onConflictDoNothing();
        }

        convos = await db
          .select()
          .from(growthOpsConversations)
          .where(eq(growthOpsConversations.linkedinAccountId, acct.id))
          .orderBy(desc(growthOpsConversations.lastMessageAt))
          .limit(50);

        // Kick off background enrichment for missing avatars/names or empty names
        const toEnrich = convos
          .filter((c) => (!c.participantAvatarUrl || !c.participantName) && c.participantProviderId)
          .map((c) => ({ id: c.id, participantProviderId: c.participantProviderId }));
        if (toEnrich.length > 0) {
          enrichConversations(toEnrich, accountId).catch(() => {});
        }
      }

      return NextResponse.json({ conversations: convos });
    }

    // ── getMessages — always live, 3-tier direction, persist in BG ────────
    if (action === "getMessages") {
      const chatId = req.nextUrl.searchParams.get("chatId") ?? "";
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";

      // Get account DB row
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      const acctDbId = accountRow[0]?.id;

      // Get participant provider ID for direction fallback
      const convoRow = acctDbId
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
      const participantProviderId = convoRow[0]?.participantProviderId ?? null;

      // Fetch live from Unipile
      let items: UnipileMessage[] = [];
      try {
        const live = await UnipileClient.listMessages(chatId, accountId, { limit: 100 });
        items = live.items ?? [];
      } catch {
        // Fall back to local cache
        if (acctDbId) {
          const cached = await db
            .select()
            .from(growthOpsMessages)
            .where(
              and(
                eq(growthOpsMessages.linkedinAccountId, acctDbId),
                eq(growthOpsMessages.chatId, chatId),
              ),
            )
            .orderBy(growthOpsMessages.sentAt);
          return NextResponse.json({
            messages: cached.map((m) => ({
              id: m.messageId,
              text: m.body,
              is_sender: m.isOutbound,
              timestamp: m.sentAt,
            })),
          });
        }
        return NextResponse.json({ messages: [] });
      }

      // Apply 3-tier direction logic
      const messages = items
        .map((msg) => ({
          id: msg.id,
          text: msg.text ?? "",
          is_sender: resolveMessageDirection(msg, participantProviderId),
          sender_id: msg.sender_id,
          timestamp: msg.timestamp,
          seen: msg.seen,
        }))
        .sort((a, b) =>
          new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime(),
        );

      // Persist in background
      if (acctDbId) {
        persistMessages(acctDbId, chatId, items, participantProviderId).catch(() => {});
      }

      return NextResponse.json({ messages });
    }

    // ── searchProfiles ─────────────────────────────────────────────────────
    if (action === "searchProfiles") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const q = req.nextUrl.searchParams.get("q") ?? "";
      const scope = req.nextUrl.searchParams.get("scope") ?? "all"; // connections | all

      // Strategy 1: LinkedIn URL → direct profile lookup
      const urlMatch = q.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (urlMatch) {
        try {
          const profile = await UnipileClient.getProfile(urlMatch[1], accountId);
          return NextResponse.json({ results: [profile] });
        } catch {
          // Fall through to search
        }
      }

      // Strategy 2: LinkedIn keyword search
      const network = scope === "connections" ? ["F"] : undefined;
      try {
        const results = await UnipileClient.searchLinkedIn(accountId, {
          keywords: q,
          network,
          limit: 15,
        });
        return NextResponse.json({ results: results.items ?? [] });
      } catch {
        return NextResponse.json({ results: [] });
      }
    }

    // ── getUsage ───────────────────────────────────────────────────────────
    if (action === "getUsage") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      const acct = accountRow[0];
      const limits = getLimitsForAccountType(acct.accountType);

      const todayRow = await db
        .select()
        .from(growthOpsDailyUsage)
        .where(
          and(
            eq(growthOpsDailyUsage.linkedinAccountId, acct.id),
            eq(growthOpsDailyUsage.date, today()),
          ),
        )
        .limit(1);

      const t = todayRow[0] ?? { invitesSent: 0, messagesSent: 0, inmailsSent: 0, profileViews: 0 };

      return NextResponse.json({
        accountType: acct.accountType,
        accountTypeLabel: limits.label,
        today: {
          invitesSent: t.invitesSent,
          messagesSent: t.messagesSent,
          inmailsSent: t.inmailsSent,
          profileViews: t.profileViews,
        },
        limits,
      });
    }

    // ── resyncConversations — wipe cached conversations & re-seed from Unipile
    if (action === "resyncConversations") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      const acct = accountRow[0];

      // Delete cached conversations for this account
      await db
        .delete(growthOpsConversations)
        .where(eq(growthOpsConversations.linkedinAccountId, acct.id));

      // Re-seed from Unipile live — paginate up to 250
      const allItems: Awaited<ReturnType<typeof UnipileClient.listChats>>["items"] = [];
      let cursor: string | undefined;
      const RESYNC_LIMIT = 250;
      while (allItems.length < RESYNC_LIMIT) {
        const batch = Math.min(100, RESYNC_LIMIT - allItems.length);
        const page = await UnipileClient.listChats(accountId, { limit: batch, cursor });
        const pageItems = page.items ?? [];
        allItems.push(...pageItems);
        cursor = page.cursor;
        if (!cursor || pageItems.length === 0) break;
      }
      const items = allItems;
      let seeded = 0;

      for (const chat of items) {
        const other = chat.attendees?.find((a) => !a.is_self);
        const participantProviderId =
          other?.attendee_provider_id ?? chat.attendee_provider_id ?? "";
        const rawChatName = chat.name ?? "";
        const chatNameIsGeneric = /^(referral\??|inmail|sponsored|hi|hey|hello|\s*)$/i.test(rawChatName.trim());
        const participantName = other?.attendee_name || (!chatNameIsGeneric ? rawChatName : "") || "";
        const isInmail = chat.content_type === "inmail";
        const lastText = chat.last_message?.text ?? null;
        const lastAt = chat.timestamp ? new Date(chat.timestamp) : null;

        await db
          .insert(growthOpsConversations)
          .values({
            id: randomId(),
            linkedinAccountId: acct.id,
            chatId: chat.id,
            participantProviderId,
            participantName,
            lastMessageAt: lastAt,
            lastMessagePreview: lastText,
            isInmailThread: isInmail,
          })
          .onConflictDoNothing();
        seeded++;
      }

      // Kick off background enrichment
      const convos = await db
        .select()
        .from(growthOpsConversations)
        .where(eq(growthOpsConversations.linkedinAccountId, acct.id))
        .limit(250);
      const toEnrich = convos
        .filter((c) => (!c.participantAvatarUrl || !c.participantName) && c.participantProviderId)
        .map((c) => ({ id: c.id, participantProviderId: c.participantProviderId }));
      if (toEnrich.length > 0) {
        enrichConversations(toEnrich, accountId).catch(() => {});
      }

      return NextResponse.json({ ok: true, seeded, enriching: toEnrich.length });
    }

    // ── legacy: listChats (kept for backward compat) ───────────────────────
    if (action === "listChats") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
      const data = await UnipileClient.listChats(accountId, { cursor });
      return NextResponse.json(data);
    }

    // ── legacy: getChatMessages ────────────────────────────────────────────
    if (action === "getChatMessages") {
      const chatId = req.nextUrl.searchParams.get("chatId") ?? "";
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const data = await UnipileClient.listMessages(chatId, accountId, { limit: 100 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json()) as { action: string; [key: string]: unknown };

  try {
    if (body.action === "generateAuthLink") {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
      const successUrl = `${appUrl}/linkedin-connected`;
      const notifyUrl = `${appUrl}/api/webhooks/unipile`;
      const data = await UnipileClient.generateHostedAuthLink(successUrl, notifyUrl);
      return NextResponse.json(data);
    }

    if (body.action === "generateReconnectLink") {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
      const successUrl = `${appUrl}/linkedin-connected`;
      const notifyUrl = `${appUrl}/api/webhooks/unipile`;
      const data = await UnipileClient.generateReconnectLink(
        body.accountId as string,
        successUrl,
        notifyUrl,
      );
      return NextResponse.json(data);
    }

    if (body.action === "sendMessage") {
      const chatId = body.chatId as string;
      const accountId = body.accountId as string;
      const text = body.text as string;

      // Check daily limit
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (accountRow.length) {
        const acct = accountRow[0];
        const limits = getLimitsForAccountType(acct.accountType);
        const todayRow = await db
          .select()
          .from(growthOpsDailyUsage)
          .where(and(eq(growthOpsDailyUsage.linkedinAccountId, acct.id), eq(growthOpsDailyUsage.date, today())))
          .limit(1);
        if ((todayRow[0]?.messagesSent ?? 0) >= limits.dailyMessages) {
          return NextResponse.json({ error: "Daily message limit reached" }, { status: 429 });
        }

        // Send
        const data = await UnipileClient.sendMessage(chatId, accountId, text);

        // Track usage
        await db
          .insert(growthOpsDailyUsage)
          .values({ id: randomId(), linkedinAccountId: acct.id, date: today(), messagesSent: 1 })
          .onConflictDoUpdate({
            target: [growthOpsDailyUsage.linkedinAccountId, growthOpsDailyUsage.date],
            set: { messagesSent: sql`messages_sent + 1` },
          });

        return NextResponse.json(data);
      }

      // No account row — just send
      const data = await UnipileClient.sendMessage(chatId, accountId, text);
      return NextResponse.json(data);
    }

    if (body.action === "createChat") {
      const accountId = body.accountId as string;
      const text = body.text as string;
      const inmail = body.inmail as boolean | undefined;
      let attendeeProviderId = body.attendeeProviderId as string;
      const publicIdentifier = body.publicIdentifier as string | undefined;

      // Resolve provider_id via profile lookup (BUG #3 from handoff)
      if (publicIdentifier || attendeeProviderId) {
        try {
          const profile = await UnipileClient.getProfile(
            publicIdentifier ?? attendeeProviderId,
            accountId,
          );
          if (profile.provider_id) attendeeProviderId = profile.provider_id;
        } catch {
          // Use original if lookup fails
        }
      }

      // Check limits
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);

      if (accountRow.length) {
        const acct = accountRow[0];
        const limits = getLimitsForAccountType(acct.accountType);

        if (inmail) {
          const todayRow = await db
            .select()
            .from(growthOpsDailyUsage)
            .where(and(eq(growthOpsDailyUsage.linkedinAccountId, acct.id), eq(growthOpsDailyUsage.date, today())))
            .limit(1);
          const monthlyAllowed = Math.ceil(limits.monthlyInmails / 30);
          if ((todayRow[0]?.inmailsSent ?? 0) >= monthlyAllowed) {
            return NextResponse.json({ error: "InMail limit reached" }, { status: 429 });
          }
        }
      }

      // Create chat — CRITICAL: extract chat_id not id
      const chat = await UnipileClient.createChat(accountId, attendeeProviderId, text, { inmail });
      const chatId = chat.chat_id ?? chat.id ?? chat.provider_id ?? "";

      // Cache conversation
      if (accountRow.length && chatId) {
        const acct = accountRow[0];
        await db
          .insert(growthOpsConversations)
          .values({
            id: randomId(),
            linkedinAccountId: acct.id,
            chatId,
            participantProviderId: attendeeProviderId,
            participantName: body.participantName as string ?? "",
            participantHeadline: body.participantHeadline as string ?? null,
            participantAvatarUrl: body.participantAvatarUrl as string ?? null,
            lastMessagePreview: text,
            lastMessageAt: new Date(),
            isInmailThread: !!inmail,
          })
          .onConflictDoNothing();

        // Track usage
        const usageKey = inmail ? { inmailsSent: sql`inmails_sent + 1` } : { messagesSent: sql`messages_sent + 1` };
        await db
          .insert(growthOpsDailyUsage)
          .values({
            id: randomId(),
            linkedinAccountId: acct.id,
            date: today(),
            ...(inmail ? { inmailsSent: 1 } : { messagesSent: 1 }),
          })
          .onConflictDoUpdate({
            target: [growthOpsDailyUsage.linkedinAccountId, growthOpsDailyUsage.date],
            set: usageKey,
          });
      }

      return NextResponse.json({ chatId, chat });
    }

    if (body.action === "resolveUser") {
      const data = await UnipileClient.resolveLinkedInUser(
        body.linkedinUrl as string,
        body.accountId as string,
      );
      return NextResponse.json(data);
    }

    if (body.action === "sendInvite") {
      const data = await UnipileClient.sendInvite(
        body.providerId as string,
        body.accountId as string,
        body.message as string | undefined,
      );
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
