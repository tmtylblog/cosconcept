/**
 * GET /api/partner-sync/taxonomy
 *
 * Returns the full COS taxonomy for partner graph seeding.
 * Called daily by CORE's graph_taxonomy sync job.
 */

import { NextResponse } from "next/server";
import { authenticatePartner } from "../lib/auth";
import {
  getFirmCategories,
  getSkillsL1L2,
  getSkillsL2L3,
  getSkillL1Names,
  getMarkets,
  getLanguages,
  FIRM_TYPES,
  TECH_CATEGORIES,
  SERVICE_CATEGORIES,
  SERVICES_BY_CATEGORY,
  INDUSTRY_HIERARCHY,
  MARKET_HIERARCHY,
  LANGUAGE_ISO_MAP,
} from "@/lib/taxonomy-full";

// Firm relationship CSV loader (reuse from seed)
import { readFileSync } from "fs";
import { join } from "path";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function loadFirmRelationships() {
  const filePath = join(process.cwd(), "data", "firm-relationships.csv");
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      from: fields[0] ?? "",
      to: fields[1] ?? "",
      nature: fields[2] ?? "",
      direction: fields[4] ?? "",
      frequency: fields[5] ?? "",
      revenueModel: fields[6] ?? "",
    };
  });
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // ─── Skills ───────────────────────────────────────
    const l1l2 = getSkillsL1L2();
    const l2l3 = getSkillsL2L3();
    const skillL1Names = getSkillL1Names();

    const skillL1 = skillL1Names.map((name) => ({ name }));

    // L2 skills
    const seenL2 = new Set<string>();
    const skills: { name: string; level: string; l1: string; l2: string }[] = [];
    for (const s of l1l2) {
      if (!seenL2.has(s.l2)) {
        seenL2.add(s.l2);
        skills.push({ name: s.l2, level: "L2", l1: s.l1, l2: s.l2 });
      }
    }
    // L3 skills
    for (const s of l2l3) {
      skills.push({ name: s.l3, level: "L3", l1: "", l2: s.l2 });
    }

    // ─── Categories ───────────────────────────────────
    const categories = getFirmCategories().map((c) => ({
      name: c.name,
      definition: c.definition,
      theme: c.theme,
    }));

    // ─── Industries ───────────────────────────────────
    const industryL1 = Object.keys(INDUSTRY_HIERARCHY).map((name) => ({ name }));
    const industries: { name: string }[] = [];
    for (const l2Names of Object.values(INDUSTRY_HIERARCHY)) {
      for (const name of l2Names) {
        industries.push({ name });
      }
    }

    // ─── Markets ──────────────────────────────────────
    const allMarketNames = getMarkets();
    const regionSet = new Set(Object.keys(MARKET_HIERARCHY));
    // Build a name→isoCode lookup from the hierarchy
    const isoLookup: Record<string, string> = {};
    for (const countries of Object.values(MARKET_HIERARCHY)) {
      for (const c of countries) {
        isoLookup[c.name] = c.isoCode;
      }
    }
    const markets = allMarketNames.map((name) => ({
      name,
      type: regionSet.has(name) ? "region" : "country",
      isoCode: isoLookup[name] ?? null,
      level: regionSet.has(name) ? "region" : "country",
    }));

    // ─── Languages ────────────────────────────────────
    const languages = getLanguages().map((name) => ({
      name,
      isoCode: LANGUAGE_ISO_MAP[name] ?? null,
    }));

    // ─── Firm Types ───────────────────────────────────
    const firmTypes = FIRM_TYPES.map((ft) => ({
      name: ft.name,
      description: ft.description,
    }));

    // ─── Services ─────────────────────────────────────
    const serviceCategories = SERVICE_CATEGORIES.map((sc) => ({
      name: sc.name,
    }));
    const services: { name: string; category: string }[] = [];
    for (const [cat, names] of Object.entries(SERVICES_BY_CATEGORY)) {
      for (const name of names) {
        services.push({ name, category: cat });
      }
    }

    // ─── Tech Categories ──────────────────────────────
    const techCategories = TECH_CATEGORIES.map((tc) => ({
      name: tc.name,
      slug: tc.slug,
    }));

    // ─── Partnership Edges ────────────────────────────
    const partnersWithEdges = loadFirmRelationships();

    return NextResponse.json({
      version: "1.0.0",
      skills,
      skillL1,
      industries,
      industryL1,
      categories,
      markets,
      languages,
      firmTypes,
      serviceCategories,
      services,
      techCategories,
      partnersWithEdges,
    });
  } catch (err) {
    console.error("[Partner Sync] taxonomy failed:", err);
    return NextResponse.json(
      { error: "Failed to build taxonomy" },
      { status: 500 }
    );
  }
}
