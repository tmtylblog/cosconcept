/**
 * Dev Test User — comprehensive fake data for local development.
 *
 * This module is ONLY used in development (DEV_BYPASS_ONBOARDING=true).
 * It provides a complete, realistic service firm profile with enrichment data,
 * preferences, and classification so all app pages have data to render.
 */

// ─── Test User Credentials ──────────────────────────────────
export const DEV_USER = {
  email: "dev@collectiveos.test",
  password: "devpass2026!",
  name: "Dev Tester",
  role: "superadmin" as const,
};

export const DEV_ORG = {
  name: "Velocity Partners",
  slug: "velocity-partners-dev",
};

export const DEV_FIRM = {
  name: "Velocity Partners",
  website: "https://velocitypartners.io",
  description:
    "A growth-focused digital consultancy specializing in product strategy, " +
    "AI integration, and go-to-market execution for B2B SaaS companies. " +
    "We help scaling startups and mid-market companies accelerate revenue " +
    "through data-driven partnerships and operational excellence.",
  firmType: "boutique_agency" as const,
  sizeBand: "small_11_50" as const,
  profileCompleteness: 0.92,
  entityType: "service_firm" as const,
  enrichmentStatus: "enriched" as const,
  classificationConfidence: 0.91,
  isCosCustomer: true,
};

export const DEV_ENRICHMENT_DATA = {
  url: "https://velocitypartners.io",
  domain: "velocitypartners.io",
  logoUrl: null,
  success: true,
  companyData: {
    name: "Velocity Partners",
    industry: "Management Consulting",
    size: "11-50",
    employeeCount: 34,
    founded: 2019,
    location: "Austin, Texas, United States",
    linkedinUrl: "https://linkedin.com/company/velocity-partners-dev",
    type: "private",
    tags: [
      "B2B",
      "SaaS",
      "Consulting",
      "Digital Transformation",
      "AI Strategy",
    ],
  },
  groundTruth: {
    homepage: {
      url: "https://velocitypartners.io",
      title: "Velocity Partners — Accelerate B2B Growth",
      content: "We help B2B SaaS companies grow faster through strategic partnerships and AI-powered operations.",
      scrapedAt: "2026-03-01T00:00:00Z",
    },
    evidence: [],
    extracted: {
      clients: [
        "Datadog",
        "Notion",
        "Linear",
        "Vercel",
        "Supabase",
        "Resend",
        "Clerk",
        "Neon",
      ],
      caseStudyUrls: [
        "https://velocitypartners.io/case-studies/datadog-partnership",
        "https://velocitypartners.io/case-studies/notion-gtm",
        "https://velocitypartners.io/case-studies/linear-scale",
      ],
      services: [
        "Product Strategy",
        "AI Integration & Automation",
        "Go-to-Market Strategy",
        "Partnership Development",
        "Revenue Operations",
        "Fractional CMO",
        "Data Analytics & BI",
        "UX Research & Design",
      ],
      aboutPitch:
        "Velocity Partners is a growth-focused digital consultancy that " +
        "helps B2B SaaS companies scale through partnerships, AI, and " +
        "operational excellence. Founded in 2019 by a team of ex-HubSpot " +
        "and Salesforce leaders.",
      teamMembers: [
        "Jordan Mitchell — CEO & Co-founder",
        "Priya Sharma — VP of Strategy",
        "Alex Chen — Head of AI & Data",
        "Maya Rodriguez — Creative Director",
        "Sam Park — Head of Partnerships",
      ],
    },
    rawContent: "",
    pageTitles: [
      "Home",
      "About",
      "Services",
      "Case Studies",
      "Team",
      "Contact",
    ],
  },
  extracted: {
    clients: [
      "Datadog",
      "Notion",
      "Linear",
      "Vercel",
      "Supabase",
      "Resend",
      "Clerk",
      "Neon",
    ],
    caseStudyUrls: [
      "https://velocitypartners.io/case-studies/datadog-partnership",
      "https://velocitypartners.io/case-studies/notion-gtm",
      "https://velocitypartners.io/case-studies/linear-scale",
    ],
    services: [
      "Product Strategy",
      "AI Integration & Automation",
      "Go-to-Market Strategy",
      "Partnership Development",
      "Revenue Operations",
      "Fractional CMO",
      "Data Analytics & BI",
      "UX Research & Design",
    ],
    aboutPitch:
      "Velocity Partners is a growth-focused digital consultancy that " +
      "helps B2B SaaS companies scale.",
    teamMembers: [
      "Jordan Mitchell",
      "Priya Sharma",
      "Alex Chen",
      "Maya Rodriguez",
      "Sam Park",
    ],
  },
  classification: {
    categories: [
      "Growth Marketing & Demand Generation",
      "Product Design, Engineering & Development",
      "Data, AI & Machine Learning Services",
      "Fractional & Embedded Leadership",
    ],
    skills: [
      "Product Strategy",
      "AI Strategy",
      "Go-to-Market Strategy",
      "Growth Marketing",
      "Revenue Operations",
      "Data Analytics",
      "UX Research",
      "Partnership Development",
      "Account-Based Marketing",
      "Marketing Automation",
      "CRM Implementation",
      "Business Intelligence",
      "Customer Success Strategy",
      "Brand Positioning",
      "Content Strategy",
    ],
    industries: [
      "Technology & Software",
      "SaaS & Cloud Computing",
      "Financial Services & Fintech",
      "Healthcare & Life Sciences",
      "E-commerce & Retail",
    ],
    markets: [
      "United States",
      "Canada",
      "United Kingdom",
      "Australia",
      "Germany",
    ],
    languages: ["English", "Spanish"],
    firmNature: "service_firm",
    confidence: 0.91,
  },
  pagesScraped: 6,
  evidenceCategories: [
    "services",
    "about",
    "case_studies",
    "team",
    "clients",
  ],
};

export const DEV_PREFERENCES = {
  // v2 interview fields (5 questions)
  partnershipPhilosophy: "breadth",
  capabilityGaps: [
    "Creative, Content & Production",
    "SEO, Paid Media & Performance Marketing",
    "Training, Enablement & Professional Coaching",
  ],
  preferredPartnerTypes: [
    "Creative, Content & Production",
    "SEO, Paid Media & Performance Marketing",
    "Brand Strategy & Positioning",
    "Fractional & Embedded Leadership",
  ],
  dealBreaker: "Poor communication and unreliable timelines",
  geographyPreference: "North America & Europe",
  // v1 legacy fields (for backward compat)
  desiredPartnerServices: [
    "Creative & Brand Design",
    "Performance Marketing",
    "Content Production",
    "Training & Enablement",
  ],
  requiredPartnerIndustries: [
    "Technology & Software",
    "SaaS & Cloud Computing",
    "Financial Services & Fintech",
  ],
  idealPartnerClientSize: [
    "Growth Stage (51-200)",
    "Mid-Market (201-1000)",
    "Enterprise (1000+)",
  ],
  preferredPartnerLocations: [
    "United States",
    "Canada",
    "United Kingdom",
    "Germany",
  ],
  preferredPartnerSize: ["small_11_50", "emerging_51_200", "mid_201_500"],
  // Note: preferredPartnerTypes is already set above (v2 takes precedence over v1)
  idealProjectSize: ["$25K-50K", "$50K-100K", "$100K-250K"],
  typicalHourlyRates: "$175-300/hr",
  partnershipRole: "Lead partner who brings in clients and coordinates delivery",
};

/** Additional team members to seed as org members */
export const DEV_TEAM = [
  { name: "Priya Sharma", email: "priya@velocitypartners.test", role: "admin" as const },
  { name: "Alex Chen", email: "alex@velocitypartners.test", role: "member" as const },
  { name: "Maya Rodriguez", email: "maya@velocitypartners.test", role: "member" as const },
];
