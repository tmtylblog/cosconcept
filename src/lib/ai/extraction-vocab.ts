/**
 * Shared vocabulary constants for opportunity extraction.
 * Separated from the extractor so they can be imported in both
 * server (AI extractor) and client (settings page) contexts.
 */

// The 30 firm categories — same list used in enrichment classification
export const FIRM_CATEGORIES = [
  "Fractional & Embedded Leadership",
  "Training, Enablement & Professional Coaching",
  "Outsourcing & Managed Business Services",
  "Brand Strategy & Positioning",
  "Creative, Content & Production",
  "Customer Success & Retention",
  "Data, Analytics & Business Intelligence",
  "Market Research & Customer Intelligence",
  "Finance, Accounting & Tax",
  "Human Capital & Talent",
  "People Operations & HR",
  "Privacy, Risk & Compliance",
  "Legal",
  "Growth Marketing & Demand Generation",
  "Lifecycle, CRM & Marketing Operations",
  "Public Relations & Communications",
  "Operations & Process",
  "Change, Transformation & Reengineering",
  "Product Strategy & Innovation",
  "Product Management, UX & Design",
  "Sales Strategy & Enablement",
  "Revenue Operations & Go-To-Market",
  "Strategy & Management Consulting",
  "Technology Strategy & Digital Transformation",
  "Systems Integration & Enterprise Platforms",
  "Software Engineering & Custom Development",
  "AI, Automation & Intelligent Systems",
  "IT Infrastructure & Managed Services",
  "Cybersecurity & Information Security",
];

// Major markets — same vocabulary used in partner preferences
export const MARKETS = [
  "Global",
  "North America",
  "United States",
  "Canada",
  "Europe",
  "United Kingdom",
  "DACH",
  "France",
  "Nordics",
  "Asia Pacific",
  "Australia",
  "Southeast Asia",
  "India",
  "MENA",
  "Latin America",
  "Remote / Virtual",
];
