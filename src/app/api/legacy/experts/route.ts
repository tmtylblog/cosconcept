import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { Expert, ExpertSpecialistProfile } from "@/types/cos-data";
import { DIVISION_COLORS } from "@/types/cos-data";

export const dynamic = "force-dynamic";

// ─── Cached legacy data (parsed once per cold start) ───────

interface LegacyUserBasic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  organisation: {
    id: string;
    organisation_detail: { business_name: string };
  } | null;
  user_meta_cos_user_roles: Array<{
    cos_user_role: { name: string };
  }>;
}

interface LegacyUserDetails {
  id: string;
  user_basic_information: {
    city: string | null;
    country: string | null;
    stateOrProvince: string | null;
  } | null;
  user_professional_information: {
    hourlyRate: number | null;
    linkedInUrl: string | null;
  } | null;
  user_skills: Array<{ skill: { id: string; name: string } }>;
  user_industry_experiences: Array<{
    industry: { id: string; name: string };
  }>;
}

interface LegacySpecProfile {
  id: string;
  user_profiles: Array<{
    id: string;
    role: string | null;
    summary: string | null;
    slideUrl: string | null;
    user_profile_skills: Array<{ skill: { id: string; name: string } }>;
    user_profile_industries: Array<{
      industry: { id: string; name: string };
    }>;
  }>;
}

let cachedUserBasic: LegacyUserBasic[] | null = null;
let cachedUserDetails: Map<string, LegacyUserDetails> | null = null;
let cachedSpecProfiles: Map<string, LegacySpecProfile> | null = null;

function loadLegacyData() {
  if (cachedUserBasic) return;

  const dataRoot = path.join(
    process.cwd(),
    "data",
    "legacy",
    "Data Dump (JSON)"
  );

  // Step 3: user-basic.json — names, emails, titles, orgs, roles
  const userBasicPath = path.join(
    dataRoot,
    "Step 3_ Organization Content Data",
    "user-basic.json"
  );
  const userBasicRaw = JSON.parse(fs.readFileSync(userBasicPath, "utf-8"));
  cachedUserBasic = userBasicRaw.data.user_meta as LegacyUserBasic[];

  // Step 4: user-details.json — skills, industries, location, rates
  const userDetailsPath = path.join(
    dataRoot,
    "Step 4_ User Profile Data",
    "user-details.json"
  );
  const userDetailsRaw = JSON.parse(fs.readFileSync(userDetailsPath, "utf-8"));
  cachedUserDetails = new Map<string, LegacyUserDetails>();
  for (const u of userDetailsRaw.data.user_meta as LegacyUserDetails[]) {
    cachedUserDetails.set(u.id, u);
  }

  // Step 4: user-specialized-profile.json — specialist profiles
  const specPath = path.join(
    dataRoot,
    "Step 4_ User Profile Data",
    "user-specialized-profile.json"
  );
  const specRaw = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  cachedSpecProfiles = new Map<string, LegacySpecProfile>();
  for (const u of specRaw.data.user_meta as LegacySpecProfile[]) {
    if (u.user_profiles && u.user_profiles.length > 0) {
      cachedSpecProfiles.set(u.id, u);
    }
  }
}

// ─── Role → Division mapping ──────────────────────────────

type Division = Expert["division"];

function mapDivision(
  roles: Array<{ cos_user_role: { name: string } }>
): Division {
  const roleNames = roles.map((r) => r.cos_user_role.name);
  if (
    roleNames.includes("Collective Manager") ||
    roleNames.includes("Admin")
  ) {
    return "Collective Member";
  }
  if (roleNames.includes("Trusted Expert")) {
    return "Trusted Expert";
  }
  if (
    roleNames.includes("Expert") ||
    roleNames.includes("Deal Maker") ||
    roleNames.includes("Partnership Admin") ||
    roleNames.includes("Advisor")
  ) {
    return "Expert";
  }
  return "Unknown";
}

// ─── Build Expert from legacy data ────────────────────────

function buildExpert(
  basic: LegacyUserBasic,
  details: LegacyUserDetails | undefined,
  specProfile: LegacySpecProfile | undefined
): Expert {
  const division = mapDivision(basic.user_meta_cos_user_roles || []);

  // Location from user_basic_information
  let location: string | undefined;
  if (details?.user_basic_information) {
    const info = details.user_basic_information;
    const parts = [info.city, info.stateOrProvince, info.country].filter(
      Boolean
    );
    location = parts.join(", ") || undefined;
  }

  // Skills from user_details
  const skills = (details?.user_skills || []).map((s) => s.skill.name);

  // Industries from user_details
  const industries = (details?.user_industry_experiences || []).map(
    (i) => i.industry.name
  );

  // Hourly rate
  const hourlyRate = details?.user_professional_information?.hourlyRate ?? null;

  // LinkedIn URL
  const linkedinUrl =
    details?.user_professional_information?.linkedInUrl || undefined;

  // Specialist sub-profiles
  let specialistProfiles: ExpertSpecialistProfile[] | undefined;
  if (specProfile?.user_profiles?.length) {
    specialistProfiles = specProfile.user_profiles
      .filter((p) => p.role || p.summary) // skip empty profiles
      .map((p) => ({
        id: p.id,
        title: p.role || "Specialist",
        summary: p.summary || "",
        skills: (p.user_profile_skills || []).map((s) => s.skill.name),
        industries: (p.user_profile_industries || []).map(
          (i) => i.industry.name
        ),
        services: [],
        relevantCaseStudyIds: [],
        searchKeywords: [],
      }));
  }

  return {
    id: basic.id,
    name: `${basic.firstName} ${basic.lastName}`.trim(),
    email: basic.email,
    role: basic.title || "Expert",
    skills,
    industries,
    hourlyRate,
    availability: "Available",
    division,
    divisionColor: DIVISION_COLORS[division],
    linkedinUrl,
    location,
    firmId: basic.organisation?.id,
    specialistProfiles:
      specialistProfiles && specialistProfiles.length > 0
        ? specialistProfiles
        : undefined,
  };
}

// ─── GET /api/legacy/experts ──────────────────────────────

export async function GET(req: NextRequest) {
  try {
    loadLegacyData();

    const url = new URL(req.url);
    const orgName = url.searchParams.get("orgName");
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

    // Find users matching the org name (case-insensitive)
    const orgNameLower = orgName.toLowerCase();
    const orgUsers = cachedUserBasic!.filter(
      (u) =>
        u.organisation?.organisation_detail?.business_name
          ?.toLowerCase() === orgNameLower
    );

    if (orgUsers.length === 0) {
      return NextResponse.json({
        experts: [],
        total: 0,
        hasMore: false,
      });
    }

    const total = orgUsers.length;

    // Paginate
    const pageUsers = orgUsers.slice(offset, offset + limit);

    // Build Expert objects
    const experts: Expert[] = pageUsers.map((basic) => {
      const details = cachedUserDetails!.get(basic.id);
      const specProfile = cachedSpecProfiles!.get(basic.id);
      return buildExpert(basic, details, specProfile);
    });

    return NextResponse.json({
      experts,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("[Legacy] Experts API error:", error);
    return NextResponse.json(
      { error: "Failed to load legacy expert data" },
      { status: 500 }
    );
  }
}
