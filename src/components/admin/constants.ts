export const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  expert: { bg: "bg-cos-signal/10", text: "text-cos-signal", label: "Expert" },
  internal: { bg: "bg-cos-slate/10", text: "text-cos-slate", label: "Internal" },
  ambiguous: { bg: "bg-cos-warm/10", text: "text-cos-warm", label: "Ambiguous" },
};

export const SOLUTION_PARTNER_CATEGORIES: Record<string, string> = {
  crm: "CRM",
  marketing_automation: "Marketing Automation",
  ecommerce: "E-Commerce",
  analytics: "Analytics",
  project_management: "Project Management",
  developer_tools: "Developer Tools",
  cloud_infrastructure: "Cloud Infrastructure",
  communication: "Communication",
  design: "Design",
  payments: "Payments",
  customer_support: "Customer Support",
  data_integration: "Data Integration",
  other: "Other",
};
