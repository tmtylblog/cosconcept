/**
 * Public API Health Check
 *
 * GET /api/public/health — Returns health status of all public APIs
 *
 * Used by the admin dashboard to show API health at a glance.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { promises as fs } from "fs";
import { join } from "path";

interface ApiHealth {
  name: string;
  path: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  recordCount: number;
  lastChecked: string;
  error?: string;
}

export async function GET() {
  const results: ApiHealth[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://joincollectiveos.com";

  // Check Taxonomy API
  const taxonomyStart = Date.now();
  try {
    const dataDir = join(process.cwd(), "data");
    const categoriesRaw = await fs.readFile(join(dataDir, "categories.csv"), "utf-8");
    const skillsRaw = await fs.readFile(join(dataDir, "skills-L1.csv"), "utf-8");

    results.push({
      name: "Taxonomy (Skills, Categories, Relationships)",
      path: `${baseUrl}/api/public/taxonomy`,
      status: "healthy",
      latencyMs: Date.now() - taxonomyStart,
      recordCount:
        categoriesRaw.trim().split("\n").length -
        1 +
        (skillsRaw.trim().split("\n").length - 1),
      lastChecked: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      name: "Taxonomy (Skills, Categories, Relationships)",
      path: `${baseUrl}/api/public/taxonomy`,
      status: "down",
      latencyMs: Date.now() - taxonomyStart,
      recordCount: 0,
      lastChecked: new Date().toISOString(),
      error: String(err),
    });
  }

  // Check Experts API
  const expertsStart = Date.now();
  try {
    const expertCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(abstractionProfiles)
      .where(eq(abstractionProfiles.entityType, "expert"));

    results.push({
      name: "Experts",
      path: `${baseUrl}/api/public/experts`,
      status: "healthy",
      latencyMs: Date.now() - expertsStart,
      recordCount: Number(expertCount[0]?.count ?? 0),
      lastChecked: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      name: "Experts",
      path: `${baseUrl}/api/public/experts`,
      status: "down",
      latencyMs: Date.now() - expertsStart,
      recordCount: 0,
      lastChecked: new Date().toISOString(),
      error: String(err),
    });
  }

  // Check Case Studies API
  const csStart = Date.now();
  try {
    const csCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(abstractionProfiles)
      .where(eq(abstractionProfiles.entityType, "case_study"));

    results.push({
      name: "Case Studies",
      path: `${baseUrl}/api/public/case-studies`,
      status: "healthy",
      latencyMs: Date.now() - csStart,
      recordCount: Number(csCount[0]?.count ?? 0),
      lastChecked: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      name: "Case Studies",
      path: `${baseUrl}/api/public/case-studies`,
      status: "down",
      latencyMs: Date.now() - csStart,
      recordCount: 0,
      lastChecked: new Date().toISOString(),
      error: String(err),
    });
  }

  // Check Firms API
  const firmsStart = Date.now();
  try {
    const firmCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(serviceFirms);

    results.push({
      name: "Firms Directory",
      path: `${baseUrl}/api/public/firms`,
      status: "healthy",
      latencyMs: Date.now() - firmsStart,
      recordCount: Number(firmCount[0]?.count ?? 0),
      lastChecked: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      name: "Firms Directory",
      path: `${baseUrl}/api/public/firms`,
      status: "down",
      latencyMs: Date.now() - firmsStart,
      recordCount: 0,
      lastChecked: new Date().toISOString(),
      error: String(err),
    });
  }

  const allHealthy = results.every((r) => r.status === "healthy");

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      apis: results,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    }
  );
}
