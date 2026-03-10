/**
 * Seed: 100 simulated call transcript extractions
 *
 * Creates callRecordings + callTranscripts + extracted opportunities
 * across existing firms in the database.
 *
 * Run with: npx tsx scripts/seed-transcripts.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 20 realistic transcript scenarios ─────────────────────────────────────

const TRANSCRIPTS: Array<{
  label: string;
  callType: "partnership" | "client";
  fullText: string;
  opportunities: Array<{
    title: string;
    description: string;
    signalType: "direct" | "latent";
    priority: "low" | "medium" | "high";
    resolutionApproach: "network" | "internal" | "hybrid";
    requiredCategories: string[];
    requiredSkills: string[];
    requiredIndustries: string[];
    estimatedValue: string;
    timeline: string;
    clientName: string;
    clientSizeBand: string;
  }>;
}> = [
  {
    label: "Healthcare SaaS — CRM migration",
    callType: "partnership",
    fullText: `Sarah: Thanks for jumping on this. So our healthcare client — mid-size hospital network, about 3,000 employees — they need a full Salesforce Health Cloud implementation. We're talking data migration from a legacy Veeva system, custom workflows, and probably six months of change management.

Alex: That's squarely in our wheelhouse. What's their budget range?

Sarah: They've told us $200K for implementation, plus probably another 50K annually for managed services. Timeline is Q1 start, non-negotiable because their contract expires.

Alex: We've done three Health Cloud deployments this year. We could absolutely take this. Is there a partner agreement in place already or would this be a net new engagement for us?

Sarah: Net new for you. We'd stay involved on the strategic side. They also mentioned they need help with staff training — do you do that or would we need to find someone else?

Alex: We do full adoption training, so that's covered. I'd also flag that they might need HIPAA-compliant data hosting review — that's something we'd include in scope.`,
    opportunities: [
      {
        title: "Salesforce Health Cloud implementation — 3,000-employee hospital network",
        description:
          "Full CRM migration from Veeva to Salesforce Health Cloud, including data migration, custom workflow configuration, HIPAA compliance review, change management, and staff adoption training. Q1 start required.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["CRM & Sales Enablement", "Digital Transformation"],
        requiredSkills: ["Salesforce", "CRM Implementation", "Change Management"],
        requiredIndustries: ["Healthcare"],
        estimatedValue: "$200K–$250K",
        timeline: "immediate",
        clientName: "Hospital Network (Healthcare)",
        clientSizeBand: "mid_201_500",
      },
    ],
  },
  {
    label: "PE-backed retail — interim CFO",
    callType: "client",
    fullText: `Marcus: We've been working with this PE-backed retail chain — 12 locations, about $40M revenue — and they just lost their CFO unexpectedly. The PE sponsor wants a financial reforecast done by end of month and a permanent hire search in parallel.

Jordan: What's the scope for the interim role?

Marcus: Full CFO responsibilities — treasury, FP&A, board reporting, and supporting the audit that's already in flight. They need someone in the seat within two weeks. It's a four to six month engagement minimum.

Jordan: Budget?

Marcus: Daily rate conversation, they're expecting $2,000 to $2,500 a day. Maybe 3-4 days a week on-site in Chicago, rest remote.

Jordan: We have a fractional CFO who's just coming off a similar retail engagement. I'd want to loop her in — she has multi-location P&L experience which is exactly what this sounds like.

Marcus: Perfect. Can you get me a CV and two or three references by Friday?`,
    opportunities: [
      {
        title: "Interim CFO — PE-backed retail chain, Chicago",
        description:
          "Urgent: PE-backed 12-location retail company needs interim CFO within two weeks. Responsibilities include FP&A, treasury, board reporting, and supporting an active audit. 4-6 month engagement at $2K-$2.5K/day, 3-4 days/week on-site Chicago.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Financial Advisory", "Fractional Leadership"],
        requiredSkills: ["FP&A", "CFO", "Treasury Management", "Board Reporting"],
        requiredIndustries: ["Retail"],
        estimatedValue: "$80K–$120K",
        timeline: "immediate",
        clientName: "PE-backed Retail Chain",
        clientSizeBand: "emerging_51_200",
      },
    ],
  },
  {
    label: "D2C brand — performance marketing gap",
    callType: "partnership",
    fullText: `Priya: We've been handling brand strategy and creative for this D2C skincare brand — they're doing about $8M revenue, growing fast. But they keep asking us about paid media and we just don't do that.

Chris: What channels are they asking about?

Priya: Primarily Meta and Google, but they're also interested in TikTok for their Gen Z line. Their current agency is terrible — 2.1x ROAS on Meta, they want someone who can get them to 4x.

Chris: That's very achievable for skincare DTC. What's their monthly media budget?

Priya: They said $150K a month across channels right now, willing to scale to $300K if results justify it. They're also doing a retail launch at Sephora in Q2 so there's urgency.

Chris: We specialize in DTC beauty and wellness. We've got a brand doing $2M a month on Meta with 5x ROAS. I'd love to get on a call with them directly.

Priya: Perfect. I'll make the intro. They also mentioned they want someone who can help with conversion rate optimization — is that something you do?

Chris: Yes, CRO is part of our growth package. We typically see 20-30% lift in conversion within 90 days.`,
    opportunities: [
      {
        title: "Performance marketing — DTC skincare brand, $150K/mo budget",
        description:
          "D2C skincare brand ($8M revenue) needs performance marketing partner for Meta, Google, and TikTok. Current ROAS is 2.1x, target is 4x+. Budget $150K/month scaling to $300K. Q2 retail launch at Sephora adds urgency. CRO also needed.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Performance Marketing & Paid Media", "Growth Marketing"],
        requiredSkills: ["Meta Ads", "Google Ads", "TikTok Ads", "CRO", "DTC Marketing"],
        requiredIndustries: ["Consumer Goods", "Beauty & Wellness"],
        estimatedValue: "$15K–$25K/mo",
        timeline: "immediate",
        clientName: "D2C Skincare Brand",
        clientSizeBand: "micro_1_10",
      },
    ],
  },
  {
    label: "B2B SaaS — content and SEO",
    callType: "client",
    fullText: `Nina: We're the marketing agency for this B2B SaaS company — HR tech space, Series B, about 150 employees. We handle their demand gen and ABM but they keep telling us their organic is terrible.

Derek: How bad are we talking?

Nina: They're getting maybe 2,000 organic visits a month. Their competitors have 50K+. No blog strategy, no SEO foundation, meta descriptions are all blank. Classic Series A hangover — they grew on outbound and referrals and never invested in content.

Derek: That's very fixable. What's their content budget?

Nina: They said $8K-$12K a month. They want someone who understands B2B SaaS buyer journeys — not just keyword stuffing, but proper thought leadership that converts.

Derek: That's exactly what we do. We actually have a case study from a similar HR tech company — took them from 1,800 to 40,000 monthly visitors in 14 months.

Nina: That would be perfect. They also mentioned they want help with their LinkedIn presence — executive thought leadership, that kind of thing.

Derek: We do LinkedIn strategy as part of the content package.`,
    opportunities: [
      {
        title: "B2B content marketing + SEO — HR tech SaaS, Series B",
        description:
          "Series B HR tech SaaS company needs content strategy and SEO from scratch. Currently at 2K organic visits/month, competitors at 50K+. Budget $8K–$12K/month. Needs B2B SaaS buyer journey expertise and LinkedIn executive thought leadership.",
        signalType: "direct",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["Content Marketing & SEO", "B2B Marketing"],
        requiredSkills: ["SEO", "Content Strategy", "LinkedIn Marketing", "B2B SaaS Marketing"],
        requiredIndustries: ["HR Technology", "SaaS"],
        estimatedValue: "$8K–$12K/mo",
        timeline: "1-3 months",
        clientName: "HR Tech SaaS (Series B)",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Professional services — brand refresh",
    callType: "client",
    fullText: `Tom: We're a management consulting firm, about 80 partners globally. We've been using the same brand identity for 12 years and it shows. We're launching a major thought leadership initiative next year and the brand needs to catch up.

Rachel: What's the scope you're envisioning?

Tom: Full rebrand — logo, visual identity, brand guidelines, website redesign, and pitch deck templates. We have some strong opinions about staying professional without being boring. A lot of consulting firms look the same.

Rachel: Budget?

Tom: We've allocated $300K for the full engagement. Timeline is six months, with the website going live before our annual conference in October.

Rachel: That's a healthy budget for what you're describing. We've done this for two top-10 law firms and a Big Four advisory practice. Our process usually starts with brand strategy — interviews with partners — before we touch any design.

Tom: That's exactly the right approach. We'd also need the brand extended to social assets, email templates, and eventually a client portal redesign.

Rachel: All of that is in scope for us.`,
    opportunities: [
      {
        title: "Full rebrand — global management consulting firm",
        description:
          "80-partner global management consulting firm needs complete brand refresh: logo, visual identity, guidelines, website redesign, pitch deck templates, social assets. $300K budget, 6-month timeline, October conference deadline.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Brand Strategy & Identity", "Web Design & Development"],
        requiredSkills: ["Brand Identity", "Visual Design", "Web Design", "Brand Strategy"],
        requiredIndustries: ["Professional Services", "Consulting"],
        estimatedValue: "$250K–$350K",
        timeline: "1-3 months",
        clientName: "Global Management Consulting Firm",
        clientSizeBand: "emerging_51_200",
      },
    ],
  },
  {
    label: "Manufacturing — data analytics",
    callType: "partnership",
    fullText: `Lisa: Our client is a mid-market manufacturer — specialty chemicals, $200M revenue. They have data everywhere but no way to make sense of it. ERP is SAP, they have shop floor IoT sensors, and their reporting is entirely Excel-based.

Ben: Classic. What are the pain points they're articulating?

Lisa: Three big ones: they can't predict maintenance downtime, their inventory forecasting is off by 30%, and they want real-time production dashboards for plant managers.

Ben: Predictive maintenance and production analytics — that's very doable with the SAP data plus the IoT stream. Inventory forecasting is more of an ML problem.

Lisa: Do you do ML or just BI?

Ben: Both. We'd probably start with Power BI for the dashboards since their ops team is already comfortable with Microsoft tools, then layer in Python models for predictive maintenance and inventory.

Lisa: Budget is around $400K for the initial phase. They want a POC within 60 days.

Ben: Aggressive but doable. Let's set up a discovery session with their IT and ops leads.`,
    opportunities: [
      {
        title: "Data & analytics transformation — $200M specialty chemicals manufacturer",
        description:
          "Mid-market manufacturer needs predictive maintenance, inventory forecasting, and real-time production dashboards. SAP ERP + IoT data. $400K initial budget. POC required within 60 days. Power BI for dashboards, ML for predictive models.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Data Analytics & Business Intelligence", "AI & Machine Learning"],
        requiredSkills: ["Power BI", "Python", "SAP Integration", "Predictive Analytics", "IoT"],
        requiredIndustries: ["Manufacturing", "Chemicals"],
        estimatedValue: "$350K–$450K",
        timeline: "immediate",
        clientName: "Specialty Chemicals Manufacturer",
        clientSizeBand: "emerging_51_200",
      },
    ],
  },
  {
    label: "Startup — GTM strategy",
    callType: "client",
    fullText: `Keiko: We're a Series A fintech, about 30 people. We just closed $12M and the investors are pushing hard for us to hire a VP of Sales by Q2. But honestly we don't even have our go-to-market motion figured out yet.

Sam: What does your current commercial setup look like?

Keiko: Three AEs, no SDRs, a founder-led sales motion that's been working up to now but doesn't scale. Our average deal is $50K ARR, we're doing about $2M ARR today.

Sam: And what's the ambition — where do you want to be in 18 months?

Keiko: $8M ARR, minimum. Investors want us at $10M before Series B.

Sam: Before hiring a VP Sales you need the playbook documented. Otherwise you're hiring someone to build something from scratch without the institutional knowledge. What market are you targeting?

Keiko: Mid-market financial services — RIAs, family offices, community banks.

Sam: That's a specialized ICP. You need outbound sequences, case studies specific to each segment, and clear differentiation. We could have a GTM playbook ready in six to eight weeks.

Keiko: What would that cost?

Sam: Around $40K for the full engagement — ICP definition, messaging framework, sales playbook, and three outbound sequences.`,
    opportunities: [
      {
        title: "GTM strategy & sales playbook — Series A fintech",
        description:
          "Series A fintech ($2M ARR, $12M raised) needs GTM strategy before VP Sales hire. Targeting mid-market financial services (RIAs, family offices, community banks). Needs ICP definition, messaging, sales playbook, outbound sequences. 6-8 week engagement.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Revenue Operations & Sales Strategy", "B2B Marketing"],
        requiredSkills: ["GTM Strategy", "Sales Playbook", "ICP Definition", "Outbound Sales"],
        requiredIndustries: ["Fintech", "Financial Services"],
        estimatedValue: "$35K–$50K",
        timeline: "immediate",
        clientName: "Series A Fintech",
        clientSizeBand: "micro_1_10",
      },
    ],
  },
  {
    label: "HR tech — UX redesign",
    callType: "partnership",
    fullText: `Morgan: Our client is an HR tech platform — workforce management, about 500 enterprise clients. Their product has grown through acquisitions and it shows. Three different design systems, terrible navigation, churning mid-market accounts because onboarding is too complex.

Pat: What's the scope they're thinking?

Morgan: They want a full UX audit first, then a redesigned information architecture and a unified design system that all three product teams can build on. They specifically mentioned they want user research — talking to actual customers, not just opinionating.

Pat: That's the right approach. We'd probably want to do a 4-week discovery phase — user interviews, usability testing of the current product, competitive analysis — before any redesign work.

Morgan: That sounds right. What's your rate for something like this?

Pat: End-to-end it's probably $250K–$350K over six months. Research phase is $60K, then IA and design system is the bulk.

Morgan: They have $300K approved. Can you do a proposal by end of week?

Pat: Yes, we'll have it to you Thursday.`,
    opportunities: [
      {
        title: "UX audit, IA redesign + design system — HR tech platform",
        description:
          "500-client enterprise HR tech platform with fragmented design (3 systems post-acquisition) needs full UX audit, information architecture redesign, unified design system. User research required. $300K budget approved, 6-month engagement.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["UX & Product Design", "Digital Transformation"],
        requiredSkills: ["UX Research", "Information Architecture", "Design Systems", "Usability Testing"],
        requiredIndustries: ["HR Technology", "SaaS"],
        estimatedValue: "$250K–$350K",
        timeline: "1-3 months",
        clientName: "HR Tech Platform",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Law firm — digital transformation",
    callType: "client",
    fullText: `David: We're a 200-attorney regional law firm. We've been doing work on document management — moving from a legacy NetDocuments instance — but frankly the IT team doesn't have the bandwidth to drive adoption.

Sarah: What does adoption look like currently?

David: Maybe 40% of attorneys are actually using it consistently. The others have basically reverted to saving things locally. Billing has gone down because matter tracking is inconsistent.

Sarah: That's a change management problem more than a technology problem.

David: Exactly what our managing partner said. We need someone to come in, work with practice group chairs, design training programs, and essentially be an internal champion for the next six months.

Sarah: We've done this at two Am Law 100 firms. The key is winning over the billing partners — they respond to data. Do you have visibility into billable hour capture rates by practice group?

David: We do but nobody looks at it. That's part of the problem.

Sarah: We'd want to start there. Show them the revenue leakage and the business case becomes obvious. What's your engagement budget?

David: $150K, maybe more if there's clear ROI.`,
    opportunities: [
      {
        title: "Change management + tech adoption — 200-attorney law firm",
        description:
          "Regional law firm needs change management program to drive adoption of NetDocuments (currently at 40%). 6-month engagement working with practice group chairs and billing partners. $150K budget, potential for more with clear ROI.",
        signalType: "latent",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["Change Management & Organizational Design", "Digital Transformation"],
        requiredSkills: ["Change Management", "Technology Adoption", "Training Program Design"],
        requiredIndustries: ["Legal"],
        estimatedValue: "$100K–$180K",
        timeline: "1-3 months",
        clientName: "Regional Law Firm (200 attorneys)",
        clientSizeBand: "emerging_51_200",
      },
    ],
  },
  {
    label: "Insurance — AI automation",
    callType: "client",
    fullText: `Jennifer: We're the innovation team at a regional P&C insurer — about $800M in premiums. We've been tasked with identifying AI use cases that can reduce claims processing time and cut costs.

Ryan: What does claims processing look like today?

Jennifer: End to end, a standard auto claim takes 12-15 business days. A lot of that is manual data entry, document review, and back-and-forth with adjusters. We think at least half of that could be automated.

Ryan: That's very achievable with the right document AI and workflow tooling. What systems are you running?

Jennifer: Guidewire for core, Duck Creek for policy admin, Salesforce for customer service. The CTO is open to new tooling as long as it integrates.

Ryan: We've done AI extraction and triage on Guidewire before. Typical outcome is 40-60% reduction in manual touch points. What's the budget range?

Jennifer: POC budget is $300K. If it works, the production build is probably $1.5M.

Ryan: That's enough for a real POC. We'd want to start with claims intake — first notice of loss — where the volume is highest.

Jennifer: Yes, exactly. Can you give us a proposal?`,
    opportunities: [
      {
        title: "AI claims automation POC — regional P&C insurer, Guidewire",
        description:
          "Regional P&C insurer ($800M premiums) wants to automate claims processing (currently 12-15 days). POC focus on first notice of loss automation with document AI. Systems: Guidewire + Duck Creek + Salesforce. POC budget $300K, production build $1.5M.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["AI & Machine Learning", "Process Automation & RPA"],
        requiredSkills: ["Document AI", "Guidewire", "Process Automation", "Insurance Tech"],
        requiredIndustries: ["Insurance"],
        estimatedValue: "$300K–$1.5M",
        timeline: "1-3 months",
        clientName: "Regional P&C Insurer",
        clientSizeBand: "mid_201_500",
      },
    ],
  },
  {
    label: "Media company — influencer marketing",
    callType: "partnership",
    fullText: `Carlos: We handle brand strategy for this entertainment media company — streaming platform, about 5 million subscribers. They're launching a new true crime vertical and want to build brand awareness with Gen Z and millennials.

Tasha: Interesting. What channels are they focusing on?

Carlos: They've already got PR covered and we're handling positioning. But they specifically asked about influencer — TikTok and YouTube primarily. They want authentic integrations, not just paid posts.

Tasha: What's the talent budget?

Carlos: $800K for the launch campaign over three months. They want to work with mid-tier creators — 100K to 2M followers — rather than mega-influencers because the authenticity is higher.

Carlos: They also want someone who understands true crime communities specifically. There's a whole ecosystem of podcast hosts, Reddit moderators, writers who have huge influence in that niche.

Tasha: That niche is exactly what we specialize in — crime, mystery, and thriller content creators. We have relationships with 200+ in that space.

Carlos: That's exactly what they need. Can we get a meeting next week?`,
    opportunities: [
      {
        title: "Influencer campaign — streaming platform true crime launch",
        description:
          "Streaming platform (5M subscribers) launching true crime vertical needs influencer campaign on TikTok and YouTube. $800K talent budget, 3-month campaign, mid-tier creators (100K–2M followers), true crime niche expertise required.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Influencer Marketing", "Social Media Marketing"],
        requiredSkills: ["Influencer Marketing", "TikTok", "YouTube", "Niche Community Outreach"],
        requiredIndustries: ["Media & Entertainment"],
        estimatedValue: "$800K+",
        timeline: "immediate",
        clientName: "Streaming Platform",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "E-commerce — email automation",
    callType: "client",
    fullText: `James: We're an online furniture retailer — about $25M revenue, mostly DTC. Our email list is 400,000 and we send one newsletter a week. Revenue from email is embarrassingly low — maybe 4% of total.

Kira: What's your current ESP?

James: Klaviyo, but we barely use the automation features. All our flows are either off or set up in 2019 and never touched.

Kira: That's a big gap. For a retailer your size, email should be driving 25-35% of revenue.

James: That's what I keep hearing. What would the fix look like?

Kira: Start with an audit of your current flows — welcome series, abandoned cart, browse abandonment, post-purchase. Then rebuild them with proper segmentation. We'd also want to set up lifecycle stage automations — first purchase, at-risk, lapsed.

James: How long does that take and what does it cost?

Kira: Six to eight weeks for the initial build, then ongoing optimization. First year retainer is typically $3K-$5K a month.

James: That's very manageable. Can you give me a revenue projection based on what you've seen with similar retailers?

Kira: Typically clients see email revenue jump from 5% to 20-25% of total within six months. For you that's $2.5M to $3M in new attributable revenue.`,
    opportunities: [
      {
        title: "Email automation rebuild — $25M DTC furniture retailer",
        description:
          "Online furniture retailer with 400K email list and Klaviyo underutilization (currently 4% revenue from email, should be 25-35%). Needs full flow rebuild: welcome, abandoned cart, browse abandonment, post-purchase, lifecycle automations. $3K-$5K/mo ongoing.",
        signalType: "direct",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["Marketing Automation & CRM", "E-commerce"],
        requiredSkills: ["Klaviyo", "Email Marketing", "Marketing Automation", "E-commerce"],
        requiredIndustries: ["Retail", "E-commerce"],
        estimatedValue: "$3K–$5K/mo",
        timeline: "1-3 months",
        clientName: "DTC Furniture Retailer",
        clientSizeBand: "micro_1_10",
      },
    ],
  },
  {
    label: "Pharma — regulatory communications",
    callType: "partnership",
    fullText: `Helen: We're the agency of record for this mid-size specialty pharma company — they have two drugs in Phase 3 trials. They just asked us about regulatory communications and medical affairs support, which is way outside our scope.

Nate: What specifically are they asking for?

Helen: Two things: medical writing for their NDA submission — they need clinical study reports and expert reports — and they want patient advocacy communications for their rare disease indication.

Nate: Those are two quite different needs. The medical writing for NDA is a specialized regulatory writing capability. The patient advocacy is more PR and community relations.

Helen: Right. Do you do both or should I be looking at two different partners?

Nate: We specialize in the medical writing side — NDA submissions, IND packages, scientific publications. We've supported eight NDA filings in the last three years.

Helen: What's a ballpark for the NDA writing work?

Nate: Depends heavily on the complexity. For a small molecule, CSR writing alone is $400K-$700K. Full NDA package with expert reports is $1M-$1.5M.

Helen: They have budget — this is their lead asset. Patient advocacy side, do you have a referral?

Nate: I can introduce you to a rare disease PR firm we've partnered with twice.`,
    opportunities: [
      {
        title: "NDA medical writing + patient advocacy — specialty pharma Phase 3",
        description:
          "Specialty pharma company with two Phase 3 drugs needs NDA medical writing (CSRs, expert reports) and rare disease patient advocacy communications. Medical writing budget $400K-$1.5M. Two separate partners likely needed.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Healthcare Marketing & Medical Affairs", "Public Relations & Communications"],
        requiredSkills: ["Medical Writing", "Regulatory Writing", "NDA Submission", "Rare Disease"],
        requiredIndustries: ["Pharmaceuticals", "Biotech"],
        estimatedValue: "$500K–$1.5M",
        timeline: "1-3 months",
        clientName: "Specialty Pharma (Phase 3)",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Logistics — customer success strategy",
    callType: "client",
    fullText: `Andre: We're a last-mile logistics company, Series B, about $50M ARR. We have a churn problem — 35% annual churn on our SMB customers. Enterprise retention is fine, it's the long tail that's killing us.

Wei: What does your customer success motion look like right now?

Andre: Honestly it's reactive. We have a support team that responds to tickets, and an account management team that calls enterprise accounts quarterly. Nobody owns SMB success.

Wei: Do you have the data to understand why SMBs are churning?

Andre: Exit surveys show price sensitivity, but we think it's actually adoption — they're not using the route optimization features that would justify the cost.

Wei: That's an onboarding and adoption problem, not a pricing problem. You need a scaled CS motion for SMB — probably a digital-first approach with triggered in-app messaging and proactive outreach at risk signals.

Andre: We don't have that capability internally and we're not ready to hire a CS team.

Wei: What you need is a 60-90 day engagement to define the SMB success playbook, set up the tooling — probably Gainsight or ChurnZero — and hire two or three CS specialists once the motion is defined.

Andre: What would that engagement cost?

Wei: $80K-$120K for strategy and implementation, then the ongoing team is yours.`,
    opportunities: [
      {
        title: "SMB customer success strategy — Series B logistics company",
        description:
          "Last-mile logistics company (Series B, $50M ARR) has 35% SMB annual churn, likely due to feature adoption failures. Needs scaled digital CS motion, tooling setup (Gainsight/ChurnZero), playbook, and hiring guidance. 60-90 day engagement.",
        signalType: "latent",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Customer Success & Retention", "Revenue Operations & Sales Strategy"],
        requiredSkills: ["Customer Success", "Gainsight", "Churn Reduction", "SMB Strategy"],
        requiredIndustries: ["Logistics", "SaaS"],
        estimatedValue: "$80K–$120K",
        timeline: "immediate",
        clientName: "Last-Mile Logistics (Series B)",
        clientSizeBand: "micro_1_10",
      },
    ],
  },
  {
    label: "Consumer brand — sustainability comms",
    callType: "partnership",
    fullText: `Aisha: Our client is a consumer packaged goods company — household cleaning products, $300M revenue. They're launching a major sustainability initiative and need communications support. We do their traditional PR but they're asking for sustainability-specific expertise.

Matt: What's the initiative?

Aisha: They're committing to fully recyclable packaging by 2026 and 50% reduction in carbon footprint. They want to communicate this to consumers without it looking like greenwashing.

Matt: The greenwashing risk is very real — especially in consumer goods. What's the timeline for the announcement?

Aisha: Earth Day, so April. About four months.

Matt: That's tight but doable. The key is third-party validation — you need credible certifications cited, not just claims. Are they working with any sustainability consultants on the actual initiative?

Aisha: Yes, they have ERM advising on the program itself.

Matt: Perfect. So we'd be taking their verified claims and building a communications architecture around it — consumer messaging, B2B retail buyer messaging, investor messaging, and media relations.

Aisha: Exactly. Budget is $200K for the launch year.

Matt: That works. We've done this for two other CPG companies in the last 18 months.`,
    opportunities: [
      {
        title: "Sustainability communications launch — $300M CPG brand",
        description:
          "CPG household products company ($300M revenue) needs sustainability communications strategy for Earth Day launch. Committing to recyclable packaging by 2026 and 50% carbon reduction. Needs multi-audience messaging (consumer, B2B retail, investor), avoiding greenwashing. $200K budget.",
        signalType: "direct",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["Public Relations & Communications", "Brand Strategy & Identity"],
        requiredSkills: ["Sustainability Communications", "ESG", "PR", "Consumer Brand"],
        requiredIndustries: ["Consumer Goods", "FMCG"],
        estimatedValue: "$150K–$250K",
        timeline: "immediate",
        clientName: "CPG Household Products Brand",
        clientSizeBand: "upper_mid_501_1000",
      },
    ],
  },
  {
    label: "Fintech — compliance consulting",
    callType: "client",
    fullText: `Diana: We're a Series B payments fintech — embedded payments for B2B marketplaces. Just got our money transmitter licenses in 12 states. The board is asking about ISO 27001 and SOC 2 Type II certification because we're about to go upmarket into enterprise.

Victor: Where are you in the process currently?

Diana: Nowhere, honestly. We have a VP of Security but she came from startup world and has never run a formal compliance program. We know we need someone to come in and run the process.

Victor: SOC 2 Type II is a 12-month process minimum from where you're describing. ISO 27001 can run in parallel but adds complexity.

Diana: Enterprise prospects are asking for SOC 2 in procurement conversations. We need to at least have a path to show them.

Victor: A readiness assessment first — probably 4-6 weeks, around $30K — gives you the gap analysis and a credible roadmap you can show prospects. Then you move into the remediation phase.

Diana: What's total cost?

Victor: For both frameworks, 18-24 months, we're looking at $250K-$400K including the audit itself. But the readiness assessment gives you clarity on scope.

Diana: Start with the assessment. Can we sign next week?`,
    opportunities: [
      {
        title: "SOC 2 Type II + ISO 27001 compliance — Series B payments fintech",
        description:
          "B2B embedded payments fintech (Series B, MTLs in 12 states) needs compliance program for enterprise sales. Needs SOC 2 Type II and ISO 27001. Start with readiness assessment ($30K), then 18-24 month full program ($250K-$400K).",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Cybersecurity & Compliance", "Risk & Regulatory"],
        requiredSkills: ["SOC 2", "ISO 27001", "Compliance Program Management", "Information Security"],
        requiredIndustries: ["Fintech", "Financial Services"],
        estimatedValue: "$30K–$400K",
        timeline: "immediate",
        clientName: "Series B Payments Fintech",
        clientSizeBand: "micro_1_10",
      },
    ],
  },
  {
    label: "University — enrollment marketing",
    callType: "partnership",
    fullText: `Steven: We work with a mid-size private university — about 8,000 students. They're seeing enrollment decline in undergraduate but strong growth in their online programs and executive education.

Clara: What's their marketing setup now?

Steven: They have an in-house marketing team of five people. They've been doing mostly print and traditional digital. They know they need to shift but they don't have the expertise in-house for the channels that are actually driving enrollment now.

Clara: What channels are working in higher ed right now?

Steven: Exactly what I was going to ask you. We know it's not just Google Ads anymore.

Clara: It's YouTube for awareness, TikTok for Gen Z programs, highly targeted LinkedIn for the executive ed programs, and a lot of what's working is actually SEO + content for the online programs where people are searching with high intent.

Steven: The executive ed is a real focus — they've built some strong programs in sustainability leadership and healthcare management. Budget is probably $400K for the year.

Clara: That's reasonable for a university of that size. The online programs especially have strong ROI potential because the LTV of a student is clear. We've done this for three similar institutions.`,
    opportunities: [
      {
        title: "Digital enrollment marketing — private university, online + executive ed",
        description:
          "8,000-student private university with declining undergrad but growing online and executive education programs. Needs digital marketing expertise across YouTube, TikTok, LinkedIn, SEO. Focus on sustainability leadership and healthcare management exec ed. $400K annual budget.",
        signalType: "direct",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["Education Marketing", "Digital Marketing Strategy"],
        requiredSkills: ["Higher Education Marketing", "LinkedIn Ads", "YouTube Ads", "Content SEO"],
        requiredIndustries: ["Higher Education"],
        estimatedValue: "$350K–$450K/yr",
        timeline: "1-3 months",
        clientName: "Private University",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Tech company — change management",
    callType: "client",
    fullText: `Raj: We're a 600-person software company. We just acquired a competitor — about 200 people — and we need to integrate the two organizations. Cultures are very different.

Bella: What are the specific pain points you're anticipating?

Raj: Different performance management systems, different values, different compensation structures. The acquired company has a flat hierarchy, we're more structured. The integration needs to happen over 12 months.

Bella: Have you mapped out the cultural differences in any structured way?

Raj: No, that's the problem. We know they're different but we haven't done any formal assessment.

Bella: You'll want to start with a culture assessment on both sides before designing any integration program. Otherwise you're guessing.

Raj: Agreed. What does that look like?

Bella: Typically 6-8 weeks, surveys plus focus groups, then a findings readout with recommendations. Cost is around $80K. From there, the integration program design is another 3-4 months.

Raj: We have a 12-month window before we think attrition becomes a serious problem. What's total investment?

Bella: Full engagement including assessment, integration design, and ongoing coaching of leaders is $400K-$600K depending on complexity.

Raj: That's within budget. Can you start in January?`,
    opportunities: [
      {
        title: "Post-acquisition integration — 600-person software company",
        description:
          "Software company (600 employees) acquired competitor (200 employees) with very different cultures. Needs culture assessment, integration program design, and leader coaching over 12 months. $400K-$600K budget, starting January.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Change Management & Organizational Design", "HR & People Strategy"],
        requiredSkills: ["M&A Integration", "Culture Assessment", "Change Management", "Organizational Design"],
        requiredIndustries: ["Technology", "SaaS"],
        estimatedValue: "$400K–$600K",
        timeline: "1-3 months",
        clientName: "Software Company (Post-acquisition)",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Real estate — PropTech integration",
    callType: "client",
    fullText: `Owen: We're a commercial real estate brokerage — 150 brokers, about $2B in annual transaction volume. We're losing deals to competitors who have better data and technology. They're using AI-powered market analytics we don't have.

Elena: What does your current tech stack look like?

Owen: CoStar for listings, Salesforce for CRM but it's barely configured, Excel for deal tracking. Very manual.

Elena: What are the competitors using that you're not?

Owen: Specifically they seem to have better AI-assisted property valuations and market trend prediction. Some of the larger shops are using tools we've never heard of.

Elena: There are a few PropTech platforms that integrate with CoStar — Buildout for deal pipeline, Skyline AI for valuation analytics. But you might not need all of them. What's the highest-pain workflow right now?

Owen: Honestly the deal pipeline visibility. Partners can't see where deals are, who owns what, what's about to close.

Elena: That's a Salesforce configuration problem before it's a PropTech problem. Configure your existing tool properly before adding new ones.

Owen: That makes sense. What would that cost?

Elena: Six to eight weeks, $120K-$180K, and you'd have a functional commercial real estate CRM on a platform you already own.`,
    opportunities: [
      {
        title: "Salesforce CRM configuration — commercial real estate brokerage",
        description:
          "150-broker commercial real estate firm ($2B transaction volume) has poorly configured Salesforce. Needs CRM properly set up for deal pipeline visibility before adding PropTech tools. 6-8 week engagement, $120K-$180K.",
        signalType: "latent",
        priority: "medium",
        resolutionApproach: "network",
        requiredCategories: ["CRM & Sales Enablement", "Real Estate Technology"],
        requiredSkills: ["Salesforce", "CRM Configuration", "Real Estate", "Sales Process Design"],
        requiredIndustries: ["Real Estate"],
        estimatedValue: "$120K–$180K",
        timeline: "1-3 months",
        clientName: "Commercial Real Estate Brokerage",
        clientSizeBand: "small_11_50",
      },
    ],
  },
  {
    label: "Healthcare provider — patient experience",
    callType: "client",
    fullText: `Naomi: We're a regional hospital system — four hospitals, 120 outpatient clinics. Our HCAHPS scores have been declining for three years and CMS reimbursement is tied to those scores now. We need to fix patient experience.

Ian: What's driving the decline based on what you know?

Naomi: The surveys point to communication with nurses and discharge process. Patients feel rushed and uninformed when they leave.

Ian: Those are very fixable, but they're process and training issues as much as technology.

Naomi: We know. We want a firm that can do the service design — map the journey, identify the root causes, redesign the key touchpoints — and then develop the training programs for clinical staff.

Ian: We've done patient experience work for five health systems. The discharge process specifically — we reduced 30-day readmission rates by 18% at one client through redesigned patient education.

Naomi: That's exactly the kind of outcome we need. What does an engagement look like?

Ian: Discovery phase is 8 weeks — journey mapping, staff interviews, patient focus groups. Then redesign and training development is another 12 weeks. Pilot in two hospitals, then system rollout.

Naomi: Budget?

Ian: Full engagement $1.2M to $1.8M depending on the number of training modules.`,
    opportunities: [
      {
        title: "Patient experience redesign — 4-hospital regional health system",
        description:
          "Regional hospital system (4 hospitals, 120 outpatient clinics) with declining HCAHPS scores affecting CMS reimbursement. Needs service design: journey mapping, root cause analysis, redesigned discharge process, and clinical staff training. $1.2M-$1.8M, 20-week engagement.",
        signalType: "direct",
        priority: "high",
        resolutionApproach: "network",
        requiredCategories: ["Service Design & CX", "Healthcare Marketing & Medical Affairs"],
        requiredSkills: ["Service Design", "Patient Experience", "Journey Mapping", "Clinical Training"],
        requiredIndustries: ["Healthcare", "Hospital Systems"],
        estimatedValue: "$1.2M–$1.8M",
        timeline: "1-3 months",
        clientName: "Regional Hospital System",
        clientSizeBand: "mid_201_500",
      },
    ],
  },
];

// ─── Main seed function ─────────────────────────────────────────────────────

async function seed() {
  console.log("Querying existing firms...");

  const firms = await sql`
    SELECT sf.id as firm_id, sf.name as firm_name, m.user_id
    FROM service_firms sf
    JOIN members m ON m.organization_id = sf.organization_id AND m.role = 'owner'
    LIMIT 20
  `;

  if (firms.length === 0) {
    console.log("No firms found in database. Cannot seed without existing firms.");
    console.log("Onboard at least one firm first, then re-run this script.");
    process.exit(0);
  }

  console.log(`Found ${firms.length} firm(s). Distributing examples across them...`);

  let transcriptCount = 0;
  let oppCount = 0;

  // Cycle through transcripts, distributing across firms
  for (let i = 0; i < TRANSCRIPTS.length * 3; i++) {
    const template = TRANSCRIPTS[i % TRANSCRIPTS.length];
    const firm = firms[i % firms.length] as { firm_id: string; firm_name: string; user_id: string };

    // Spread created_at dates over the last 90 days
    const daysAgo = Math.floor(Math.random() * 90);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const recId = uid("rec");
    const txId = uid("tx");

    // Create call recording
    await sql`
      INSERT INTO call_recordings (id, firm_id, user_id, call_type, duration_seconds, processed_at, created_at)
      VALUES (
        ${recId},
        ${firm.firm_id},
        ${firm.user_id},
        ${template.callType},
        ${Math.floor(Math.random() * 3000) + 600},
        ${createdAt.toISOString()},
        ${createdAt.toISOString()}
      )
    `;

    // Create transcript
    await sql`
      INSERT INTO call_transcripts (id, call_recording_id, full_text, processing_status, created_at)
      VALUES (
        ${txId},
        ${recId},
        ${template.fullText},
        'done',
        ${createdAt.toISOString()}
      )
    `;

    transcriptCount++;

    // Create extracted opportunities
    for (const opp of template.opportunities) {
      const oppId = uid("opp");
      await sql`
        INSERT INTO opportunities (
          id, firm_id, created_by, title, description,
          evidence, signal_type, priority, resolution_approach,
          required_categories, required_skills, required_industries, required_markets,
          estimated_value, timeline,
          client_name, client_size_band,
          source, source_id, status,
          created_at, updated_at
        ) VALUES (
          ${oppId}, ${firm.firm_id}, ${firm.user_id},
          ${opp.title}, ${opp.description},
          ${template.fullText.slice(0, 300)},
          ${opp.signalType}, ${opp.priority}, ${opp.resolutionApproach},
          ${JSON.stringify(opp.requiredCategories)},
          ${JSON.stringify(opp.requiredSkills)},
          ${JSON.stringify(opp.requiredIndustries)},
          '[]',
          ${opp.estimatedValue}, ${opp.timeline},
          ${opp.clientName}, ${opp.clientSizeBand},
          'call', ${txId}, 'new',
          ${createdAt.toISOString()}, ${createdAt.toISOString()}
        )
      `;
      oppCount++;
    }

    process.stdout.write(`\r  Seeded ${transcriptCount} transcripts, ${oppCount} opportunities...`);
  }

  console.log(`\n\nDone. Created:`);
  console.log(`  ${transcriptCount} call transcripts`);
  console.log(`  ${oppCount} extracted opportunities`);
  console.log(`  Distributed across ${firms.length} firm(s)`);
}

seed().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
