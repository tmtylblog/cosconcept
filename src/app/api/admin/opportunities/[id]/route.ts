import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities, serviceFirms, users, callTranscripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { id } = await params;

  const [row] = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      description: opportunities.description,
      evidence: opportunities.evidence,
      signalType: opportunities.signalType,
      priority: opportunities.priority,
      resolutionApproach: opportunities.resolutionApproach,
      requiredCategories: opportunities.requiredCategories,
      requiredSkills: opportunities.requiredSkills,
      requiredIndustries: opportunities.requiredIndustries,
      requiredMarkets: opportunities.requiredMarkets,
      estimatedValue: opportunities.estimatedValue,
      timeline: opportunities.timeline,
      clientDomain: opportunities.clientDomain,
      clientName: opportunities.clientName,
      anonymizeClient: opportunities.anonymizeClient,
      clientSizeBand: opportunities.clientSizeBand,
      source: opportunities.source,
      sourceId: opportunities.sourceId,
      attachments: opportunities.attachments,
      status: opportunities.status,
      createdAt: opportunities.createdAt,
      firmId: opportunities.firmId,
      firmName: serviceFirms.name,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(opportunities)
    .leftJoin(serviceFirms, eq(opportunities.firmId, serviceFirms.id))
    .leftJoin(users, eq(opportunities.createdBy, users.id))
    .where(eq(opportunities.id, id))
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  // If source is "call", fetch transcript preview
  let transcriptPreview: string | null = null;
  if (row.source === "call" && row.sourceId) {
    const [tx] = await db
      .select({ fullText: callTranscripts.fullText })
      .from(callTranscripts)
      .where(eq(callTranscripts.id, row.sourceId))
      .limit(1);
    if (tx?.fullText) {
      transcriptPreview = tx.fullText.slice(0, 800);
    }
  }

  return Response.json({ ...row, transcriptPreview });
}
