import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmCaseStudies, members } from "@/lib/db/schema";
import { CaseStudyDetailView } from "@/components/firm/case-study-detail-view";

export default async function CaseStudyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { id } = await params;

  // Fetch the case study
  const [caseStudy] = await db
    .select()
    .from(firmCaseStudies)
    .where(eq(firmCaseStudies.id, id))
    .limit(1);

  if (!caseStudy || caseStudy.status === "deleted") notFound();

  // Verify the user belongs to the firm's org
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, session.user.id),
        eq(members.organizationId, caseStudy.organizationId)
      )
    )
    .limit(1);

  if (!membership) notFound();

  return <CaseStudyDetailView caseStudy={caseStudy} />;
}
