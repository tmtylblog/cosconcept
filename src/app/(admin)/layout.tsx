import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ALL_SECTIONS, type AdminSection } from "@/lib/admin/permissions";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Cpu,
  Handshake,
  Database,
  Globe,
  ArrowLeft,
  Share2,
  FileUp,
  Sparkles,
  Activity,
  Search,
  TrendingUp,
  Lightbulb,
  Phone,
  Shield,
  Linkedin,
  Mail,
  BarChart3,
  Send,
  Target,
  HeartPulse,
  BarChart2,
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

  const roleSlug = session.user.role ?? "";

  // Look up role permissions from DB (fallback to hardcoded check for backwards compat)
  let permissions: string[] = [];
  try {
    const roleRow = await db
      .select({ permissions: adminRoles.permissions, slug: adminRoles.slug })
      .from(adminRoles)
      .where(eq(adminRoles.slug, roleSlug))
      .limit(1);
    if (roleRow.length > 0) {
      permissions = roleRow[0].slug === "superadmin"
        ? (ALL_SECTIONS as unknown as string[])
        : (roleRow[0].permissions as string[]);
    }
  } catch {
    // DB might not have admin_roles table yet — fall back to hardcoded
  }

  // Fallback: if no DB role found, use legacy hardcoded check
  if (permissions.length === 0) {
    const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops", "customer_success"];
    if (!ALLOWED_ROLES.includes(roleSlug)) {
      redirect("/dashboard");
    }
    if (roleSlug === "superadmin") permissions = ALL_SECTIONS as unknown as string[];
    else if (roleSlug === "admin") permissions = ["overview", "platform", "operations", "matching"];
    else if (roleSlug === "growth_ops") permissions = ["overview", "growth_ops"];
    else if (roleSlug === "customer_success") permissions = ["overview", "customer_success"];
  }

  const canSee = (section: AdminSection) => permissions.includes(section);
  const isSuperadmin = roleSlug === "superadmin";
  const canSeeGrowthOps = canSee("growth_ops");
  const canSeeCustomerSuccess = canSee("customer_success");

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
        <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto">
          <AdminNavLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" />

          {isSuperadmin && (
            <>
              <SectionHeader label="Knowledge Graph" />
              <AdminNavLink
                href="/admin/knowledge-graph"
                icon={<Share2 className="h-4 w-4" />}
                label="Knowledge Graph"
                accent
              />

              <SectionHeader label="Platform" />
              <AdminNavLink href="/admin/customers" icon={<Building2 className="h-4 w-4" />} label="Customers" />
              <AdminNavLink href="/admin/staff" icon={<Users className="h-4 w-4" />} label="Staff" />
              <AdminNavLink href="/admin/roles" icon={<Shield className="h-4 w-4" />} label="Roles & Permissions" />

              <SectionHeader label="Operations" />
              <AdminNavLink href="/admin/subscriptions" icon={<CreditCard className="h-4 w-4" />} label="Subscriptions" />
              <AdminNavLink href="/admin/finance" icon={<Cpu className="h-4 w-4" />} label="AI Costs" />
              <AdminNavLink href="/admin/api-health" icon={<Activity className="h-4 w-4" />} label="API Health" />
              <AdminNavLink href="/admin/partnerships" icon={<Handshake className="h-4 w-4" />} label="Partnerships" />

              <SectionHeader label="Matching" />
              <AdminNavLink href="/admin/search" icon={<Search className="h-4 w-4" />} label="Search Test" />
              <AdminNavLink href="/admin/onboarding" icon={<TrendingUp className="h-4 w-4" />} label="Onboarding" />
              <AdminNavLink href="/admin/opportunities" icon={<Lightbulb className="h-4 w-4" />} label="Opportunities" />
              <AdminNavLink href="/admin/calls" icon={<Phone className="h-4 w-4" />} label="Call Transcripts" />
            </>
          )}

          {canSeeGrowthOps && (
            <>
              <SectionHeader label="Growth Ops" />
              <AdminNavLink href="/admin/growth-ops" icon={<TrendingUp className="h-4 w-4" />} label="Overview" />
              <AdminNavLink href="/admin/growth-ops/linkedin" icon={<Linkedin className="h-4 w-4" />} label="LinkedIn Inbox" />
              <AdminNavLink href="/admin/growth-ops/linkedin/accounts" icon={<Users className="h-4 w-4" />} label="LinkedIn Accounts" />
              <AdminNavLink href="/admin/growth-ops/linkedin/campaigns" icon={<Send className="h-4 w-4" />} label="Invite Campaigns" />
              <AdminNavLink href="/admin/growth-ops/linkedin/targets" icon={<Target className="h-4 w-4" />} label="Target Lists" />
              <AdminNavLink href="/admin/growth-ops/instantly" icon={<Mail className="h-4 w-4" />} label="Instantly" />
              <AdminNavLink href="/admin/growth-ops/hubspot" icon={<Share2 className="h-4 w-4" />} label="HubSpot" />
              <AdminNavLink href="/admin/growth-ops/attribution" icon={<BarChart3 className="h-4 w-4" />} label="Attribution" />
            </>
          )}

          {canSeeCustomerSuccess && (
            <>
              <SectionHeader label="Customer Success" />
              <AdminNavLink href="/admin/customer-success/cio" icon={<BarChart2 className="h-4 w-4" />} label="CIO Dashboard" />
              <AdminNavLink href="/admin/customer-success/health" icon={<HeartPulse className="h-4 w-4" />} label="Customer Health" />
            </>
          )}

          {isSuperadmin && (
            <>
              <SectionHeader label="Tools" />
              <AdminNavLink href="/admin/neo4j" icon={<Database className="h-4 w-4" />} label="Neo4j" />
              <AdminNavLink href="/admin/apis" icon={<Globe className="h-4 w-4" />} label="APIs" />
              <AdminNavLink href="/admin/migration" icon={<FileUp className="h-4 w-4" />} label="Data Import" />
              <AdminNavLink href="/admin/enrichment" icon={<Sparkles className="h-4 w-4" />} label="Enrichment" />
            </>
          )}
        </nav>

        <div className="h-px bg-gradient-to-r from-transparent via-cos-border to-transparent" />

        {/* Back link + version */}
        <div className="px-5 py-4 flex items-center justify-between">
          <a
            href="/dashboard"
            className="group flex items-center gap-2 text-xs text-cos-slate transition-colors hover:text-cos-electric"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to App
          </a>
          <span className="text-[10px] text-cos-slate/40 select-none">v1.0</span>
        </div>
      </aside>

      {/* Admin content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="!mt-5 px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light">
      {label}
    </p>
  );
}

function AdminNavLink({
  href,
  icon,
  label,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group flex items-center gap-2.5 rounded-cos-md px-3 py-2 text-sm transition-all ${
        accent
          ? "text-cos-electric font-semibold hover:bg-cos-electric/10"
          : "text-cos-slate-dim hover:bg-cos-electric/5 hover:text-cos-electric"
      }`}
    >
      <span
        className={`transition-colors ${
          accent
            ? "text-cos-electric"
            : "text-cos-slate group-hover:text-cos-electric"
        }`}
      >
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </a>
  );
}
