/**
 * Taxonomy Data — loads the canonical reference data from CSV files.
 *
 * This is the SINGLE SOURCE OF TRUTH for all tagging in the system.
 * Every tag (skills, categories, markets, languages) comes from here,
 * not from hardcoded regex patterns.
 *
 * Data files:
 * - data/categories.csv — 30 firm categories
 * - data/skills-L1.csv — L1→L2 skill mapping (247 entries)
 * - data/skills-L3-map.csv — L2→L3 granular skills (18,421 entries)
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── Categories ──────────────────────────────────────────

export interface FirmCategory {
  name: string;
  definition: string;
  sampleOrgs: string[];
  theme: string;
}

let _categories: FirmCategory[] | null = null;

export function getFirmCategories(): FirmCategory[] {
  if (_categories) return _categories;
  const raw = readCsv("categories.csv");
  _categories = raw.map((row) => ({
    name: row[0],
    definition: row[1] ?? "",
    sampleOrgs: (row[2] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    theme: row[3] ?? "",
  }));
  return _categories;
}

// ─── Skills ──────────────────────────────────────────────

export interface SkillL1L2 {
  l1: string;
  l2: string;
}

export interface SkillL2L3 {
  l2: string;
  l3: string;
}

let _skillsL1L2: SkillL1L2[] | null = null;
let _skillsL2L3: SkillL2L3[] | null = null;
let _skillL1Names: string[] | null = null;
let _skillL2Names: string[] | null = null;

export function getSkillsL1L2(): SkillL1L2[] {
  if (_skillsL1L2) return _skillsL1L2;
  const raw = readCsv("skills-L1.csv");
  _skillsL1L2 = raw.map((row) => ({ l1: row[0], l2: row[1] }));
  return _skillsL1L2;
}

export function getSkillsL2L3(): SkillL2L3[] {
  if (_skillsL2L3) return _skillsL2L3;
  const raw = readCsv("skills-L3-map.csv");
  _skillsL2L3 = raw.map((row) => ({ l2: row[0], l3: row[1] }));
  return _skillsL2L3;
}

/** All unique L1 skill categories (e.g., "Information Technology", "Marketing and Public Relations") */
export function getSkillL1Names(): string[] {
  if (_skillL1Names) return _skillL1Names;
  _skillL1Names = [...new Set(getSkillsL1L2().map((s) => s.l1))];
  return _skillL1Names;
}

/** All unique L2 skill subcategories (e.g., "Digital Marketing", "Cloud Computing") — 247 items */
export function getSkillL2Names(): string[] {
  if (_skillL2Names) return _skillL2Names;
  _skillL2Names = [...new Set(getSkillsL1L2().map((s) => s.l2))];
  return _skillL2Names;
}

/** Get the L1 parent for a given L2 skill */
export function getL1ForL2(l2Name: string): string | null {
  const match = getSkillsL1L2().find(
    (s) => s.l2.toLowerCase() === l2Name.toLowerCase()
  );
  return match?.l1 ?? null;
}

// ─── Markets (Countries + Regions) ───────────────────────

/** Every UN-recognized country + common regions and major cities */
export function getMarkets(): string[] {
  return MARKETS;
}

// ─── Languages ───────────────────────────────────────────

/** Business/spoken languages firms may operate in */
export function getLanguages(): string[] {
  return LANGUAGES;
}

// ─── CSV Parser ──────────────────────────────────────────

function readCsv(filename: string): string[][] {
  const filePath = join(process.cwd(), "data", filename);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  // Skip header row
  return lines.slice(1).map(parseCsvLine);
}

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

// ─── Static data: Markets ────────────────────────────────
// Every UN-recognized sovereign state + common regions/groupings

const MARKETS: string[] = [
  // Regions & Groupings
  "Global", "North America", "Latin America", "Europe", "EMEA",
  "Asia Pacific", "APAC", "Middle East", "MENA", "Sub-Saharan Africa",
  "Central America", "Caribbean", "Southeast Asia", "ASEAN",
  "Central Asia", "Eastern Europe", "Western Europe", "Nordic",
  "DACH", "Benelux", "Oceania", "South Asia", "East Asia",
  "GCC", "EU", "Commonwealth",

  // Africa (54 countries)
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Democratic Republic of the Congo",
  "Cote d'Ivoire", "Djibouti", "Egypt", "Equatorial Guinea",
  "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana",
  "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
  "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
  "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
  "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
  "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania",
  "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",

  // Americas (35 countries)
  "Antigua and Barbuda", "Argentina", "Bahamas", "Barbados", "Belize",
  "Bolivia", "Brazil", "Canada", "Chile", "Colombia", "Costa Rica",
  "Cuba", "Dominica", "Dominican Republic", "Ecuador", "El Salvador",
  "Grenada", "Guatemala", "Guyana", "Haiti", "Honduras", "Jamaica",
  "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru",
  "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Suriname",
  "Trinidad and Tobago", "United States", "Uruguay", "Venezuela",

  // Asia (49 countries)
  "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh",
  "Bhutan", "Brunei", "Cambodia", "China", "Cyprus", "Georgia",
  "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan",
  "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon",
  "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea",
  "Oman", "Pakistan", "Palestine", "Philippines", "Qatar",
  "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria",
  "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey",
  "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",

  // Europe (44 countries)
  "Albania", "Andorra", "Austria", "Belarus", "Belgium",
  "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia",
  "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova",
  "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway",
  "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
  "Ukraine", "United Kingdom",

  // Oceania (14 countries)
  "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia",
  "Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa",
  "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu",
];

// ─── Static data: Languages ─────────────────────────────
// Business/spoken languages for firm tagging

const LANGUAGES: string[] = [
  "English", "Spanish", "French", "German", "Portuguese", "Mandarin",
  "Cantonese", "Japanese", "Korean", "Arabic", "Hindi", "Bengali",
  "Urdu", "Punjabi", "Tamil", "Telugu", "Marathi", "Gujarati",
  "Kannada", "Malayalam", "Dutch", "Italian", "Russian", "Swedish",
  "Danish", "Norwegian", "Finnish", "Polish", "Turkish", "Thai",
  "Vietnamese", "Indonesian", "Malay", "Hebrew", "Czech", "Romanian",
  "Hungarian", "Greek", "Ukrainian", "Tagalog", "Persian", "Farsi",
  "Swahili", "Amharic", "Yoruba", "Igbo", "Hausa", "Zulu",
  "Afrikaans", "Catalan", "Basque", "Galician", "Croatian", "Serbian",
  "Bosnian", "Slovak", "Slovenian", "Bulgarian", "Lithuanian",
  "Latvian", "Estonian", "Albanian", "Macedonian", "Georgian",
  "Armenian", "Azerbaijani", "Kazakh", "Uzbek", "Mongolian",
  "Burmese", "Khmer", "Lao", "Sinhala", "Nepali", "Pashto",
  "Kurdish", "Somali", "Tigrinya", "Malagasy",
];
