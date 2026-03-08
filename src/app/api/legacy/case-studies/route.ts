import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { LegacyCaseStudy } from "@/types/cos-data";

export const dynamic = "force-dynamic";

// ─── Legacy data types ────────────────────────────────────

interface LegacyCaseStudyRaw {
  authorId: string;
  about: string | null;
  status: string;
  summary: string | null;
  case_study_companies: Array<{
    companyID: string;
    company: { name: string };
  }>;
  case_study_industries: Array<{
    industry: { id: string; name: string };
  }>;
  case_study_languages: Array<{
    language: { id: string; name: string };
  }>;
  case_study_links: Array<{ link: string }>;
  case_study_markets: Array<{ countryCode: string }>;
  case_study_skills: Array<{ skill: { id: string; name: string } }>;
  case_study_users: Array<{
    user_meta: { id: string };
  }>;
  organisation: {
    id: string;
    organisation_detail: { business_name: string };
  } | null;
}

// ─── Cached data ──────────────────────────────────────────

let cachedCaseStudies: LegacyCaseStudyRaw[] | null = null;

/** Org name → legacy org ID lookup (built from user-basic.json) */
let cachedOrgLookup: Map<string, string> | null = null;

/** User ID → name lookup for contributor names */
let cachedUserNames: Map<string, string> | null = null;

function loadCaseStudyData() {
  if (cachedCaseStudies) return;

  const dataRoot = path.join(
    process.cwd(),
    "data",
    "legacy",
    "Data Dump (JSON)"
  );

  // Case studies
  const csPath = path.join(
    dataRoot,
    "Step 3_ Organization Content Data",
    "case-studies.json"
  );
  const csRaw = JSON.parse(fs.readFileSync(csPath, "utf-8"));
  cachedCaseStudies = csRaw.data.case_study as LegacyCaseStudyRaw[];

  // Build org name → ID lookup from user-basic
  const userBasicPath = path.join(
    dataRoot,
    "Step 3_ Organization Content Data",
    "user-basic.json"
  );
  const userBasicRaw = JSON.parse(fs.readFileSync(userBasicPath, "utf-8"));
  cachedOrgLookup = new Map<string, string>();
  cachedUserNames = new Map<string, string>();

  for (const u of userBasicRaw.data.user_meta) {
    // Org lookup
    if (u.organisation?.organisation_detail?.business_name) {
      const name =
        u.organisation.organisation_detail.business_name.toLowerCase();
      if (!cachedOrgLookup.has(name)) {
        cachedOrgLookup.set(name, u.organisation.id);
      }
    }
    // User name lookup for contributors
    if (u.firstName || u.lastName) {
      cachedUserNames.set(
        u.id,
        `${u.firstName || ""} ${u.lastName || ""}`.trim()
      );
    }
  }
}

// ─── Title extraction ─────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(cs: LegacyCaseStudyRaw): string {
  // 1. Summary field — best source
  if (cs.summary && cs.summary.trim().length > 0) {
    const summary = cs.summary.trim();
    // Truncate at ~100 chars on a word boundary
    if (summary.length <= 100) return summary;
    return summary.substring(0, 97).replace(/\s+\S*$/, "") + "…";
  }

  // 2. Extract first <strong> content from about HTML
  if (cs.about) {
    const strongMatch = cs.about.match(/<strong>(.*?)<\/strong>/i);
    if (strongMatch) {
      const text = stripHtml(strongMatch[1]).replace(/:\s*$/, "");
      if (text.length > 3 && text.length < 120) {
        return text;
      }
    }
  }

  // 3. First sentence of about (stripped of HTML)
  if (cs.about) {
    const plainText = stripHtml(cs.about);
    if (plainText.length > 3) {
      // Take first sentence or up to 100 chars
      const sentenceEnd = plainText.search(/[.!?]\s/);
      if (sentenceEnd > 0 && sentenceEnd < 120) {
        return plainText.substring(0, sentenceEnd + 1);
      }
      if (plainText.length <= 100) return plainText;
      return plainText.substring(0, 97).replace(/\s+\S*$/, "") + "…";
    }
  }

  // 4. Fallback: client company names
  const clientNames = (cs.case_study_companies || [])
    .map((c) => c.company.name)
    .filter((n) => !n.toLowerCase().includes("chameleon"));
  if (clientNames.length > 0) {
    return `Case Study: ${clientNames.slice(0, 2).join(" & ")}`;
  }

  return "Untitled Case Study";
}

// ─── Map to LegacyCaseStudy ──────────────────────────────

function mapCaseStudy(
  cs: LegacyCaseStudyRaw,
  index: number
): LegacyCaseStudy {
  const title = extractTitle(cs);
  const aboutText = cs.about ? stripHtml(cs.about) : "";

  const skills = (cs.case_study_skills || []).map((s) => s.skill.name);
  const industries = (cs.case_study_industries || []).map(
    (i) => i.industry.name
  );
  const clients = (cs.case_study_companies || [])
    .map((c) => c.company.name)
    .filter((n) => !n.toLowerCase().includes("chameleon"));
  const links = (cs.case_study_links || []).map((l) => l.link);
  const markets = (cs.case_study_markets || []).map((m) => m.countryCode);

  // Resolve contributor names
  const contributorNames = (cs.case_study_users || [])
    .map((u) => cachedUserNames!.get(u.user_meta?.id))
    .filter(Boolean) as string[];

  return {
    id: `legacy-cs-${index}`,
    title,
    aboutText:
      aboutText.length > 500
        ? aboutText.substring(0, 497).replace(/\s+\S*$/, "") + "…"
        : aboutText,
    status: cs.status,
    skills,
    industries,
    clients,
    links,
    markets,
    contributorNames,
  };
}

// ─── GET /api/legacy/case-studies ─────────────────────────

export async function GET(req: NextRequest) {
  try {
    loadCaseStudyData();

    const url = new URL(req.url);
    const orgName = url.searchParams.get("orgName");
    const statusFilter = url.searchParams.get("status"); // "published" | "draft" | null (all)
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1),
      200
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") || "0", 10),
      0
    );

    if (!orgName) {
      return NextResponse.json(
        { error: "orgName query parameter is required" },
        { status: 400 }
      );
    }

    // Look up org ID from name
    const orgId = cachedOrgLookup!.get(orgName.toLowerCase());
    if (!orgId) {
      return NextResponse.json({
        caseStudies: [],
        total: 0,
        hasMore: false,
      });
    }

    // Filter case studies for this org
    let orgCaseStudies = cachedCaseStudies!.filter(
      (cs) => cs.organisation?.id === orgId
    );

    // Optional status filter
    if (statusFilter) {
      orgCaseStudies = orgCaseStudies.filter(
        (cs) => cs.status === statusFilter
      );
    }

    const total = orgCaseStudies.length;

    // Paginate and map
    const paginated = orgCaseStudies.slice(offset, offset + limit);
    const caseStudies = paginated.map((cs, i) =>
      mapCaseStudy(cs, offset + i)
    );

    return NextResponse.json({
      caseStudies,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("[Legacy] Case Studies API error:", error);
    return NextResponse.json(
      { error: "Failed to load legacy case study data" },
      { status: 500 }
    );
  }
}
