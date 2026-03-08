import { headers } from "next/headers";
import { eq, count, sql, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  conversations,
  messages,
  aiUsageLog,
  serviceFirms,
  partnerships,
  memoryEntries,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/stats
 *
 * Returns dashboard metrics for the authenticated user:
 * - Conversation count & message count
 * - AI usage summary (total tokens, total cost)
 * - Firm enrichment status
 * - Partnership count
 * - Memory count
 * - Recent activity
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    // Run all queries in parallel
    const [
      convResult,
      msgResult,
      usageResult,
      firmResult,
      partnerResult,
      memoryResult,
      recentConvs,
    ] = await Promise.all([
      // Conversation count
      db
        .select({ total: count() })
        .from(conversations)
        .where(eq(conversations.userId, userId)),

      // Message count
      db
        .select({ total: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(eq(conversations.userId, userId)),

      // AI usage summary
      db
        .select({
          totalTokens: sql<number>`COALESCE(SUM(${aiUsageLog.inputTokens} + ${aiUsageLog.outputTokens}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
          requestCount: count(),
        })
        .from(aiUsageLog)
        .where(
          organizationId
            ? eq(aiUsageLog.organizationId, organizationId)
            : eq(aiUsageLog.userId, userId)
        ),

      // Firm enrichment status
      organizationId
        ? db
            .select({
              name: serviceFirms.name,
              enrichmentStatus: serviceFirms.enrichmentStatus,
              profileCompleteness: serviceFirms.profileCompleteness,
              website: serviceFirms.website,
            })
            .from(serviceFirms)
            .where(eq(serviceFirms.organizationId, organizationId))
            .limit(1)
        : Promise.resolve([]),

      // Partnership count
      organizationId
        ? db
            .select({ total: count() })
            .from(partnerships)
            .where(
              sql`${partnerships.firmAId} = ${"firm_" + organizationId} OR ${partnerships.firmBId} = ${"firm_" + organizationId}`
            )
        : Promise.resolve([{ total: 0 }]),

      // Memory entries count
      db
        .select({ total: count() })
        .from(memoryEntries)
        .where(eq(memoryEntries.userId, userId)),

      // Recent conversations (last 5)
      db
        .select({
          id: conversations.id,
          title: conversations.title,
          mode: conversations.mode,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt))
        .limit(5),
    ]);

    const firm = firmResult[0] || null;

    return Response.json({
      conversations: convResult[0]?.total ?? 0,
      messages: msgResult[0]?.total ?? 0,
      aiUsage: {
        totalTokens: usageResult[0]?.totalTokens ?? 0,
        totalCost: Number(usageResult[0]?.totalCost ?? 0),
        requests: usageResult[0]?.requestCount ?? 0,
      },
      firm: firm
        ? {
            name: firm.name,
            enrichmentStatus: firm.enrichmentStatus,
            profileCompleteness: firm.profileCompleteness,
            website: firm.website,
          }
        : null,
      partnerships: partnerResult[0]?.total ?? 0,
      memories: memoryResult[0]?.total ?? 0,
      recentConversations: recentConvs,
    });
  } catch (error) {
    console.error("[Dashboard] Stats query failed:", error);
    return Response.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
