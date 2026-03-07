import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Admin layout — server-side role check.
 * The middleware already blocks non-superadmin users from /admin/* routes,
 * but this is a defense-in-depth check.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verify superadmin role via session
  const headersList = await headers();
  const sessionRes = await fetch(
    `${process.env.BETTER_AUTH_URL}/api/auth/get-session`,
    {
      headers: {
        cookie: headersList.get("cookie") ?? "",
      },
    }
  );

  if (!sessionRes.ok) {
    redirect("/login");
  }

  const session = await sessionRes.json();
  if (session?.user?.role !== "superadmin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen bg-cos-cloud">
      {/* Admin sidebar */}
      <aside className="w-56 shrink-0 border-r border-cos-border bg-cos-surface p-4">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-cos-electric">
          Admin Panel
        </h2>
        <nav className="mt-6 space-y-1">
          <AdminNavLink href="/admin" label="Overview" />
          <AdminNavLink href="/admin/users" label="Users" />
          <AdminNavLink href="/admin/organizations" label="Organizations" />
          <AdminNavLink href="/admin/subscriptions" label="Subscriptions" />
        </nav>
        <div className="mt-8 border-t border-cos-border pt-4">
          <a
            href="/dashboard"
            className="text-xs text-cos-slate hover:text-cos-electric"
          >
            Back to App
          </a>
        </div>
      </aside>

      {/* Admin content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function AdminNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block rounded-cos-md px-3 py-2 text-sm text-cos-midnight hover:bg-cos-electric/5 hover:text-cos-electric"
    >
      {label}
    </a>
  );
}
