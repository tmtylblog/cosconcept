import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCioCustomerByEmail, getCioMessages } from "@/lib/customerio";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[orgId]/communications
 *
 * Returns Customer.io message history for all members of the org.
 * Looks up each member's CIO customer ID by email, then fetches their messages.
 * Read-only — uses App API only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.CUSTOMERIO_APP_API_KEY) {
    return NextResponse.json({ messages: [], configured: false });
  }

  const { orgId } = await params;

  // Get org member emails
  const membersResult = await db.execute(sql`
    SELECT DISTINCT u.email, u.name
    FROM members m
    JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ${orgId}
      AND u.email IS NOT NULL
    LIMIT 20
  `);

  const memberEmails: { email: string; name: string }[] = (membersResult.rows ?? []).map(
    (r) => ({ email: r.email as string, name: (r.name as string) ?? r.email as string })
  );

  if (memberEmails.length === 0) {
    return NextResponse.json({ messages: [], configured: true, found: 0 });
  }

  // Look up CIO customers in parallel
  const cioCustomers = await Promise.all(
    memberEmails.map(async ({ email, name }) => {
      const customer = await getCioCustomerByEmail(email);
      return { email, name, customer };
    })
  );

  // Fetch messages for each CIO customer in parallel
  const messagesByUser = await Promise.all(
    cioCustomers
      .filter((c) => c.customer !== null)
      .map(async ({ email, name, customer }) => {
        const msgs = await getCioMessages(customer!.cio_id);
        return msgs.map((m) => ({
          ...m,
          userEmail: email,
          userName: name,
        }));
      })
  );

  // Merge and sort by created timestamp (newest first)
  const allMessages = messagesByUser
    .flat()
    .sort((a, b) => b.created - a.created)
    .slice(0, 200); // cap at 200 total

  return NextResponse.json({
    messages: allMessages,
    configured: true,
    found: cioCustomers.filter((c) => c.customer !== null).length,
    total: memberEmails.length,
  });
}
