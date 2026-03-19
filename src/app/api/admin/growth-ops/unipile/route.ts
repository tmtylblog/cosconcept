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
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || !["superadmin", "admin", "growth_ops"].includes(session.user.role ?? "")) return null;
  return session;
}

function randomId() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Helper: enrich conversations with lastMessageIsInbound flag ──────────────

async function addNeedsReplyFlag(
  convos: (typeof growthOpsConversations.$inferSelect)[],
  linkedinAccountId: string,
) {
  if (convos.length === 0) return convos;

  // For each conversation, find the most recent cached message
  const chatIds = convos.map((c) => c.chatId);
  const latestMessages = await db
    .select({
      chatId: growthOpsMessages.chatId,
      isOutbound: growthOpsMessages.isOutbound,
      sentAt: growthOpsMessages.sentAt,
    })
    .from(growthOpsMessages)
    .where(
      and(
        eq(growthOpsMessages.linkedinAccountId, linkedinAccountId),
        inArray(growthOpsMessages.chatId, chatIds),
      ),
    )
    .orderBy(desc(growthOpsMessages.sentAt));

  // Group by chatId — first row per chatId is the latest message
  const latestByChatId = new Map<string, boolean>();
  for (const msg of latestMessages) {
    if (!latestByChatId.has(msg.chatId)) {
      latestByChatId.set(msg.chatId, !msg.isOutbound); // inbound = needs reply
    }
  }

  return convos.map((c) => ({
    ...c,
    lastMessageIsInbound: latestByChatId.get(c.chatId) ?? (c.unreadCount > 0),
  }));
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
              ...(name ? { participantName: name } : {}),
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

// ── Background: full conversation sync (12 months, paginated, rate-limited) ──

const GENERIC_NAME_RE = /^(referral\??|inmail|sponsored|hi|hey|hello|\s*)$/i;
const GENERIC_CHAT_NAMES = new Set(["referral?", "referral", "inmail", "sponsored", "hi", "hey", "hello", ""]);
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const PAGE_DELAY_MS = 1500; // rate-limit delay between Unipile pages
const PAGE_SIZE = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateSyncProgress(
  acctId: string,
  status: "idle" | "syncing" | "done" | "error",
  progress: Record<string, unknown>,
) {
  await db
    .update(growthOpsLinkedInAccounts)
    .set({
      syncStatus: status,
      syncProgress: JSON.stringify(progress),
      ...(status === "syncing" && !progress.continued ? { syncStartedAt: new Date() } : {}),
      ...(status === "done" || status === "error" ? { syncCompletedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(growthOpsLinkedInAccounts.id, acctId));
}

async function runFullConversationSync(
  acctDbId: string,
  unipileAccountId: string,
) {
  const cutoff = Date.now() - TWELVE_MONTHS_MS;
  let cursor: string | undefined;
  let totalSeeded = 0;
  let pages = 0;
  let stopped = false;

  try {
    // Clear existing cached conversations
    await db
      .delete(growthOpsConversations)
      .where(eq(growthOpsConversations.linkedinAccountId, acctDbId));

    await updateSyncProgress(acctDbId, "syncing", { seeded: 0, pages: 0, phase: "fetching" });

    while (!stopped) {
      const page = await UnipileClient.listChats(unipileAccountId, { limit: PAGE_SIZE, cursor });
      const pageItems = page.items ?? [];
      pages++;

      for (const chat of pageItems) {
        // Check if conversation is older than 12 months
        const chatTime = chat.timestamp ? new Date(chat.timestamp).getTime() : 0;
        if (chatTime > 0 && chatTime < cutoff) {
          stopped = true;
          break;
        }

        const other = chat.attendees?.find((a) => !a.is_self);
        const participantProviderId =
          other?.attendee_provider_id ?? chat.attendee_provider_id ?? "";
        const rawChatName = chat.name ?? "";
        const chatNameIsGeneric = GENERIC_NAME_RE.test(rawChatName.trim());
        const participantName = other?.attendee_name || (!chatNameIsGeneric ? rawChatName : "") || "";
        const isInmail = chat.content_type === "inmail";
        const lastText = chat.last_message?.text ?? null;
        const lastAt = chat.timestamp ? new Date(chat.timestamp) : null;

        await db
          .insert(growthOpsConversations)
          .values({
            id: randomId(),
            linkedinAccountId: acctDbId,
            chatId: chat.id,
            participantProviderId,
            participantName,
            lastMessageAt: lastAt,
            lastMessagePreview: lastText,
            isInmailThread: isInmail,
          })
          .onConflictDoNothing();
        totalSeeded++;
      }

      // Update progress after each page
      await updateSyncProgress(acctDbId, "syncing", {
        seeded: totalSeeded,
        pages,
        phase: "fetching",
      });

      cursor = page.cursor;
      if (!cursor || pageItems.length === 0) break;

      // Rate limit
      await sleep(PAGE_DELAY_MS);
    }

    // Phase 2: Enrich missing names/avatars
    await updateSyncProgress(acctDbId, "syncing", {
      seeded: totalSeeded,
      pages,
      phase: "enriching",
    });

    const convos = await db
      .select()
      .from(growthOpsConversations)
      .where(eq(growthOpsConversations.linkedinAccountId, acctDbId));
    const toEnrich = convos
      .filter((c) => (!c.participantAvatarUrl || !c.participantName) && c.participantProviderId)
      .map((c) => ({ id: c.id, participantProviderId: c.participantProviderId }));

    if (toEnrich.length > 0) {
      await enrichConversations(toEnrich, unipileAccountId);
    }

    await updateSyncProgress(acctDbId, "done", {
      seeded: totalSeeded,
      enriched: toEnrich.length,
      pages,
      phase: "complete",
    });

    console.log(`[Unipile] Full sync done for ${unipileAccountId}: ${totalSeeded} conversations, ${pages} pages, ${toEnrich.length} enriched`);
  } catch (err) {
    console.error(`[Unipile] Full sync failed for ${unipileAccountId}:`, err);
    await updateSyncProgress(acctDbId, "error", {
      seeded: totalSeeded,
      pages,
      phase: "error",
      error: err instanceof Error ? err.message : String(err),
    });
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
          const chatNameIsGeneric = GENERIC_NAME_RE.test(rawChatName.trim());
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

      const enrichedConvos = await addNeedsReplyFlag(convos, acct.id);
      return NextResponse.json({ conversations: enrichedConvos });
    }

    // ── syncConversations — re-fetch from Unipile and update DB ────────────
    if (action === "syncConversations") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ conversations: [] });
      const acct = accountRow[0];

      // Fetch live conversations from Unipile
      const live = await UnipileClient.listChats(accountId, { limit: 50 });
      const items = live.items ?? [];

      for (const chat of items) {
        const other = chat.attendees?.find((a) => !a.is_self);
        const participantProviderId =
          other?.attendee_provider_id ?? chat.attendee_provider_id ?? "";
        const rawName = other?.attendee_name ?? chat.name ?? "";
        const participantName = GENERIC_NAME_RE.test(rawName.trim()) ? "" : rawName;
        const isInmail = chat.content_type === "inmail";
        const lastText = chat.last_message?.text ?? null;
        const lastAt = chat.timestamp ? new Date(chat.timestamp) : null;

        // Upsert: insert new or update existing conversations
        const existing = await db
          .select({ id: growthOpsConversations.id, participantName: growthOpsConversations.participantName })
          .from(growthOpsConversations)
          .where(
            and(
              eq(growthOpsConversations.linkedinAccountId, acct.id),
              eq(growthOpsConversations.chatId, chat.id),
            ),
          )
          .limit(1);

        if (existing.length) {
          // Update last message + fix bad names
          const updates: Record<string, unknown> = {
            lastMessagePreview: lastText,
            lastMessageAt: lastAt,
            isInmailThread: isInmail,
            updatedAt: new Date(),
          };
          // Fix name if current name is empty, a generic label, or a raw ID-like string
          const curName = existing[0].participantName ?? "";
          const nameIsBad = !curName
            || GENERIC_CHAT_NAMES.has(curName.toLowerCase().trim())
            || /^[a-zA-Z0-9_-]{15,}$/.test(curName); // looks like a raw ID
          if (nameIsBad && participantName) {
            updates.participantName = participantName;
          }
          if (participantProviderId) {
            updates.participantProviderId = participantProviderId;
          }
          await db
            .update(growthOpsConversations)
            .set(updates)
            .where(eq(growthOpsConversations.id, existing[0].id));
        } else {
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
      }

      // Re-read all conversations
      const convos = await db
        .select()
        .from(growthOpsConversations)
        .where(eq(growthOpsConversations.linkedinAccountId, acct.id))
        .orderBy(desc(growthOpsConversations.lastMessageAt))
        .limit(50);

      // Enrich any that still have bad names or missing avatars
      const toEnrich = convos
        .filter((c) => {
          if (!c.participantProviderId) return false;
          const name = c.participantName ?? "";
          const nameIsBad = !name
            || GENERIC_NAME_RE.test(name.trim())
            || /^[a-zA-Z0-9_-]{15,}$/.test(name);
          return nameIsBad || !c.participantAvatarUrl;
        })
        .map((c) => ({ id: c.id, participantProviderId: c.participantProviderId }));

      if (toEnrich.length > 0) {
        // Run enrichment inline (not background) so response has updated names
        await enrichConversations(toEnrich, accountId);

        // Re-read after enrichment
        const updated = await db
          .select()
          .from(growthOpsConversations)
          .where(eq(growthOpsConversations.linkedinAccountId, acct.id))
          .orderBy(desc(growthOpsConversations.lastMessageAt))
          .limit(50);
        const enrichedUpdated = await addNeedsReplyFlag(updated, acct.id);
        return NextResponse.json({ conversations: enrichedUpdated, synced: items.length, enriched: toEnrich.length });
      }

      const enrichedConvos = await addNeedsReplyFlag(convos, acct.id);
      return NextResponse.json({ conversations: enrichedConvos, synced: items.length, enriched: 0 });
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

    // ── getSyncStatus — poll sync progress for an account ──────────────────
    if (action === "getSyncStatus") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      const acct = accountRow[0];
      let progress = null;
      try { progress = acct.syncProgress ? JSON.parse(acct.syncProgress) : null; } catch { /* ignore */ }
      return NextResponse.json({
        syncStatus: acct.syncStatus,
        progress,
        syncStartedAt: acct.syncStartedAt,
        syncCompletedAt: acct.syncCompletedAt,
      });
    }

    // ── probeOrgMailboxes — try fetching company page conversations ─────────
    if (action === "probeOrgMailboxes") {
      const accountId = req.nextUrl.searchParams.get("accountId") ?? "";
      const results: Record<string, unknown> = {};

      // First, get account details to find org mailbox URNs
      try {
        const acctDetail = await UnipileClient.getAccount(accountId);
        const cp = (acctDetail as Record<string, unknown>).connection_params as Record<string, unknown> | undefined;
        const im = cp?.im as Record<string, unknown> | undefined;
        const orgs = im?.organizations as Array<{ name: string; mailbox_urn: string; organization_urn: string }> | undefined;

        results.account_name = (acctDetail as Record<string, unknown>).name;
        results.organizations = orgs ?? [];

        // Try fetching chats for each org mailbox
        if (orgs && orgs.length > 0) {
          for (const org of orgs) {
            try {
              // Try with mailbox_urn as a filter parameter
              const chatsRes = await fetch(`${process.env.UNIPILE_BASE_URL}/api/v1/chats?account_id=${accountId}&mailbox_urn=${encodeURIComponent(org.mailbox_urn)}&limit=5`, {
                headers: { "X-API-KEY": process.env.UNIPILE_API_KEY!, accept: "application/json" },
                signal: AbortSignal.timeout(15000),
              });
              const chatsData = await chatsRes.json();
              results[`org_${org.name}_mailbox`] = {
                status: chatsRes.status,
                count: (chatsData.items ?? []).length,
                sample: (chatsData.items ?? []).slice(0, 3).map((c: Record<string, unknown>) => ({
                  id: c.id,
                  name: c.name,
                  content_type: c.content_type,
                  timestamp: c.timestamp,
                  attendee: (c.attendees as Array<Record<string, unknown>>)?.[0]?.attendee_name,
                })),
                error: chatsData.error ?? null,
              };
            } catch (err) {
              results[`org_${org.name}_mailbox`] = { error: String(err) };
            }

            // Also try with organization_urn
            try {
              const chatsRes2 = await fetch(`${process.env.UNIPILE_BASE_URL}/api/v1/chats?account_id=${accountId}&organization_urn=${encodeURIComponent(org.organization_urn)}&limit=5`, {
                headers: { "X-API-KEY": process.env.UNIPILE_API_KEY!, accept: "application/json" },
                signal: AbortSignal.timeout(15000),
              });
              const chatsData2 = await chatsRes2.json();
              results[`org_${org.name}_org_urn`] = {
                status: chatsRes2.status,
                count: (chatsData2.items ?? []).length,
                sample: (chatsData2.items ?? []).slice(0, 3).map((c: Record<string, unknown>) => ({
                  id: c.id,
                  name: c.name,
                  content_type: c.content_type,
                  timestamp: c.timestamp,
                  attendee: (c.attendees as Array<Record<string, unknown>>)?.[0]?.attendee_name,
                })),
                error: chatsData2.error ?? null,
              };
            } catch (err) {
              results[`org_${org.name}_org_urn`] = { error: String(err) };
            }
          }
        }

        // Also try regular chats for comparison
        try {
          const regularChats = await UnipileClient.listChats(accountId, { limit: 5 });
          results.regular_chats = {
            count: (regularChats.items ?? []).length,
            sample: (regularChats.items ?? []).slice(0, 3).map((c) => ({
              id: c.id,
              name: c.name,
              content_type: c.content_type,
              timestamp: c.timestamp,
            })),
          };
        } catch (err) {
          results.regular_chats = { error: String(err) };
        }
      } catch (err) {
        results.error = String(err);
      }

      return NextResponse.json(results);
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
    // ── resyncConversations — full 12-month sync, runs in background ─────
    if (body.action === "resyncConversations") {
      const accountId = body.accountId as string;
      if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

      const accountRow = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, accountId))
        .limit(1);
      if (!accountRow.length) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      const acct = accountRow[0];

      // Don't start another sync if one is already running
      if (acct.syncStatus === "syncing") {
        let progress = null;
        try { progress = acct.syncProgress ? JSON.parse(acct.syncProgress) : null; } catch { /* ignore */ }
        return NextResponse.json({ ok: true, alreadySyncing: true, progress });
      }

      // Fire off the full sync in the background (not awaited)
      runFullConversationSync(acct.id, accountId).catch(() => {});

      return NextResponse.json({ ok: true, started: true });
    }

    if (body.action === "generateAuthLink") {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
      const successUrl = `${appUrl}/linkedin-connected`;
      const notifyUrl = `${appUrl}/api/webhooks/unipile`;
      const provider = body.provider === "sales_navigator" ? "LINKEDIN_SALES_NAVIGATOR" as const : "LINKEDIN" as const;
      const data = await UnipileClient.generateHostedAuthLink(successUrl, notifyUrl, provider);
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

    if (body.action === "updateTags") {
      const conversationId = body.conversationId as string;
      const tags = body.tags as string[];
      if (!conversationId || !Array.isArray(tags)) {
        return NextResponse.json({ error: "conversationId and tags[] required" }, { status: 400 });
      }

      await db
        .update(growthOpsConversations)
        .set({ tags, updatedAt: new Date() })
        .where(eq(growthOpsConversations.id, conversationId));

      return NextResponse.json({ ok: true, tags });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
