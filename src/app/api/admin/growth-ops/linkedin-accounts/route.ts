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
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ?sync=true — import any Unipile accounts not yet in our DB
  if (req.nextUrl.searchParams.get("sync") === "true") {
    try {
      const live = await UnipileClient.listAccounts();
      const items = live.items ?? [];
      for (const acct of items) {
        await db
          .insert(growthOpsLinkedInAccounts)
          .values({
            id: crypto.randomUUID(),
            unipileAccountId: acct.id,
            displayName: acct.name ?? acct.id,
            status: acct.status ?? "OK",
          })
          .onConflictDoUpdate({
            target: growthOpsLinkedInAccounts.unipileAccountId,
            set: { status: acct.status ?? "OK", displayName: acct.name ?? acct.id, updatedAt: new Date() },
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
  const body = await req.json() as { id: string; status?: string; displayName?: string };
  await db.update(growthOpsLinkedInAccounts)
    .set({ status: body.status, displayName: body.displayName, updatedAt: new Date() })
    .where(eq(growthOpsLinkedInAccounts.id, body.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  await db.delete(growthOpsLinkedInAccounts).where(eq(growthOpsLinkedInAccounts.id, id));
  return NextResponse.json({ ok: true });
}
