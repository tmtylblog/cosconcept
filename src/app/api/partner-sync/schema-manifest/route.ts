/**
 * GET /api/partner-sync/schema-manifest
 *
 * Returns COS knowledge graph schema (node labels, edge types, constraints).
 * CORE checks this to detect schema version drift.
 */

import { NextResponse } from "next/server";
import { authenticatePartner } from "../lib/auth";

export const dynamic = "force-dynamic";

const SCHEMA_VERSION = "1.0.0";
const LAST_CHANGED = "2026-03-11T00:00:00Z";

export async function GET(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    version: SCHEMA_VERSION,
    nodes: [
      { label: "Skill", properties: ["name", "level", "l1", "l2"], constraints: ["name UNIQUE"] },
      { label: "SkillL1", properties: ["name", "level"], constraints: ["name UNIQUE"] },
      { label: "Industry", properties: ["name", "level"], constraints: ["name UNIQUE"] },
      { label: "IndustryL1", properties: ["name", "level"], constraints: [] },
      { label: "Category", properties: ["name", "definition", "theme", "sampleOrgs"], constraints: ["name UNIQUE"] },
      { label: "FirmCategory", properties: ["name", "definition", "theme", "sampleOrgs"], constraints: ["name UNIQUE"] },
      { label: "Market", properties: ["name", "type", "level", "isoCode"], constraints: ["name UNIQUE"] },
      { label: "Language", properties: ["name"], constraints: ["name UNIQUE"] },
      { label: "FirmType", properties: ["name", "description"], constraints: ["name UNIQUE"] },
      { label: "DeliveryModel", properties: ["name", "description"], constraints: ["name UNIQUE"] },
      { label: "ServiceCategory", properties: ["name", "description"], constraints: ["name UNIQUE"] },
      { label: "Service", properties: ["name"], constraints: ["name UNIQUE"] },
      { label: "TechCategory", properties: ["name", "slug", "description"], constraints: ["name UNIQUE"] },
      // Company is the primary node. ServiceFirm is a role label on Company nodes that are COS service-provider members.
      // Always merge/match on Company {id}. A Company:ServiceFirm node has both labels.
      { label: "Company", properties: ["id", "domain", "name", "website", "description", "organizationId", "employeeCount", "isCosCustomer", "enrichmentStatus"], constraints: ["id UNIQUE", "domain UNIQUE"] },
      { label: "ServiceFirm", properties: [], constraints: ["role label on Company — no separate constraint"] },
      { label: "Person", properties: ["linkedinUrl", "firstName", "lastName", "headline", "emails"], constraints: ["linkedinUrl UNIQUE"] },
      { label: "Expert", properties: ["id", "fullName", "headline", "firmId"], constraints: ["id UNIQUE"] },
      { label: "CaseStudy", properties: ["id", "title", "description", "firmId"], constraints: ["id UNIQUE"] },
      { label: "Client", properties: ["name"], constraints: ["name UNIQUE"] },
      { label: "WorkHistory", properties: ["title", "companyStageAtTime", "startAt", "endAt"], constraints: [] },
    ],
    edges: [
      { type: "BELONGS_TO", from: "Skill", to: "SkillL1", properties: [] },
      { type: "BELONGS_TO", from: "Skill", to: "Skill", properties: [] },
      { type: "BELONGS_TO", from: "Industry", to: "IndustryL1", properties: [] },
      { type: "BELONGS_TO", from: "Service", to: "ServiceCategory", properties: [] },
      { type: "PARENT_REGION", from: "Market", to: "Market", properties: [] },
      { type: "PARTNERS_WITH", from: "Category", to: "Category", properties: ["nature", "direction", "frequency", "revenueModel"] },
      { type: "IN_CATEGORY", from: "Company:ServiceFirm", to: "Category", properties: [] },
      { type: "HAS_SKILL", from: "Company:ServiceFirm", to: "Skill", properties: [] },
      { type: "HAS_SKILL", from: "Person", to: "Skill", properties: [] },
      { type: "OPERATES_IN", from: "Company:ServiceFirm", to: "Market", properties: [] },
      { type: "SPEAKS", from: "Company:ServiceFirm", to: "Language", properties: [] },
      { type: "SERVES_INDUSTRY", from: "Company:ServiceFirm", to: "Industry", properties: [] },
      { type: "OFFERS_SERVICE", from: "Company:ServiceFirm", to: "Service", properties: [] },
      { type: "IS_FIRM_TYPE", from: "Company:ServiceFirm", to: "FirmType", properties: [] },
      { type: "HAS_CASE_STUDY", from: "Company:ServiceFirm", to: "CaseStudy", properties: [] },
      { type: "CURRENTLY_AT", from: "Person", to: "Company:ServiceFirm", properties: [] },
      { type: "DEMONSTRATES_SKILL", from: "CaseStudy", to: "Skill", properties: [] },
      { type: "FOR_CLIENT", from: "CaseStudy", to: "Company", properties: [] },
      { type: "IN_INDUSTRY", from: "CaseStudy", to: "Industry", properties: [] },
      { type: "WORKED_AT", from: "Person", to: "WorkHistory", properties: [] },
      { type: "PREFERS", from: "Company:ServiceFirm", to: "Skill", properties: ["dimension", "weight", "source"] },
      { type: "PREFERS", from: "Company:ServiceFirm", to: "Category", properties: ["dimension", "weight", "source"] },
      { type: "PREFERS", from: "Company:ServiceFirm", to: "Market", properties: ["dimension", "weight", "source"] },
    ],
    lastChanged: LAST_CHANGED,
  });
}
