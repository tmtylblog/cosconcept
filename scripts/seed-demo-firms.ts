/**
 * Seed script: inserts 100 demo service firms with "Test" prefix.
 * These firms populate the Discover search results for testing.
 *
 * Usage:  npx tsx scripts/seed-demo-firms.ts
 *
 * Cleanup: npx tsx scripts/cleanup-demo-firms.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import {
  organizations,
  serviceFirms,
  partnerPreferences,
  abstractionProfiles,
} from "../src/lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ─── Taxonomy Data ──────────────────────────────────────

const CATEGORIES = [
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
  "Industry & Applied Engineering",
];

// Skills relevant to each category (maps category index → skill pool)
const CATEGORY_SKILLS: Record<number, string[]> = {
  0: ["Business Leadership", "Business Strategy", "People Management", "Business Consulting", "Performance Management"],
  1: ["Training Programs", "Instructional and Curriculum Design", "Program Management", "Employee Training", "Business Communications"],
  2: ["Business Operations", "Process Improvement and Optimization", "Project Management", "Business Solutions", "Business Management"],
  3: ["Brand Management", "Marketing Strategy and Techniques", "Creative Design", "Market Analysis", "Digital Marketing"],
  4: ["Creative Design", "Digital Design", "Content Development and Management", "Media Production", "Photo/Video Production and Technology"],
  5: ["Customer Relationship Management (CRM)", "Customer Service", "Client Support", "Business Analysis", "Account Management"],
  6: ["Data Analysis", "Business Intelligence", "Data Visualization", "Data Science", "Statistics"],
  7: ["Market Analysis", "Business Analysis", "Data Analysis", "Business Intelligence", "Social Studies"],
  8: ["Financial Accounting", "Financial Analysis", "Tax", "Financial Reporting", "Budget Management"],
  9: ["Recruitment", "Human Resources Management and Planning", "Compensation and Benefits", "Employee Relations", "People Management"],
  10: ["Human Resources Management and Planning", "Compensation and Benefits", "Employee Relations", "Payroll", "Employee Training"],
  11: ["Regulation and Legal Compliance", "Risk Management", "Auditing", "Quality Assurance and Control", "Internal Controls"],
  12: ["Legal Proceedings", "Legal Support", "Contract Management", "Regulation and Legal Compliance", "Property Law"],
  13: ["Digital Marketing", "Advertising", "Social Media", "Web Analytics and SEO", "Promotions and Campaigns"],
  14: ["Customer Relationship Management (CRM)", "Marketing Software", "Marketing Strategy and Techniques", "Digital Marketing", "Data Analysis"],
  15: ["Public Relations", "Communication", "Writing and Editing", "Content Development and Management", "Social Media"],
  16: ["Process Improvement and Optimization", "Project Management", "Business Operations", "Business Management", "Business Analysis"],
  17: ["Business Strategy", "Project Management", "Process Improvement and Optimization", "Business Consulting", "Performance Management"],
  18: ["Product Management", "Business Strategy", "Market Analysis", "Business Analysis", "User Interface and User Experience (UI/UX) Design"],
  19: ["User Interface and User Experience (UI/UX) Design", "Product Management", "Digital Design", "Creative Design", "Graphic and Visual Design"],
  20: ["Business-to-Business (B2B) Sales", "Sales Management", "Account Management", "Prospecting and Qualification", "General Sales Practices"],
  21: ["Sales Management", "Business Operations", "Customer Relationship Management (CRM)", "Data Analysis", "Business Strategy"],
  22: ["Business Strategy", "Business Consulting", "Business Analysis", "Business Leadership", "Performance Management"],
  23: ["Cloud Computing", "IT Management", "Business Strategy", "System Design and Implementation", "Software Development"],
  24: ["System Design and Implementation", "Enterprise Application Management", "Cloud Solutions", "IT Management", "Software Development"],
  25: ["Software Development", "Agile Software Development", "JavaScript and jQuery", "Web Design and Development", "Cloud Computing"],
  26: ["Artificial Intelligence and Machine Learning (AI/ML)", "Data Science", "Natural Language Processing (NLP)", "Software Development", "IT Automation"],
  27: ["IT Management", "Cloud Computing", "Systems Administration", "Servers", "Cybersecurity"],
  28: ["Cybersecurity", "Identity and Access Management", "Malware Protection", "Risk Management", "Regulation and Legal Compliance"],
  29: ["Engineering Practices", "Project Management", "Manufacturing Design", "Product Development", "Simulation and Simulation Software"],
};

const INDUSTRIES = [
  "Healthcare", "Financial Services", "SaaS", "E-commerce", "Manufacturing",
  "Real Estate", "Education", "Retail", "Media & Entertainment", "Telecommunications",
  "Energy & Utilities", "Government", "Non-Profit", "Insurance", "Automotive",
  "Hospitality", "Logistics & Supply Chain", "Agriculture", "Pharmaceuticals", "Technology",
];

const MARKETS = [
  "United States", "Canada", "United Kingdom", "Australia", "Germany",
  "France", "Netherlands", "Singapore", "Brazil", "Mexico",
  "Japan", "India", "South Africa", "UAE", "Sweden",
];

const SIZE_BANDS = [
  "micro_1_10", "micro_1_10", "micro_1_10",     // 30%
  "small_11_50", "small_11_50", "small_11_50", "small_11_50", // ~35%
  "emerging_51_200", "emerging_51_200",           // 20%
  "mid_201_500",                                  // 10%
  "large_1001_5000",                              // 5%
] as const;

const FIRM_TYPES = [
  "boutique_agency", "boutique_agency", "boutique_agency", "boutique_agency", "boutique_agency",  // 25%
  "project_consulting", "project_consulting", "project_consulting", "project_consulting",          // 20%
  "staff_augmentation", "staff_augmentation", "staff_augmentation",                                // 15%
  "advisory", "advisory", "advisory",                                                              // 15%
  "fractional_interim", "fractional_interim",                                                      // 10%
  "managed_service_provider", "embedded_teams", "agency_collective",                               // 15%
] as const;

const EMPLOYEE_COUNTS: Record<string, number> = {
  micro_1_10: 6,
  small_11_50: 28,
  emerging_51_200: 110,
  mid_201_500: 320,
  large_1001_5000: 2200,
};

const CITIES = [
  "New York, NY, United States", "San Francisco, CA, United States", "Los Angeles, CA, United States",
  "Chicago, IL, United States", "Austin, TX, United States", "Boston, MA, United States",
  "Miami, FL, United States", "Seattle, WA, United States", "Denver, CO, United States",
  "London, United Kingdom", "Toronto, Canada", "Sydney, Australia",
  "Berlin, Germany", "Amsterdam, Netherlands", "Singapore, Singapore",
  "Portland, OR, United States", "Atlanta, GA, United States", "Nashville, TN, United States",
  "Minneapolis, MN, United States", "Washington, DC, United States",
];

const RATE_RANGES = [
  "$75-125/hr", "$100-175/hr", "$125-200/hr", "$150-250/hr",
  "$175-300/hr", "$200-350/hr", "$250-400/hr", "$300-500/hr",
];

const PROJECT_SIZES = [
  ["$10K-25K"], ["$25K-50K"], ["$50K-100K"], ["$100K-250K"],
  ["$25K-75K"], ["$50K-150K"], ["$100K-500K"], ["$250K-1M"],
];

const PARTNERSHIP_ROLES = [
  "Lead partner — we typically lead engagements and bring in specialists",
  "Specialist — we provide deep expertise on specific workstreams",
  "Flexible — we can lead or support depending on the engagement",
  "Co-delivery — we prefer equal partnerships on shared projects",
];

const CLIENT_SIZE_OPTIONS = [
  ["Startups (1-50)", "SMB (51-500)"],
  ["SMB (51-500)", "Mid-Market (501-5000)"],
  ["Mid-Market (501-5000)", "Enterprise (5000+)"],
  ["Startups (1-50)", "SMB (51-500)", "Mid-Market (501-5000)"],
  ["SMB (51-500)", "Mid-Market (501-5000)", "Enterprise (5000+)"],
];

// ─── Name Generation ────────────────────────────────────

const PREFIXES = [
  "Apex", "Nimble", "Catalyst", "Pinnacle", "Velocity", "Horizon",
  "Summit", "Ember", "Forge", "Atlas", "Prism", "Zenith", "Vanguard",
  "Spark", "Bridge", "Keystone", "Lighthouse", "Mosaic", "Nova",
  "Quantum", "Ripple", "Skyline", "Torch", "Vertex", "Wavelength",
  "Evergreen", "Pacific", "Sterling", "Meridian", "Compass",
  "Clarity", "Insight", "Ascent", "Bloom", "Canyon", "Delta",
  "Echo", "Falcon", "Grove", "Ivy", "Junction", "Kinetic",
  "Lumen", "Nexus", "Orbit", "Pulse", "Quartz", "River",
  "Sierra", "Tidal",
];

const SUFFIXES = [
  "Strategy Group", "Consulting", "Partners", "Advisory", "Agency",
  "Solutions", "Collective", "Labs", "Studio", "Associates",
  "Group", "Ventures", "Works", "Digital", "Creative",
  "Co", "Advisors", "Hub", "Strategies", "Growth",
];

const FAKE_CLIENTS = [
  "Acme Corp", "Globex Inc", "Initech", "Hooli", "Pied Piper",
  "Massive Dynamic", "Stark Industries", "Wayne Enterprises", "Umbrella Corp", "Cyberdyne Systems",
  "Weyland Corp", "Soylent Corp", "Tyrell Corp", "OsCorp", "LexCorp",
  "Dunder Mifflin", "Bluth Company", "Prestige Worldwide", "Wernham Hogg", "Vandelay Industries",
  "Monsters Inc", "Nakatomi Trading", "Wonka Industries", "Gringotts Bank", "Capsule Corp",
  "Primatech Paper", "Axiom Corp", "Ellingson Mineral", "Oceanic Airlines", "Buy More",
  "Krusty Burger Inc", "Sabre Corp", "Vought International", "Dharma Initiative", "Sterling Cooper",
  "Lacuna Inc", "Rekall Corp", "InGen Corp", "Oscorp Industries", "Planet Express",
];

// ─── Helpers ────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function generateNarrative(
  firmName: string,
  categories: string[],
  skills: string[],
  industries: string[],
  services: string[],
  clients: string[],
  location: string,
  sizeBand: string,
): string {
  const sizeLabel = sizeBand.replace(/_/g, " ").replace(/\d+/g, m => m);
  return `${firmName} is a ${pick(["leading", "specialized", "boutique", "innovative", "established"])} professional services firm based in ${location}. ` +
    `The firm specializes in ${categories.slice(0, 2).join(" and ")}, offering services including ${services.slice(0, 4).join(", ")}. ` +
    `Their core capabilities span ${skills.slice(0, 5).join(", ")}. ` +
    `They serve clients across the ${industries.slice(0, 3).join(", ")} sectors, ` +
    `with notable engagements for organizations like ${clients.slice(0, 3).join(", ")}. ` +
    `As a ${sizeLabel} firm, they bring ${pick(["deep expertise", "agile delivery", "strategic thinking", "hands-on execution", "cross-functional capabilities"])} ` +
    `to every engagement. Their approach combines ${pick(["data-driven insights", "industry best practices", "innovative methodologies", "proven frameworks"])} ` +
    `with ${pick(["personalized attention", "scalable processes", "cutting-edge technology", "collaborative partnerships"])} to deliver measurable outcomes. ` +
    `Known for their work in ${industries[0]}, they have built a reputation for ${pick(["transformative results", "sustainable growth", "operational excellence", "strategic innovation"])}.`;
}

// ─── Firm Generation ────────────────────────────────────

interface DemoFirm {
  orgId: string;
  firmId: string;
  prefId: string;
  absId: string;
  name: string;
  slug: string;
  website: string;
  description: string;
  location: string;
  sizeBand: (typeof SIZE_BANDS)[number];
  firmType: (typeof FIRM_TYPES)[number];
  categories: string[];
  skills: string[];
  industries: string[];
  markets: string[];
  services: string[];
  clients: string[];
  narrative: string;
  employeeCount: number;
  rate: string;
  projectSize: string[];
  clientSizes: string[];
  partnerRole: string;
}

function generateFirms(count: number): DemoFirm[] {
  const usedNames = new Set<string>();
  const firms: DemoFirm[] = [];

  // Ensure category distribution — each category gets at least 3 firms
  const categoryAssignments: number[] = [];
  for (let c = 0; c < 30; c++) {
    categoryAssignments.push(c, c, c); // 3 each = 90
  }
  // Fill remaining 10 with weighted picks (Strategy, Marketing, Software, Product heavier)
  const heavyCategories = [22, 13, 25, 18, 3, 26, 23, 19, 0, 4]; // indices
  for (let i = 0; i < count - 90; i++) {
    categoryAssignments.push(heavyCategories[i % heavyCategories.length]);
  }
  // Shuffle
  categoryAssignments.sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    // Generate unique name
    let name: string;
    do {
      name = `Test ${pick(PREFIXES)} ${pick(SUFFIXES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const slug = slugify(name);
    const domain = `${slug}.com`;
    const primaryCatIdx = categoryAssignments[i];
    const primaryCat = CATEGORIES[primaryCatIdx];

    // Pick 1-2 secondary categories
    const secondaryCats = pickN(
      CATEGORIES.filter((_, idx) => idx !== primaryCatIdx),
      Math.random() > 0.6 ? 2 : 1
    );
    const categories = [primaryCat, ...secondaryCats];

    // Skills from primary + secondary categories
    const primarySkills = CATEGORY_SKILLS[primaryCatIdx] || [];
    const secondarySkillPools = secondaryCats.flatMap(
      (c) => CATEGORY_SKILLS[CATEGORIES.indexOf(c)] || []
    );
    const allSkillPool = [...new Set([...primarySkills, ...secondarySkillPools])];
    const skills = pickN(allSkillPool, 5 + Math.floor(Math.random() * 8));

    const industries = pickN(INDUSTRIES, 2 + Math.floor(Math.random() * 3));
    const markets = pickN(MARKETS, 1 + Math.floor(Math.random() * 4));
    const location = pick(CITIES);
    const sizeBand = pick(SIZE_BANDS);
    const firmType = pick(FIRM_TYPES);
    const employeeCount = EMPLOYEE_COUNTS[sizeBand] || 10;

    // Generate services based on category
    const serviceTemplates: Record<number, string[]> = {
      0: ["Fractional CMO", "Interim CTO", "Embedded Leadership", "Executive Coaching", "C-Suite Advisory"],
      3: ["Brand Strategy", "Brand Identity Design", "Positioning & Messaging", "Brand Architecture", "Rebranding"],
      4: ["Content Strategy", "Video Production", "Social Media Content", "Graphic Design", "Copywriting"],
      5: ["Customer Success Strategy", "Onboarding Optimization", "Retention Programs", "NPS & CSAT Programs", "Customer Journey Mapping"],
      6: ["Business Intelligence", "Data Analytics", "Dashboard Development", "Data Warehouse Design", "Predictive Analytics"],
      13: ["Growth Strategy", "Performance Marketing", "SEO & Content Marketing", "Paid Media", "Marketing Analytics"],
      14: ["CRM Implementation", "Marketing Automation", "Email Marketing", "Customer Lifecycle Management", "HubSpot/Salesforce Setup"],
      18: ["Product Strategy", "Product-Market Fit", "Innovation Workshops", "Roadmap Development", "User Research"],
      19: ["UX Design", "UI Design", "Design Systems", "User Research", "Prototyping & Testing"],
      22: ["Strategic Planning", "Growth Strategy", "M&A Advisory", "Organizational Design", "Market Entry Strategy"],
      25: ["Custom Software Development", "Web Application Development", "Mobile App Development", "API Development", "Cloud Architecture"],
      26: ["AI Strategy", "Machine Learning Development", "Chatbot Development", "Process Automation", "Data Pipeline Engineering"],
    };
    const catServices = serviceTemplates[primaryCatIdx] ||
      [`${primaryCat} Consulting`, `${primaryCat} Strategy`, `${primaryCat} Implementation`, `${primaryCat} Advisory`];
    const services = pickN(catServices, 3 + Math.floor(Math.random() * 3));

    const clients = pickN(FAKE_CLIENTS, 2 + Math.floor(Math.random() * 4));
    const rate = pick(RATE_RANGES);
    const projectSize = pick(PROJECT_SIZES);
    const clientSizes = pick(CLIENT_SIZE_OPTIONS);
    const partnerRole = pick(PARTNERSHIP_ROLES);

    const narrative = generateNarrative(name, categories, skills, industries, services, clients, location, sizeBand);

    const description = `${name} provides ${services.slice(0, 3).join(", ")} services to ${industries.slice(0, 2).join(" and ")} organizations.`;

    const firmId = `firm_${nanoid()}`;
    firms.push({
      orgId: nanoid(),
      firmId,
      prefId: `pref_${nanoid()}`,
      absId: `abs_${firmId}`, // Convention: abs_${firmId} for vector search lookup
      name,
      slug,
      website: `https://${domain}`,
      description,
      location,
      sizeBand,
      firmType,
      categories,
      skills,
      industries,
      markets,
      services,
      clients,
      narrative,
      employeeCount,
      rate,
      projectSize,
      clientSizes,
      partnerRole,
    });
  }

  return firms;
}

// ─── Main Seed ──────────────────────────────────────────

async function seed() {
  console.log("Seeding 100 demo firms...\n");

  const firms = generateFirms(100);
  let inserted = 0;

  // Insert in batches of 10 to avoid huge single queries
  for (let batch = 0; batch < firms.length; batch += 10) {
    const chunk = firms.slice(batch, batch + 10);

    // 1. Organizations
    await db.insert(organizations).values(
      chunk.map((f) => ({
        id: f.orgId,
        name: f.name,
        slug: f.slug,
        metadata: JSON.stringify({ source: "seed", seededAt: new Date().toISOString() }),
      }))
    );

    // 2. Service Firms
    await db.insert(serviceFirms).values(
      chunk.map((f) => ({
        id: f.firmId,
        organizationId: f.orgId,
        name: f.name,
        website: f.website,
        description: f.description,
        foundedYear: 2010 + Math.floor(Math.random() * 14),
        sizeBand: f.sizeBand,
        firmType: f.firmType,
        isPlatformMember: true,
        profileCompleteness: 0.85,
        enrichmentData: {
          url: f.website,
          domain: f.website.replace("https://", ""),
          logoUrl: `https://img.logo.dev/${f.website.replace("https://", "")}?token=pk_anonymous`,
          success: true,
          companyData: {
            name: f.name,
            industry: f.industries[0],
            size: f.sizeBand.replace(/_/g, " "),
            employeeCount: f.employeeCount,
            founded: 2010 + Math.floor(Math.random() * 14),
            location: f.location,
            linkedinUrl: null,
          },
          extracted: {
            clients: f.clients,
            caseStudyUrls: [],
            services: f.services,
            aboutPitch: f.description,
            teamMembers: [],
          },
          classification: {
            categories: f.categories,
            skills: f.skills,
            industries: f.industries,
            markets: f.markets,
            languages: ["English"],
            confidence: 0.88 + Math.random() * 0.1,
          },
          pagesScraped: 3,
          evidenceCategories: ["services", "about"],
        },
        enrichmentStatus: "enriched",
        classificationConfidence: 0.88 + Math.random() * 0.1,
      }))
    );

    // 3. Partner Preferences (all 9 onboarding fields)
    await db.insert(partnerPreferences).values(
      chunk.map((f) => {
        // Pick partner types different from own type
        const allTypes = ["boutique_agency", "project_consulting", "staff_augmentation", "advisory", "fractional_interim", "managed_service_provider", "embedded_teams"];
        const partnerTypes = pickN(allTypes.filter(t => t !== f.firmType), 2 + Math.floor(Math.random() * 2));
        const partnerSizes = pickN(["micro_1_10", "small_11_50", "emerging_51_200", "mid_201_500"], 2 + Math.floor(Math.random() * 2));
        const partnerIndustries = pickN(INDUSTRIES, 2 + Math.floor(Math.random() * 3));
        const partnerMarkets = pickN(MARKETS, 2 + Math.floor(Math.random() * 3));

        // Desired partner services — pick from categories different than own
        const otherCats = CATEGORIES.filter(c => !f.categories.includes(c));
        const desiredServices = pickN(otherCats, 2 + Math.floor(Math.random() * 3));

        return {
          id: f.prefId,
          firmId: f.firmId,
          preferredFirmTypes: partnerTypes,
          preferredSizeBands: partnerSizes,
          preferredIndustries: partnerIndustries,
          preferredMarkets: partnerMarkets,
          partnershipModels: pickN(["co-delivery", "subcontracting", "referral", "white-label"], 1 + Math.floor(Math.random() * 2)),
          dealBreakers: [],
          growthGoals: pick([
            "Expand into new verticals and geographies",
            "Build a reliable bench of specialist partners",
            "Increase project capacity without hiring",
            "Offer broader service bundles to existing clients",
          ]),
          rawOnboardingData: {
            desiredPartnerServices: desiredServices,
            idealPartnerClientSize: f.clientSizes,
            idealProjectSize: f.projectSize,
            typicalHourlyRates: f.rate,
            partnershipRole: f.partnerRole,
          },
        };
      })
    );

    // 4. Abstraction Profiles (needed for text-based search)
    await db.insert(abstractionProfiles).values(
      chunk.map((f) => ({
        id: f.absId,
        entityType: "firm",
        entityId: f.firmId,
        hiddenNarrative: f.narrative,
        topServices: f.services,
        topSkills: f.skills.slice(0, 10),
        topIndustries: f.industries,
        typicalClientProfile: `${f.clientSizes.join(", ")} companies in ${f.industries.slice(0, 2).join(" and ")}`,
        partnershipReadiness: {
          openToPartnerships: true,
          preferredPartnerTypes: [f.firmType],
          partnershipGoals: ["Expand service offerings", "Geographic expansion"],
        },
        confidenceScores: {
          services: 0.75 + Math.random() * 0.2,
          skills: 0.7 + Math.random() * 0.2,
          industries: 0.8 + Math.random() * 0.15,
          clientProfile: 0.6 + Math.random() * 0.3,
          overall: 0.72 + Math.random() * 0.2,
        },
        evidenceSources: {
          caseStudyCount: Math.floor(Math.random() * 5),
          expertCount: Math.floor(Math.random() * 8) + 1,
          websitePages: 3 + Math.floor(Math.random() * 5),
          pdlAvailable: true,
        },
        enrichmentVersion: 1,
      }))
    );

    inserted += chunk.length;
    console.log(`  Inserted batch ${Math.floor(batch / 10) + 1}/10 (${inserted} firms)`);
  }

  // Summary
  console.log("\n--- Summary ---");
  const categoryCounts = new Map<string, number>();
  for (const f of firms) {
    for (const c of f.categories) {
      categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
    }
  }
  console.log("\nCategory distribution:");
  for (const [cat, count] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  const typeCounts = new Map<string, number>();
  for (const f of firms) {
    typeCounts.set(f.firmType, (typeCounts.get(f.firmType) || 0) + 1);
  }
  console.log("\nFirm type distribution:");
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

seed()
  .then(() => {
    console.log("\nDone! 100 test firms seeded.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
