import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { growthOpsLinkedInAccounts } from "@/lib/db/schema";
import { UnipileClient } from "@/lib/growth-ops/UnipileClient";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || !["superadmin", "admin", "growth_ops"].includes(session.user.role ?? "")) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ?diagnose=true — show raw Unipile accounts vs DB accounts side-by-side
  if (req.nextUrl.searchParams.get("diagnose") === "true") {
    const dbAccounts = await db.select().from(growthOpsLinkedInAccounts).orderBy(growthOpsLinkedInAccounts.createdAt);
    let unipileAccounts: unknown[] = [];
    let unipileError: string | null = null;
    try {
      const live = await UnipileClient.listAccounts();
      const items = live.items ?? [];
      unipileAccounts = await Promise.all(
        items.map(async (acct) => {
          try {
            const detail = await UnipileClient.getAccount(acct.id);
            return { list_data: acct, detail_data: detail };
          } catch (e) {
            return { list_data: acct, detail_error: String(e) };
          }
        })
      );
    } catch (e) {
      unipileError = String(e);
    }
    return NextResponse.json({
      db_accounts: dbAccounts,
      unipile_accounts: unipileAccounts,
      unipile_error: unipileError,
      summary: {
        db_count: dbAccounts.length,
        unipile_count: unipileAccounts.length,
      },
    });
  }

  // ?sync=true — import any Unipile accounts not yet in our DB, enrich display names
  if (req.nextUrl.searchParams.get("sync") === "true") {
    try {
      const live = await UnipileClient.listAccounts();
      const items = live.items ?? [];
      for (const acct of items) {
        // Always fetch individual account for richest data (list endpoint often returns blank names)
        let displayName = acct.name ?? "";
        let linkedinUsername: string | null = null;
        let premiumContractId: string | null = null;
        let premiumFeatures: string[] = [];
        let accountType = "basic";
        try {
          const detail = await UnipileClient.getAccount(acct.id);
          const cp = detail.connection_params;
          displayName =
            detail.name ||
            cp?.full_name ||
            cp?.name ||
            ([cp?.first_name, cp?.last_name].filter(Boolean).join(" ")) ||
            (detail as { username?: string }).username ||
            cp?.username ||
            displayName ||
            "";
          linkedinUsername = (detail as { username?: string }).username ?? cp?.username ?? null;

          // Extract premium/Sales Navigator contract info
          const im = cp?.im;
          if (im) {
            premiumContractId = im.premiumContractId ?? null;
            premiumFeatures = im.premiumFeatures ?? [];
            if (premiumFeatures.includes("sales_navigator")) accountType = "sales_navigator";
            else if (premiumFeatures.includes("recruiter")) accountType = "recruiter";
            else if (premiumFeatures.includes("premium")) accountType = "premium";
          }
        } catch {
          // Use list-level data if individual fetch fails
        }
        await db
          .insert(growthOpsLinkedInAccounts)
          .values({
            id: crypto.randomUUID(),
            unipileAccountId: acct.id,
            displayName: displayName || acct.id,
            linkedinUsername,
            accountType,
            premiumContractId,
            premiumFeatures,
            status: acct.status ?? "OK",
          })
          .onConflictDoUpdate({
            target: growthOpsLinkedInAccounts.unipileAccountId,
            set: {
              status: acct.status ?? "OK",
              displayName: displayName || acct.id,
              ...(linkedinUsername ? { linkedinUsername } : {}),
              accountType,
              premiumContractId,
              premiumFeatures,
              updatedAt: new Date(),
            },
          });
      }
    } catch {
      // Non-fatal — still return what we have in DB
    }
  }

  const accounts = await db.select().from(growthOpsLinkedInAccounts).orderBy(growthOpsLinkedInAccounts.createdAt);
  return NextResponse.json({ accounts });
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as { id: string; status?: string; displayName?: string; notes?: string };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) updates.status = body.status;
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.notes !== undefined) updates.notes = body.notes;
  await db.update(growthOpsLinkedInAccounts)
    .set(updates)
    .where(eq(growthOpsLinkedInAccounts.id, body.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";

  // Look up the Unipile account ID so we can disconnect it there too
  const rows = await db
    .select({ unipileAccountId: growthOpsLinkedInAccounts.unipileAccountId })
    .from(growthOpsLinkedInAccounts)
    .where(eq(growthOpsLinkedInAccounts.id, id))
    .limit(1);

  // Remove from our DB first
  await db.delete(growthOpsLinkedInAccounts).where(eq(growthOpsLinkedInAccounts.id, id));

  // Disconnect from Unipile (non-fatal if it fails — account may already be gone)
  if (rows[0]?.unipileAccountId) {
    try {
      await UnipileClient.deleteAccount(rows[0].unipileAccountId);
    } catch {
      // Non-fatal — Unipile disconnection failure should not block the UI
    }
  }

  return NextResponse.json({ ok: true });
}
