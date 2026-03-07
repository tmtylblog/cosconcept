import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Admin layout — server-side role check using Better Auth's
 * direct API (no internal HTTP fetch, avoids Edge → Serverless issues on Vercel).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    const headersList = await headers();
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

  if (session.user.role !== "superadmin") {
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
