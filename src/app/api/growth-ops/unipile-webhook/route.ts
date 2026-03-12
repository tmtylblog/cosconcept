import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { growthOpsLinkedInAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      event?: string;
      account_id?: string;
      account?: { name?: string; provider_id?: string; status?: string };
    };

    const { event, account_id, account } = body;

    if (!account_id) {
      return NextResponse.json({ ok: true });
    }

    if (event === "account.connected" || event === "account.reconnected") {
      // Upsert account
      const existing = await db
        .select()
        .from(growthOpsLinkedInAccounts)
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, account_id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(growthOpsLinkedInAccounts)
          .set({
            status: "OK",
            displayName: account?.name ?? existing[0].displayName,
            linkedinUsername: account?.provider_id ?? existing[0].linkedinUsername,
            updatedAt: new Date(),
          })
          .where(eq(growthOpsLinkedInAccounts.unipileAccountId, account_id));
      } else {
        await db.insert(growthOpsLinkedInAccounts).values({
          id: randomUUID(),
          unipileAccountId: account_id,
          displayName: account?.name ?? "",
          linkedinUsername: account?.provider_id ?? null,
          status: "OK",
        });
      }
    } else if (event === "account.error" || event === "account.disconnected") {
      await db
        .update(growthOpsLinkedInAccounts)
        .set({ status: event === "account.error" ? "ERROR" : "CREDENTIALS", updatedAt: new Date() })
        .where(eq(growthOpsLinkedInAccounts.unipileAccountId, account_id));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Unipile webhook]", err);
    return NextResponse.json({ ok: true }); // always 200 to Unipile
  }
}
