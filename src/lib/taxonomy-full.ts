/**
 * Full Taxonomy Data — Static reference data for partner sync and Neo4j seeding.
 *
 * Extracts inline data from neo4j-seed.ts into importable constants.
 * Both the seed script and the /api/partner-sync/taxonomy endpoint use these.
 */

// Re-export CSV-based helpers from taxonomy.ts
export {
  getFirmCategories,
  getSkillsL1L2,
  getSkillsL2L3,
  getSkillL1Names,
  getSkillL2Names,
  getMarkets,
  getLanguages,
} from "@/lib/taxonomy";

// ─── Firm Types ───────────────────────────────────────────

export const FIRM_TYPES = [
  { name: "Fractional & Interim", description: "Provides fractional or interim executive leadership" },
  { name: "Staff Augmentation", description: "Supplements client teams with skilled professionals" },
  { name: "Embedded Teams", description: "Places integrated teams within client organizations" },
  { name: "Boutique Agency", description: "Specialized agency with focused expertise" },
  { name: "Project Consulting", description: "Delivers scoped project-based consulting engagements" },
  { name: "Managed Service Provider", description: "Operates ongoing managed services for clients" },
  { name: "Advisory", description: "Provides strategic advisory and guidance" },
  { name: "Global Consulting", description: "Large-scale consulting firm with global reach" },
  { name: "Freelancer Network", description: "Curated network of independent professionals" },
  { name: "Agency Collective", description: "Alliance of agencies collaborating on projects" },
] as const;

// ─── Tech Categories ──────────────────────────────────────

export const TECH_CATEGORIES = [
  { name: "CRM", slug: "crm", description: "Customer relationship management platforms" },
  { name: "Marketing Automation", slug: "marketing_automation", description: "Marketing automation and campaign platforms" },
  { name: "E-Commerce", slug: "ecommerce", description: "E-commerce platforms and storefronts" },
  { name: "Analytics & BI", slug: "analytics", description: "Analytics, business intelligence, and reporting tools" },
  { name: "Project Management", slug: "project_management", description: "Project and work management platforms" },
  { name: "Developer Tools", slug: "developer_tools", description: "Developer tooling, IDEs, and code platforms" },
  { name: "Cloud Infrastructure", slug: "cloud_infrastructure", description: "Cloud platforms and infrastructure services" },
  { name: "Communication & Collaboration", slug: "communication", description: "Team communication and collaboration tools" },
  { name: "Design & Creative", slug: "design", description: "Design, creative, and prototyping tools" },
  { name: "Payments & Fintech", slug: "payments", description: "Payment processing and financial technology platforms" },
  { name: "Customer Support", slug: "customer_support", description: "Customer support and helpdesk platforms" },
  { name: "Data Integration & ETL", slug: "data_integration", description: "Data integration, ETL, and pipeline tools" },
  { name: "Other", slug: "other", description: "Other technology platforms and tools" },
] as const;

// ─── Service Categories & Services ────────────────────────

export const SERVICE_CATEGORIES = [
  { name: "Strategy & Advisory", description: "Strategic planning, advisory, and positioning services" },
  { name: "Marketing & Growth", description: "Marketing, demand generation, and growth services" },
  { name: "Technology & Engineering", description: "Software development, infrastructure, and engineering services" },
  { name: "Design & Creative", description: "Brand design, UX, and creative production services" },
  { name: "Sales & Revenue", description: "Sales enablement, revenue operations, and CRM services" },
  { name: "Operations & Finance", description: "Financial management, process optimization, and operations services" },
  { name: "People & Talent", description: "HR, talent acquisition, and people operations services" },
  { name: "Data & Analytics", description: "Data strategy, BI, and analytics services" },
] as const;

export const SERVICES_BY_CATEGORY: Record<string, string[]> = {
  "Strategy & Advisory": [
    "Go-to-Market Strategy", "Business Strategy", "Brand Positioning",
    "Market Research", "Competitive Analysis", "Product Strategy", "Partnership Strategy",
  ],
  "Marketing & Growth": [
    "Content Marketing", "Demand Generation", "SEO & SEM", "Social Media Marketing",
    "Email Marketing", "Performance Marketing", "Marketing Operations", "Account-Based Marketing",
  ],
  "Technology & Engineering": [
    "Software Development", "Web Development", "Mobile Development", "DevOps & Infrastructure",
    "System Integration", "API Development", "Data Engineering", "QA & Testing",
  ],
  "Design & Creative": [
    "Brand Identity Design", "UI/UX Design", "Graphic Design", "Motion Design",
    "Copywriting", "Photography & Video", "Design Systems",
  ],
  "Sales & Revenue": [
    "Sales Enablement", "Sales Training", "Revenue Operations", "CRM Implementation",
    "Sales Playbook Development", "Pipeline Management",
  ],
  "Operations & Finance": [
    "Financial Planning & Analysis", "Accounting & Bookkeeping", "Process Optimization",
    "Project Management", "Change Management", "Procurement",
  ],
  "People & Talent": [
    "Talent Acquisition", "HR Strategy", "Learning & Development",
    "Compensation & Benefits", "Culture & Engagement", "Executive Coaching",
  ],
  "Data & Analytics": [
    "Data Strategy", "Business Intelligence", "Data Visualization",
    "Analytics Implementation", "Data Governance", "Machine Learning & AI",
  ],
};

// ─── Industry Hierarchy ───────────────────────────────────

export const INDUSTRY_HIERARCHY: Record<string, string[]> = {
  "Technology": ["SaaS", "Enterprise Software", "Developer Tools", "Cybersecurity", "AI & Machine Learning", "Cloud Computing", "IoT", "AR/VR"],
  "Financial Services": ["FinTech", "Banking", "Insurance", "InsurTech", "WealthTech", "Payments", "RegTech"],
  "Healthcare": ["HealthTech", "Pharmaceuticals", "Biotech", "Medical Devices", "Digital Health", "Mental Health Tech"],
  "E-Commerce & Retail": ["E-Commerce", "Retail", "Consumer Goods", "CPG", "Fashion & Apparel", "Beauty & Cosmetics", "Food & Beverage"],
  "Media & Entertainment": ["Media", "Entertainment", "Gaming", "Sports", "Music", "Video & Streaming"],
  "Education": ["EdTech", "Higher Education", "K-12", "Corporate Training", "Online Learning"],
  "Real Estate & Construction": ["PropTech", "Real Estate", "Construction", "Facilities Management"],
  "Energy & Environment": ["CleanTech", "Renewables", "Energy", "Oil & Gas", "Utilities", "Sustainability"],
  "Transportation & Logistics": ["Logistics & Supply Chain", "Transportation", "Mobility", "Autonomous Vehicles"],
  "Professional Services": ["Management Consulting", "Legal Services", "Accounting", "HR & Recruiting", "Marketing Services", "PR & Communications"],
  "Government & Nonprofit": ["Government", "Public Sector", "Nonprofit", "Social Impact"],
  "Food & Agriculture": ["FoodTech", "Agriculture", "Restaurant Tech"],
  "Manufacturing & Industrial": ["Manufacturing", "Automotive", "Aerospace & Defense", "Industrial IoT"],
  "Travel & Hospitality": ["Travel & Tourism", "Hospitality", "Short-Term Rentals"],
  "Marketing Technology": ["MarTech", "AdTech", "Customer Experience", "Sales Technology"],
};

// ─── Market Hierarchy ─────────────────────────────────────

export const MARKET_HIERARCHY: Record<string, { name: string; isoCode: string }[]> = {
  "North America": [
    { name: "United States", isoCode: "US" },
    { name: "Canada", isoCode: "CA" },
    { name: "Mexico", isoCode: "MX" },
  ],
  "Latin America": [
    { name: "Brazil", isoCode: "BR" },
    { name: "Argentina", isoCode: "AR" },
    { name: "Colombia", isoCode: "CO" },
    { name: "Chile", isoCode: "CL" },
    { name: "Peru", isoCode: "PE" },
  ],
  "Europe": [
    { name: "United Kingdom", isoCode: "GB" },
    { name: "Germany", isoCode: "DE" },
    { name: "France", isoCode: "FR" },
    { name: "Netherlands", isoCode: "NL" },
    { name: "Sweden", isoCode: "SE" },
    { name: "Spain", isoCode: "ES" },
    { name: "Italy", isoCode: "IT" },
    { name: "Switzerland", isoCode: "CH" },
    { name: "Belgium", isoCode: "BE" },
    { name: "Denmark", isoCode: "DK" },
    { name: "Norway", isoCode: "NO" },
    { name: "Finland", isoCode: "FI" },
    { name: "Austria", isoCode: "AT" },
    { name: "Portugal", isoCode: "PT" },
    { name: "Ireland", isoCode: "IE" },
    { name: "Poland", isoCode: "PL" },
  ],
  "Asia Pacific": [
    { name: "Australia", isoCode: "AU" },
    { name: "Singapore", isoCode: "SG" },
    { name: "Japan", isoCode: "JP" },
    { name: "India", isoCode: "IN" },
    { name: "South Korea", isoCode: "KR" },
    { name: "New Zealand", isoCode: "NZ" },
    { name: "Hong Kong", isoCode: "HK" },
    { name: "China", isoCode: "CN" },
    { name: "Taiwan", isoCode: "TW" },
  ],
  "Middle East & Africa": [
    { name: "United Arab Emirates", isoCode: "AE" },
    { name: "Saudi Arabia", isoCode: "SA" },
    { name: "Israel", isoCode: "IL" },
    { name: "South Africa", isoCode: "ZA" },
    { name: "Nigeria", isoCode: "NG" },
    { name: "Kenya", isoCode: "KE" },
    { name: "Egypt", isoCode: "EG" },
  ],
};

// ─── Language ISO Codes ───────────────────────────────────

export const LANGUAGE_ISO_MAP: Record<string, string> = {
  "English": "en", "Spanish": "es", "French": "fr", "German": "de",
  "Portuguese": "pt", "Italian": "it", "Dutch": "nl", "Russian": "ru",
  "Japanese": "ja", "Korean": "ko", "Mandarin Chinese": "zh", "Cantonese": "yue",
  "Arabic": "ar", "Hindi": "hi", "Bengali": "bn", "Urdu": "ur",
  "Turkish": "tr", "Polish": "pl", "Czech": "cs", "Romanian": "ro",
  "Hungarian": "hu", "Greek": "el", "Swedish": "sv", "Norwegian": "no",
  "Danish": "da", "Finnish": "fi", "Thai": "th", "Vietnamese": "vi",
  "Indonesian": "id", "Malay": "ms", "Filipino": "fil", "Hebrew": "he",
  "Persian": "fa", "Swahili": "sw", "Ukrainian": "uk", "Croatian": "hr",
  "Serbian": "sr", "Bulgarian": "bg", "Slovak": "sk", "Slovenian": "sl",
  "Estonian": "et", "Latvian": "lv", "Lithuanian": "lt", "Catalan": "ca",
  "Basque": "eu", "Galician": "gl", "Afrikaans": "af", "Tamil": "ta",
  "Telugu": "te", "Marathi": "mr", "Gujarati": "gu", "Punjabi": "pa",
  "Kannada": "kn", "Malayalam": "ml", "Sinhala": "si", "Nepali": "ne",
  "Burmese": "my", "Khmer": "km", "Lao": "lo", "Mongolian": "mn",
  "Georgian": "ka", "Armenian": "hy", "Azerbaijani": "az", "Kazakh": "kk",
  "Uzbek": "uz", "Amharic": "am", "Yoruba": "yo", "Igbo": "ig",
  "Hausa": "ha", "Zulu": "zu", "Xhosa": "xh", "Somali": "so",
  "Pashto": "ps", "Kurdish": "ku", "Icelandic": "is", "Maltese": "mt",
  "Albanian": "sq", "Macedonian": "mk", "Bosnian": "bs", "Luxembourgish": "lb",
};

// ─── Base Industries (flat list for simple seeding) ───────

export const BASE_INDUSTRIES = [
  "Technology", "SaaS", "E-commerce", "Financial Services", "Banking",
  "Insurance", "Healthcare", "Pharmaceuticals", "Biotech", "Medical Devices",
  "Retail", "Consumer Goods", "CPG", "Food & Beverage", "Hospitality",
  "Travel & Tourism", "Real Estate", "Construction", "Manufacturing",
  "Automotive", "Aerospace & Defense", "Energy", "Oil & Gas", "Renewables",
  "Utilities", "Telecommunications", "Media & Entertainment", "Gaming",
  "Education", "EdTech", "Government", "Public Sector", "Nonprofit",
  "Legal Services", "Professional Services", "Logistics & Supply Chain",
  "Agriculture", "Mining", "Fashion & Apparel", "Beauty & Cosmetics",
  "Sports & Fitness", "Cannabis", "Crypto & Blockchain", "AI & Machine Learning",
  "Cybersecurity", "Cloud Computing", "FinTech", "HealthTech", "PropTech",
  "FoodTech", "CleanTech", "MarTech", "AdTech", "HRTech", "LegalTech",
  "InsurTech", "RegTech", "WealthTech",
] as const;
