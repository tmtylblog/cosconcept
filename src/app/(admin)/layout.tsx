import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  CreditCard,
  Cpu,
  Handshake,
  Database,
  Globe,
  ArrowLeft,
  UserCheck,
} from "lucide-react";

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
      <aside className="w-60 shrink-0 border-r border-cos-border bg-cos-surface flex flex-col">
        {/* Brand header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-cos-lg bg-cos-electric">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-heading text-sm font-bold text-cos-midnight tracking-tight">
                COS Admin
              </p>
              <p className="text-[10px] text-cos-slate-light font-medium">
                Collective OS
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-cos-border to-transparent" />

        {/* Main nav */}
        <nav className="flex-1 px-3 pt-4 space-y-0.5">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light">
            Platform
          </p>
          <AdminNavLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" />
          <AdminNavLink href="/admin/users" icon={<Users className="h-4 w-4" />} label="Users" />
          <AdminNavLink href="/admin/organizations" icon={<Building2 className="h-4 w-4" />} label="Firm Directory" />
          <AdminNavLink href="/admin/experts" icon={<UserCheck className="h-4 w-4" />} label="Experts" />
          <AdminNavLink href="/admin/clients" icon={<Briefcase className="h-4 w-4" />} label="Clients" />
          <AdminNavLink href="/admin/subscriptions" icon={<CreditCard className="h-4 w-4" />} label="Subscriptions" />
          <AdminNavLink href="/admin/finance" icon={<Cpu className="h-4 w-4" />} label="AI Costs" />
          <AdminNavLink href="/admin/partnerships" icon={<Handshake className="h-4 w-4" />} label="Partnerships" />

          <div className="!mt-5">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light">
              Tools
            </p>
            <AdminNavLink href="/admin/neo4j" icon={<Database className="h-4 w-4" />} label="Neo4j" />
            <AdminNavLink href="/admin/apis" icon={<Globe className="h-4 w-4" />} label="APIs" />
          </div>
        </nav>

        <div className="h-px bg-gradient-to-r from-transparent via-cos-border to-transparent" />

        {/* Back link */}
        <div className="px-5 py-4">
          <a
            href="/dashboard"
            className="group flex items-center gap-2 text-xs text-cos-slate transition-colors hover:text-cos-electric"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to App
          </a>
        </div>
      </aside>

      {/* Admin content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function AdminNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-2.5 rounded-cos-md px-3 py-2 text-sm text-cos-slate-dim transition-all hover:bg-cos-electric/5 hover:text-cos-electric"
    >
      <span className="text-cos-slate transition-colors group-hover:text-cos-electric">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </a>
  );
}
