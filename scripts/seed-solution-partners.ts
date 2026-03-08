/**
 * Seed script: adds 20 well-known tech solution partners to the knowledge graph.
 *
 * Usage:  npx tsx scripts/seed-solution-partners.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { nanoid } from "nanoid";
import { solutionPartners } from "../src/lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const PARTNERS = [
  {
    name: "HubSpot",
    domain: "hubspot.com",
    category: "crm" as const,
    description:
      "CRM platform with marketing, sales, customer service, and content management tools.",
    websiteUrl: "https://www.hubspot.com",
  },
  {
    name: "Salesforce",
    domain: "salesforce.com",
    category: "crm" as const,
    description:
      "Enterprise CRM and cloud computing platform for sales, service, and marketing.",
    websiteUrl: "https://www.salesforce.com",
  },
  {
    name: "Klaviyo",
    domain: "klaviyo.com",
    category: "marketing_automation" as const,
    description:
      "Marketing automation platform for email & SMS, built for ecommerce brands.",
    websiteUrl: "https://www.klaviyo.com",
  },
  {
    name: "Shopify",
    domain: "shopify.com",
    category: "ecommerce" as const,
    description:
      "Commerce platform powering online stores, POS, and multi-channel selling.",
    websiteUrl: "https://www.shopify.com",
  },
  {
    name: "Stripe",
    domain: "stripe.com",
    category: "payments" as const,
    description:
      "Financial infrastructure for the internet — payments, billing, and treasury.",
    websiteUrl: "https://www.stripe.com",
  },
  {
    name: "Intercom",
    domain: "intercom.com",
    category: "customer_support" as const,
    description:
      "AI-first customer service platform with messenger, bots, and help center.",
    websiteUrl: "https://www.intercom.com",
  },
  {
    name: "Slack",
    domain: "slack.com",
    category: "communication" as const,
    description:
      "Business messaging platform for team collaboration with channels, DMs, and integrations.",
    websiteUrl: "https://slack.com",
  },
  {
    name: "Figma",
    domain: "figma.com",
    category: "design" as const,
    description:
      "Collaborative design tool for interface design, prototyping, and design systems.",
    websiteUrl: "https://www.figma.com",
  },
  {
    name: "Notion",
    domain: "notion.so",
    category: "project_management" as const,
    description:
      "Connected workspace for docs, wikis, projects, and knowledge management.",
    websiteUrl: "https://www.notion.so",
  },
  {
    name: "Asana",
    domain: "asana.com",
    category: "project_management" as const,
    description:
      "Work management platform for teams to organize, track, and manage projects.",
    websiteUrl: "https://asana.com",
  },
  {
    name: "Jira",
    domain: "atlassian.com",
    category: "project_management" as const,
    description:
      "Issue and project tracking software for agile development teams by Atlassian.",
    websiteUrl: "https://www.atlassian.com/software/jira",
  },
  {
    name: "GitHub",
    domain: "github.com",
    category: "developer_tools" as const,
    description:
      "Development platform for version control, CI/CD, and code collaboration.",
    websiteUrl: "https://github.com",
  },
  {
    name: "Amazon Web Services",
    domain: "aws.amazon.com",
    category: "cloud_infrastructure" as const,
    description:
      "Comprehensive cloud computing platform with compute, storage, database, and AI services.",
    websiteUrl: "https://aws.amazon.com",
  },
  {
    name: "Google Cloud",
    domain: "cloud.google.com",
    category: "cloud_infrastructure" as const,
    description:
      "Cloud platform offering computing, data storage, ML, and analytics services.",
    websiteUrl: "https://cloud.google.com",
  },
  {
    name: "Twilio",
    domain: "twilio.com",
    category: "communication" as const,
    description:
      "Cloud communications platform for voice, SMS, video, and authentication APIs.",
    websiteUrl: "https://www.twilio.com",
  },
  {
    name: "Segment",
    domain: "segment.com",
    category: "data_integration" as const,
    description:
      "Customer data platform for collecting, unifying, and routing customer data.",
    websiteUrl: "https://segment.com",
  },
  {
    name: "Mixpanel",
    domain: "mixpanel.com",
    category: "analytics" as const,
    description:
      "Product analytics platform for tracking user behavior and measuring engagement.",
    websiteUrl: "https://mixpanel.com",
  },
  {
    name: "Amplitude",
    domain: "amplitude.com",
    category: "analytics" as const,
    description:
      "Digital analytics platform providing product intelligence and user behavior insights.",
    websiteUrl: "https://amplitude.com",
  },
  {
    name: "Zendesk",
    domain: "zendesk.com",
    category: "customer_support" as const,
    description:
      "Customer service and engagement platform with ticketing, chat, and knowledge base.",
    websiteUrl: "https://www.zendesk.com",
  },
  {
    name: "Monday.com",
    domain: "monday.com",
    category: "project_management" as const,
    description:
      "Work OS for teams to plan, track, and deliver projects with visual dashboards.",
    websiteUrl: "https://monday.com",
  },
];

async function seed() {
  console.log("🌱 Seeding 20 solution partners...\n");

  const values = PARTNERS.map((p) => ({
    id: nanoid(),
    name: p.name,
    domain: p.domain,
    category: p.category,
    description: p.description,
    websiteUrl: p.websiteUrl,
    isVerified: true,
    meta: { source: "seed", seededAt: new Date().toISOString() },
  }));

  try {
    await db.insert(solutionPartners).values(values);
    console.log(`✅ Inserted ${values.length} solution partners`);
    for (const p of PARTNERS) {
      console.log(`   • ${p.name} (${p.domain}) — ${p.category}`);
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("duplicate key value violates unique constraint")
    ) {
      console.log("⚠️  Partners already seeded (duplicate domain). Skipping.");
    } else {
      throw err;
    }
  }
}

seed()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
