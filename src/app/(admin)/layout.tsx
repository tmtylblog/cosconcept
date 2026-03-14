import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { BUILT_IN_ROLES } from "@/lib/admin/permissions";
import AdminSidebar from "@/components/admin/admin-sidebar";

/**
 * Admin layout — server-side role check + permission resolution.
 * Renders the collapsible sidebar (client component) with the user's permissions.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  const headersList = await headers();
  try {
    session = await auth.api.getSession({
      headers: headersList,
    });
  } catch (error) {
    console.error("[Admin] Session check failed:", error);
    redirect("/login");
  }

  if (!session?.user) {
    redirect("/login");
  }

  const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];
  if (!ALLOWED_ROLES.includes(session.user.role ?? "")) {
    redirect("/dashboard");
  }

  const role = session.user.role ?? "";
  const isSpecializedRole = role === "growth_ops" || role === "customer_success";

  // Route-level protection: specialized roles can only access their sections
  if (isSpecializedRole) {
    const pathname =
      headersList.get("x-pathname") ??
      headersList.get("x-invoke-path") ??
      "";

    const allowedPrefixes: string[] = [];
    if (role === "growth_ops") allowedPrefixes.push("/admin/growth-ops");
    if (role === "customer_success") allowedPrefixes.push("/admin/customer-success");

    const isAllowed =
      allowedPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (pathname && !isAllowed) {
      redirect(allowedPrefixes[0] ?? "/dashboard");
    }
  }

  // Resolve permissions from DB role, falling back to built-in defaults
  let permissions: string[] = [];
  try {
    const [dbRole] = await db
      .select({ permissions: adminRoles.permissions })
      .from(adminRoles)
      .where(eq(adminRoles.slug, role))
      .limit(1);
    permissions = (dbRole?.permissions as string[]) ?? [];
  } catch {
    // DB query failed — fall through to built-in fallback
  }
  if (permissions.length === 0) {
    const builtIn = BUILT_IN_ROLES.find((r) => r.slug === role);
    permissions = builtIn ? [...builtIn.permissions] : [];
  }

  return (
    <div className="flex min-h-screen bg-cos-cloud">
      <AdminSidebar permissions={permissions} userName={session.user.name ?? undefined} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
