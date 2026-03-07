/**
 * Public Taxonomy API
 *
 * GET /api/public/taxonomy — Returns skills, industries/categories,
 * markets, and firm relationship data.
 *
 * No authentication required. Designed for third-party integrations.
 * Rate limited via API key or open access (configurable).
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

// In-memory cache to avoid re-reading CSV files on every request
let taxonomyCache: TaxonomyData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface TaxonomyData {
  categories: Category[];
  skills: SkillTaxonomy;
  firmRelationships: FirmRelationship[];
  meta: {
    categoriesCount: number;
    skillsL1Count: number;
    skillsL2Count: number;
    firmRelationshipsCount: number;
    lastUpdated: string;
  };
}

interface Category {
  name: string;
  definition: string;
  sampleOrgs: string[];
  theme: string | null;
}

interface SkillTaxonomy {
  l1Categories: string[];
  l1ToL2: Record<string, string[]>;
}

interface FirmRelationship {
  firmTypeA: string;
  firmTypeB: string;
  relationshipType: string;
  description: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function loadTaxonomy(): Promise<TaxonomyData> {
  if (taxonomyCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return taxonomyCache;
  }

  const dataDir = join(process.cwd(), "data");

  // Load categories
  const categoriesRaw = await fs.readFile(join(dataDir, "categories.csv"), "utf-8");
  const categoriesLines = categoriesRaw.trim().split("\n").slice(1); // skip header
  const categories: Category[] = categoriesLines.map((line) => {
    const cols = parseCSVLine(line);
    return {
      name: cols[0] ?? "",
      definition: cols[1] ?? "",
      sampleOrgs: (cols[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      theme: cols[3] && cols[3] !== "-" ? cols[3] : null,
    };
  });

  // Load skills L1→L2
  const skillsL1Raw = await fs.readFile(join(dataDir, "skills-L1.csv"), "utf-8");
  const skillsL1Lines = skillsL1Raw.trim().split("\n").slice(1);
  const l1ToL2: Record<string, string[]> = {};
  const l1Set = new Set<string>();

  for (const line of skillsL1Lines) {
    const cols = parseCSVLine(line);
    const l1 = cols[0] ?? "";
    const l2 = cols[1] ?? "";
    l1Set.add(l1);
    if (!l1ToL2[l1]) l1ToL2[l1] = [];
    if (l2 && !l1ToL2[l1].includes(l2)) l1ToL2[l1].push(l2);
  }

  // Load firm relationships
  const relRaw = await fs.readFile(join(dataDir, "firm-relationships.csv"), "utf-8");
  const relLines = relRaw.trim().split("\n").slice(1);
  const firmRelationships: FirmRelationship[] = relLines.map((line) => {
    const cols = parseCSVLine(line);
    return {
      firmTypeA: cols[0] ?? "",
      firmTypeB: cols[1] ?? "",
      relationshipType: cols[2] ?? "",
      description: cols[3] ?? "",
    };
  });

  const data: TaxonomyData = {
    categories,
    skills: {
      l1Categories: Array.from(l1Set),
      l1ToL2,
    },
    firmRelationships,
    meta: {
      categoriesCount: categories.length,
      skillsL1Count: l1Set.size,
      skillsL2Count: Object.values(l1ToL2).flat().length,
      firmRelationshipsCount: firmRelationships.length,
      lastUpdated: new Date().toISOString(),
    },
  };

  taxonomyCache = data;
  cacheTimestamp = Date.now();
  return data;
}

export async function GET(req: NextRequest) {
  // Optional API key check
  const apiKey = req.headers.get("x-api-key");
  const requiredKey = process.env.PUBLIC_API_KEY;

  if (requiredKey && apiKey !== requiredKey) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const section = url.searchParams.get("section"); // categories | skills | relationships | all

  try {
    const data = await loadTaxonomy();

    // Allow requesting specific sections
    if (section === "categories") {
      return NextResponse.json(
        { categories: data.categories, meta: { count: data.meta.categoriesCount } },
        { headers: corsHeaders() }
      );
    }
    if (section === "skills") {
      return NextResponse.json(
        { skills: data.skills, meta: { l1Count: data.meta.skillsL1Count, l2Count: data.meta.skillsL2Count } },
        { headers: corsHeaders() }
      );
    }
    if (section === "relationships") {
      return NextResponse.json(
        { firmRelationships: data.firmRelationships, meta: { count: data.meta.firmRelationshipsCount } },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json(data, { headers: corsHeaders() });
  } catch (err) {
    console.error("[Public Taxonomy API] Error:", err);
    return NextResponse.json(
      { error: "Failed to load taxonomy data" },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Cache-Control": "public, max-age=3600", // 1 hour
  };
}
