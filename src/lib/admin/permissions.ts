/**
 * Admin section permissions.
 *
 * Each key maps to a sidebar section in the admin layout.
 * Roles are granted access by storing these keys in their
 * `permissions` JSONB array.
 */

export const ADMIN_SECTIONS = {
  overview: { label: "Overview", description: "Admin dashboard overview" },
  knowledge_graph: { label: "Knowledge Graph", description: "Graph data and entity management" },
  platform: { label: "Platform", description: "Customers, staff, subscriptions, organizations" },
  operations: { label: "Operations", description: "AI costs, API health, partnerships, finance" },
  matching: { label: "Matching", description: "Search, onboarding, opportunities, call transcripts" },
  growth_ops: { label: "Growth Ops", description: "LinkedIn, campaigns, target lists, attribution" },
  customer_success: { label: "Customer Success", description: "CIO dashboard, customer health" },
  tools: { label: "Tools", description: "Neo4j, APIs, data import, enrichment" },
} as const;

export type AdminSection = keyof typeof ADMIN_SECTIONS;

export const ALL_SECTIONS = Object.keys(ADMIN_SECTIONS) as AdminSection[];

export function hasPermission(permissions: string[], section: AdminSection): boolean {
  return permissions.includes(section);
}

export function hasAnyPermission(permissions: string[], sections: AdminSection[]): boolean {
  return sections.some((s) => permissions.includes(s));
}

/** Built-in role seed data */
export const BUILT_IN_ROLES = [
  {
    id: "role_superadmin",
    slug: "superadmin",
    name: "Super Admin",
    description: "Full platform access — all admin sections",
    icon: "Crown",
    color: "cos-ember",
    permissions: ALL_SECTIONS,
    isBuiltIn: true,
  },
  {
    id: "role_admin",
    slug: "admin",
    name: "Admin",
    description: "Platform and operations management",
    icon: "Shield",
    color: "cos-electric",
    permissions: ["overview", "platform", "operations", "matching"],
    isBuiltIn: true,
  },
  {
    id: "role_growth_ops",
    slug: "growth_ops",
    name: "Growth Ops",
    description: "LinkedIn inbox, campaigns, target lists, attribution",
    icon: "TrendingUp",
    color: "cos-signal",
    permissions: ["overview", "growth_ops"],
    isBuiltIn: true,
  },
  {
    id: "role_customer_success",
    slug: "customer_success",
    name: "Customer Success",
    description: "CIO dashboard and customer health tracking",
    icon: "HeartHandshake",
    color: "cos-warm",
    permissions: ["overview", "customer_success"],
    isBuiltIn: true,
  },
] as const;
