/**
 * GET /api/discover/entity?entityId=xxx&entityType=firm|expert|case_study
 *
 * Returns full entity detail from Neo4j for the Discover drawer.
 */

import { NextRequest, NextResponse } from "next/server";
import { neo4jRead } from "@/lib/neo4j";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const entityId = searchParams.get("entityId");
  const entityType = searchParams.get("entityType") as "firm" | "expert" | "case_study" | null;

  if (!entityId || !entityType) {
    return NextResponse.json({ error: "Missing entityId or entityType" }, { status: 400 });
  }

  try {
    if (entityType === "firm") return NextResponse.json(await fetchFirm(entityId));
    if (entityType === "expert") return NextResponse.json(await fetchExpert(entityId));
    if (entityType === "case_study") return NextResponse.json(await fetchCaseStudy(entityId));
    return NextResponse.json({ error: "Unknown entityType" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Firm ─────────────────────────────────────────────────

async function fetchFirm(firmId: string) {
  interface FirmRow {
    name: string;
    website: string | null;
    linkedinUrl: string | null;
    sizeBand: string | null;
    description: string | null;
    categories: string[];
    skills: string[];
    industries: string[];
    markets: string[];
    caseStudies: Array<{
      legacyId: string | null;
      title: string | null;
      summary: string | null;
      sourceUrl: string | null;
      clientName: string | null;
      skills: string[];
      industries: string[];
    }>;
    experts: Array<{
      legacyId: string | null;
      displayName: string;
      title: string | null;
      hiddenSummary: string | null;
      skills: string[];
      specialistTitles: string[];
      workHistory: Array<{ company: string; title: string; isCurrent: boolean }>;
    }>;
    directClients: Array<{ name: string; industry: string | null }>;
  }

  const records = await neo4jRead<FirmRow>(
    `MATCH (f:Company:ServiceFirm {id: $firmId})
     OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs:CaseStudy)
     OPTIONAL MATCH (exp:Person)-[:CURRENTLY_AT|WORKS_AT]->(f)
     WHERE "expert" IN exp.personTypes
     WITH f,
       collect(DISTINCT {
         legacyId: cs.legacyId,
         title: cs.title,
         summary: cs.summary,
         sourceUrl: cs.sourceUrl,
         clientName: [(cs)-[:FOR_CLIENT]->(cl:Company) | cl.name][0],
         skills: [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..6],
         industries: [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..4]
       })[0..10] AS caseStudies,
       collect(DISTINCT {
         legacyId: exp.legacyId,
         displayName: coalesce(exp.fullName, exp.firstName + ' ' + exp.lastName, exp.name, 'Expert'),
         title: [(exp)-[:HAS_SPECIALIST_PROFILE]->(sp:SpecialistProfile) | sp.title][0],
         hiddenSummary: exp.hiddenSummary,
         skills: [(exp)-[:HAS_SKILL]->(s:Skill) | s.name][0..8],
         specialistTitles: [(exp)-[:HAS_SPECIALIST_PROFILE]->(sp:SpecialistProfile) | sp.title][0..3],
         workHistory: [(exp)-[wa:WORKED_AT]->(c:Company) | {company: c.name, title: wa.title, isCurrent: coalesce(wa.isCurrent, false)}][0..5]
       })[0..8] AS experts
     RETURN
       f.name AS name,
       f.website AS website,
       f.linkedinUrl AS linkedinUrl,
       f.sizeBand AS sizeBand,
       f.description AS description,
       [(f)-[:IN_CATEGORY]->(c:FirmCategory) | c.name] AS categories,
       [(f)-[:HAS_SKILL]->(s:Skill) | s.name][0..15] AS skills,
       [(f)-[:SERVES_INDUSTRY]->(i:Industry) | i.name][0..10] AS industries,
       [(f)-[:OPERATES_IN]->(m:Market) | m.name][0..8] AS markets,
       [(f)-[:HAS_CLIENT]->(cl:Company) | {name: cl.name, industry: cl.industry}][0..20] AS directClients,
       caseStudies,
       experts`,
    { firmId }
  );

  if (!records.length) return { error: "Not found" };

  const data = records[0];

  // Filter phantom entries from OPTIONAL MATCH (collect produces {legacyId: null} ghosts)
  data.caseStudies = data.caseStudies.filter(cs => cs.legacyId != null);
  data.experts = data.experts.filter(exp => exp.legacyId != null);

  return { entityType: "firm", data };
}

// ─── Expert ───────────────────────────────────────────────

async function fetchExpert(legacyId: string) {
  interface ExpertRow {
    legacyId: string;
    displayName: string;
    email: string | null;
    linkedinUrl: string | null;
    hiddenSummary: string | null;
    firmName: string | null;
    firmWebsite: string | null;
    skills: string[];
    industries: string[];
    markets: string[];
    languages: string[];
    specialistProfiles: Array<{ title: string | null; description: string | null; skills: string[] }>;
    caseStudies: Array<{ legacyId: string; title: string | null; summary: string | null; clientName: string | null; firmName: string | null; skills: string[]; industries: string[] }>;
    workHistory: Array<{ company: string; title: string; industry: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean }>;
  }

  const records = await neo4jRead<ExpertRow>(
    `MATCH (p:Person {legacyId: $legacyId})
     WHERE "expert" IN p.personTypes
     OPTIONAL MATCH (p)-[:CURRENTLY_AT|WORKS_AT]->(sf:ServiceFirm)
     WITH p, sf
     RETURN
       p.legacyId AS legacyId,
       coalesce(p.fullName, p.firstName + ' ' + p.lastName, p.name, 'Expert') AS displayName,
       p.email AS email,
       p.linkedinUrl AS linkedinUrl,
       p.hiddenSummary AS hiddenSummary,
       sf.name AS firmName,
       sf.website AS firmWebsite,
       [(p)-[:HAS_SKILL]->(s:Skill) | s.name][0..15] AS skills,
       [(p)-[:SERVES_INDUSTRY]->(i:Industry) | i.name][0..10] AS industries,
       [(p)-[:OPERATES_IN]->(m:Market) | m.name][0..8] AS markets,
       [(p)-[:SPEAKS_LANGUAGE]->(l:Language) | l.name][0..5] AS languages,
       [(p)-[:HAS_SPECIALIST_PROFILE]->(sp:SpecialistProfile) | {
         title: sp.title,
         description: sp.description,
         skills: [(sp)-[:HAS_SKILL]->(sk:Skill) | sk.name][0..6]
       }][0..5] AS specialistProfiles,
       [(p)-[:CONTRIBUTED_TO]->(cs:CaseStudy) | {
         legacyId: cs.legacyId,
         title: cs.title,
         summary: cs.summary,
         clientName: [(cs)-[:FOR_CLIENT]->(cl:Company) | cl.name][0],
         firmName: [(cs)<-[:HAS_CASE_STUDY]-(sf2:ServiceFirm) | sf2.name][0],
         skills: [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..5],
         industries: [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..3]
       }][0..8] AS caseStudies,
       [(p)-[wa:WORKED_AT]->(c:Company) | {
         company: c.name,
         title: wa.title,
         industry: c.industry,
         startDate: wa.startDate,
         endDate: wa.endDate,
         isCurrent: coalesce(wa.isCurrent, false)
       }][0..10] AS workHistory`,
    { legacyId }
  );

  if (!records.length) return { error: "Not found" };
  return { entityType: "expert", data: records[0] };
}

// ─── Case Study ───────────────────────────────────────────

async function fetchCaseStudy(legacyId: string) {
  interface CaseStudyRow {
    legacyId: string;
    title: string | null;
    summary: string | null;
    sourceUrl: string | null;
    status: string | null;
    clientName: string | null;
    firmName: string | null;
    firmWebsite: string | null;
    skills: string[];
    industries: string[];
    contributors: Array<{ legacyId: string; displayName: string; title: string | null }>;
  }

  const records = await neo4jRead<CaseStudyRow>(
    `MATCH (cs:CaseStudy {legacyId: $legacyId})
     OPTIONAL MATCH (cs)<-[:HAS_CASE_STUDY]-(sf:ServiceFirm)
     WITH cs, sf
     RETURN
       cs.legacyId AS legacyId,
       cs.title AS title,
       cs.summary AS summary,
       cs.sourceUrl AS sourceUrl,
       cs.status AS status,
       [(cs)-[:FOR_CLIENT]->(cl:Company) | cl.name][0] AS clientName,
       sf.name AS firmName,
       sf.website AS firmWebsite,
       [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..15] AS skills,
       [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..10] AS industries,
       [(p:Person)-[:CONTRIBUTED_TO]->(cs) | {
         legacyId: p.legacyId,
         displayName: coalesce(p.fullName, p.firstName + ' ' + p.lastName, p.name, 'Contributor'),
         title: [(p)-[:HAS_SPECIALIST_PROFILE]->(sp:SpecialistProfile) | sp.title][0]
       }][0..8] AS contributors`,
    { legacyId }
  );

  if (!records.length) return { error: "Not found" };
  return { entityType: "case_study", data: records[0] };
}
