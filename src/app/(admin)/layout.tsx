import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { BUILT_IN_ROLES } from "@/lib/admin/permissions";
import AdminSidebar from "@/components/admin/admin-sidebar";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];

/**
 * Admin layout — completely separate auth world.
 *
 * If not authenticated or not an admin role, redirects to /admin-login
 * (never to /login or /dashboard — admin is fully isolated from customer app).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();

  // Check session — any failure goes to admin login
  let session;
  try {
    session = await auth.api.getSession({ headers: headersList });
  } catch {
    redirect("/admin-login");
  }

  if (!session?.user) {
    redirect("/admin-login");
  }

  // Role gate — non-admin roles go to admin login (not the customer app)
  const role = session.user.role ?? "";
  if (!ALLOWED_ROLES.includes(role)) {
    // If a sandbox session leaked in, sign it out
    if ((session.user.email ?? "").includes("+sandbox")) {
      try { await auth.api.signOut({ headers: headersList }); } catch { /* best effort */ }
    }
    redirect("/admin-login");
  }

  // Specialized roles: restrict to their section (but always allow /admin overview)
  const isSpecializedRole = role === "growth_ops" || role === "customer_success";
  if (isSpecializedRole) {
    const pathname =
      headersList.get("x-pathname") ??
      headersList.get("x-invoke-path") ??
      "";

    if (pathname && pathname !== "/admin") {
      const allowed =
        (role === "growth_ops" && pathname.startsWith("/admin/growth-ops")) ||
        (role === "customer_success" && pathname.startsWith("/admin/customer-success"));

      if (!allowed) {
        const section = role === "growth_ops" ? "/admin/growth-ops" : "/admin/customer-success";
        redirect(section);
      }
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
