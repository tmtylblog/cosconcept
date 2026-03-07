/**
 * Taxonomy — CSV reference data parsers
 *
 * Parses the CSV files in data/ and exposes typed helper functions
 * used by the Neo4j seed script and matching engine.
 *
 * Data sources:
 * - data/categories.csv        → 30 firm categories
 * - data/skills-L1.csv         → L1 → L2 skill mapping (247 L2 skills)
 * - data/skills-L3-map.csv     → L2 → L3 skill mapping (18,421 L3 skills)
 * - data/firm-relationships.csv → 346 firm partnership pairings
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── CSV Parsing ────────────────────────────────────────

/**
 * Parse a CSV line respecting quoted fields (handles commas inside quotes).
 */
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

function readCsvFile(filename: string): string[][] {
  const filePath = join(process.cwd(), "data", filename);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  // Skip header row, parse remaining
  return lines.slice(1).map(parseCsvLine);
}

// ─── Categories ─────────────────────────────────────────

export interface FirmCategory {
  name: string;
  definition: string;
  theme: string;
  sampleOrgs: string[];
}

let _categoriesCache: FirmCategory[] | null = null;

/**
 * Get all 30 firm categories from categories.csv.
 * Columns: Category, Definition, Sample Orgs, Theme
 */
export function getFirmCategories(): FirmCategory[] {
  if (_categoriesCache) return _categoriesCache;

  const rows = readCsvFile("categories.csv");
  _categoriesCache = rows
    .filter((fields) => fields[0]) // skip empty rows
    .map((fields) => ({
      name: fields[0] ?? "",
      definition: fields[1] ?? "",
      sampleOrgs: (fields[2] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      theme: fields[3] ?? "-",
    }));

  return _categoriesCache;
}

// ─── Skills ─────────────────────────────────────────────

export interface SkillL1L2 {
  l1: string;
  l2: string;
}

export interface SkillL2L3 {
  l2: string;
  l3: string;
}

let _skillsL1L2Cache: SkillL1L2[] | null = null;
let _skillsL2L3Cache: SkillL2L3[] | null = null;

/**
 * Get L1 → L2 skill mapping (247 L2 skills under ~25 L1 categories).
 * Columns: L1, L2
 */
export function getSkillsL1L2(): SkillL1L2[] {
  if (_skillsL1L2Cache) return _skillsL1L2Cache;

  const rows = readCsvFile("skills-L1.csv");
  _skillsL1L2Cache = rows
    .filter((fields) => fields[0] && fields[1])
    .map((fields) => ({
      l1: fields[0]!,
      l2: fields[1]!,
    }));

  return _skillsL1L2Cache;
}

/**
 * Get L2 → L3 skill mapping (18,421 granular skills/tools).
 * Columns: L2, L3
 */
export function getSkillsL2L3(): SkillL2L3[] {
  if (_skillsL2L3Cache) return _skillsL2L3Cache;

  const rows = readCsvFile("skills-L3-map.csv");
  _skillsL2L3Cache = rows
    .filter((fields) => fields[0] && fields[1])
    .map((fields) => ({
      l2: fields[0]!,
      l3: fields[1]!,
    }));

  return _skillsL2L3Cache;
}

/**
 * Get unique L1 skill category names.
 */
export function getSkillL1Names(): string[] {
  const skills = getSkillsL1L2();
  return [...new Set(skills.map((s) => s.l1))];
}

/**
 * Get unique L2 skill names.
 */
export function getSkillL2Names(): string[] {
  const skills = getSkillsL1L2();
  return [...new Set(skills.map((s) => s.l2))];
}

// ─── Markets ────────────────────────────────────────────

/**
 * Get all market names (countries + regions).
 * These are used for geographic targeting in matching.
 */
export function getMarkets(): string[] {
  return [
    // Regions
    "Global",
    "North America",
    "Latin America",
    "Europe",
    "EMEA",
    "Asia Pacific",
    "APAC",
    "Middle East",
    "MENA",
    "Sub-Saharan Africa",
    "Central America",
    "Caribbean",
    "Southeast Asia",
    "ASEAN",
    "Central Asia",
    "Eastern Europe",
    "Western Europe",
    "Nordic",
    "DACH",
    "Benelux",
    "Oceania",
    "South Asia",
    "East Asia",
    "GCC",
    "EU",
    "Commonwealth",

    // Countries — Major markets
    "United States",
    "Canada",
    "United Kingdom",
    "Germany",
    "France",
    "Netherlands",
    "Belgium",
    "Luxembourg",
    "Switzerland",
    "Austria",
    "Sweden",
    "Norway",
    "Denmark",
    "Finland",
    "Iceland",
    "Ireland",
    "Spain",
    "Portugal",
    "Italy",
    "Greece",
    "Poland",
    "Czech Republic",
    "Romania",
    "Hungary",
    "Bulgaria",
    "Croatia",
    "Slovakia",
    "Slovenia",
    "Serbia",
    "Ukraine",
    "Turkey",
    "Russia",
    "Estonia",
    "Latvia",
    "Lithuania",

    // Asia Pacific
    "Australia",
    "New Zealand",
    "Japan",
    "South Korea",
    "China",
    "Hong Kong",
    "Taiwan",
    "Singapore",
    "Malaysia",
    "Indonesia",
    "Thailand",
    "Vietnam",
    "Philippines",
    "India",
    "Pakistan",
    "Bangladesh",
    "Sri Lanka",
    "Nepal",
    "Myanmar",
    "Cambodia",
    "Laos",
    "Mongolia",

    // Middle East & Africa
    "United Arab Emirates",
    "Saudi Arabia",
    "Qatar",
    "Bahrain",
    "Kuwait",
    "Oman",
    "Israel",
    "Jordan",
    "Lebanon",
    "Egypt",
    "Morocco",
    "Tunisia",
    "Algeria",
    "Libya",
    "Nigeria",
    "South Africa",
    "Kenya",
    "Ghana",
    "Ethiopia",
    "Tanzania",
    "Uganda",
    "Rwanda",
    "Senegal",
    "Côte d'Ivoire",
    "Cameroon",
    "Mozambique",
    "Zimbabwe",
    "Botswana",
    "Namibia",
    "Mauritius",

    // Latin America
    "Mexico",
    "Brazil",
    "Argentina",
    "Colombia",
    "Chile",
    "Peru",
    "Ecuador",
    "Venezuela",
    "Uruguay",
    "Paraguay",
    "Bolivia",
    "Costa Rica",
    "Panama",
    "Guatemala",
    "Honduras",
    "El Salvador",
    "Nicaragua",
    "Dominican Republic",
    "Puerto Rico",
    "Cuba",
    "Jamaica",
    "Trinidad and Tobago",
    "Barbados",
    "Bahamas",
  ];
}

// ─── Languages ──────────────────────────────────────────

/**
 * Get all supported business languages.
 */
export function getLanguages(): string[] {
  return [
    "English",
    "Spanish",
    "French",
    "German",
    "Portuguese",
    "Italian",
    "Dutch",
    "Russian",
    "Japanese",
    "Korean",
    "Mandarin Chinese",
    "Cantonese",
    "Arabic",
    "Hindi",
    "Bengali",
    "Urdu",
    "Turkish",
    "Polish",
    "Czech",
    "Romanian",
    "Hungarian",
    "Greek",
    "Swedish",
    "Norwegian",
    "Danish",
    "Finnish",
    "Thai",
    "Vietnamese",
    "Indonesian",
    "Malay",
    "Filipino",
    "Hebrew",
    "Persian",
    "Swahili",
    "Ukrainian",
    "Croatian",
    "Serbian",
    "Bulgarian",
    "Slovak",
    "Slovenian",
    "Estonian",
    "Latvian",
    "Lithuanian",
    "Catalan",
    "Basque",
    "Galician",
    "Afrikaans",
    "Tamil",
    "Telugu",
    "Marathi",
    "Gujarati",
    "Punjabi",
    "Kannada",
    "Malayalam",
    "Sinhala",
    "Nepali",
    "Burmese",
    "Khmer",
    "Lao",
    "Mongolian",
    "Georgian",
    "Armenian",
    "Azerbaijani",
    "Kazakh",
    "Uzbek",
    "Amharic",
    "Yoruba",
    "Igbo",
    "Hausa",
    "Zulu",
    "Xhosa",
    "Somali",
    "Pashto",
    "Kurdish",
    "Icelandic",
    "Maltese",
    "Albanian",
    "Macedonian",
    "Bosnian",
    "Luxembourgish",
  ];
}

// ─── Persona Positioning (optional, for advanced use) ───

export interface PersonaPositioning {
  role: string;
  firmSize: string;
  positioning: string;
  painPoints: string;
  messaging: string;
}

let _personaCache: PersonaPositioning[] | null = null;

/**
 * Get persona positioning data — how to pitch by role × firm size.
 * Columns vary; we extract the first 5 meaningful columns.
 */
export function getPersonaPositioning(): PersonaPositioning[] {
  if (_personaCache) return _personaCache;

  try {
    const rows = readCsvFile("persona-positioning.csv");
    _personaCache = rows
      .filter((fields) => fields[0] && fields[1])
      .map((fields) => ({
        role: fields[0] ?? "",
        firmSize: fields[1] ?? "",
        positioning: fields[2] ?? "",
        painPoints: fields[3] ?? "",
        messaging: fields[4] ?? "",
      }));
  } catch {
    _personaCache = [];
  }

  return _personaCache;
}
