import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Shield,
  CreditCard,
  Cpu,
  Activity,
  Handshake,
  Search,
  Share2,
  TrendingUp,
  Lightbulb,
  Phone,
  Mail,
  Send,
  BarChart3,
  Settings,
  HeartPulse,
  BarChart2,
  Database,
  Globe,
  FileUp,
  Sparkles,
  FileX,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import type { AdminSection } from "@/lib/admin/permissions";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: boolean;
}

export interface AdminNavSection {
  key: AdminSection;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

/** Standalone top-level link (no section header) */
export const ADMIN_TOP_LINKS: (AdminNavItem & { permissionKey: AdminSection })[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, permissionKey: "overview" },
];

/** Grouped sections — order determines display order */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: "platform",
    label: "Platform",
    icon: Building2,
    items: [
      { href: "/admin/customers", label: "Customers", icon: Building2 },
      { href: "/admin/users", label: "Staff", icon: Users },
      { href: "/admin/roles", label: "Staff Access", icon: Shield },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Activity,
    items: [
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/admin/finance", label: "AI Costs", icon: Cpu },
      { href: "/admin/api-health", label: "API Health", icon: Activity },
      { href: "/admin/partnerships", label: "Partnerships", icon: Handshake },
      { href: "/admin/partnerships/simulator", label: "Partner Simulator", icon: Sparkles },
    ],
  },
  {
    key: "matching",
    label: "Intelligence",
    icon: Search,
    items: [
      { href: "/admin/knowledge-graph", label: "Knowledge Graph", icon: Share2, accent: true },
      { href: "/admin/search", label: "Search Test", icon: Search },
      { href: "/admin/onboarding", label: "Onboarding", icon: TrendingUp },
      { href: "/admin/opportunities", label: "Opportunities", icon: Lightbulb },
      { href: "/admin/calls", label: "Call Transcripts", icon: Phone },
      { href: "/admin/calls/settings", label: "Call Settings", icon: Settings },
    ],
  },
  {
    key: "growth_ops",
    label: "Growth Ops",
    icon: Mail,
    items: [
      { href: "/admin/growth-ops", label: "Inbox", icon: Mail },
      { href: "/admin/growth-ops/crm/companies", label: "Companies", icon: Building2 },
      { href: "/admin/growth-ops/crm/people", label: "People", icon: Users },
      { href: "/admin/growth-ops/pipeline", label: "Pipeline", icon: Share2 },
      { href: "/admin/growth-ops/dashboard", label: "Dashboard", icon: BarChart3 },
      { href: "/admin/growth-ops/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    key: "customer_success",
    label: "Customer Success",
    icon: HeartPulse,
    items: [
      { href: "/admin/customer-success/cio", label: "CIO Dashboard", icon: BarChart2 },
      { href: "/admin/customer-success/health", label: "Customer Health", icon: HeartPulse },
    ],
  },
  {
    key: "tools",
    label: "Dev Tools",
    icon: Database,
    items: [
      { href: "/admin/jobs", label: "Jobs", icon: Activity },
      { href: "/admin/neo4j", label: "Neo4j", icon: Database },
      { href: "/admin/apis", label: "APIs", icon: Globe },
      { href: "/admin/migration", label: "Data Import", icon: FileUp },
      { href: "/admin/enrichment", label: "Enrichment", icon: Sparkles },
      { href: "/admin/data-quality", label: "Data Quality", icon: AlertTriangle },
      { href: "/admin/enrichment/poor-results", label: "Poor CS Results", icon: FileX },
      { href: "/admin/sandbox", label: "Sandbox", icon: FlaskConical },
    ],
  },
];
