import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCioCustomerByEmail, getCioMessages } from "@/lib/customerio";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
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
    return NextResponse.json({ messages: [], configured: false, found: false });
  }

  const { userId } = await params;

  const userResult = await db.execute(sql`
    SELECT email FROM users WHERE id = ${userId} LIMIT 1
  `);

  if (userResult.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const email = userResult.rows[0].email as string;
  const cioCustomer = await getCioCustomerByEmail(email);

  if (!cioCustomer) {
    return NextResponse.json({ messages: [], configured: true, found: false });
  }

  const messages = await getCioMessages(cioCustomer.cio_id);

  return NextResponse.json({
    messages,
    configured: true,
    found: true,
    cioAttributes: cioCustomer.attributes ?? null,
  });
}
