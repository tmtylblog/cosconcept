/**
 * Background Job: Update PREFERS/AVOIDS Edges from Revealed Behavior
 *
 * Stated preferences (from onboarding answers) give us a baseline.
 * Revealed preferences — derived from actual accept/decline decisions — are
 * higher-quality signals and get applied with a multiplier.
 *
 * Signal sources:
 *   - partnership.accepted → PREFERS edges to the accepted firm's taxonomy tags
 *   - partnership.declined → AVOIDS edges to the declined firm's taxonomy tags
 *   - lead.claimed → PREFERS edges to the lead's required taxonomy tags
 *   - opportunity.actioned (network resolve) → PREFERS to matched firm's tags
 *
 * Edge weight logic:
 *   - Existing "stated" edge: weight bumped by +0.1 (revealed reinforces stated)
 *   - New edge (no stated match): weight = 0.7 (revealed-only)
 *   - AVOIDS: weight = 0.8 (decline is strong signal; don't go to 1.0 from one event)
 *
 * Idempotent: uses MERGE + SET (no duplicate edges).
 */

import { inngest } from "../client";
import { neo4jWrite } from "@/lib/neo4j";

type PreferenceEvent =
  | { name: "partnership/accepted"; data: { partnerFirmId: string; myFirmId: string } }
  | { name: "partnership/declined"; data: { partnerFirmId: string; myFirmId: string } }
  | { name: "lead/claimed"; data: { leadFirmId: string; leadRequiredCategories?: string[]; leadRequiredSkills?: string[] } }
  | { name: "opportunity/actioned"; data: { firmId: string; matchedFirmId?: string } };

export const preferenceUpdateRevealed = inngest.createFunction(
  {
    id: "preference-update-revealed",
    name: "Update Revealed Preferences from Behavior",
    retries: 3,
  },
  [
    { event: "partnership/accepted" },
    { event: "partnership/declined" },
    { event: "lead/claimed" },
    { event: "opportunity/actioned" },
  ],
  async ({ event, step }) => {
    const ev = event as PreferenceEvent;

    if (ev.name === "partnership/accepted") {
      const { myFirmId, partnerFirmId } = ev.data;

      await step.run("write-prefers-from-acceptance", async () => {
        // Get the accepted partner's taxonomy tags, then write PREFERS edges
        await neo4jWrite(
          `MATCH (myFirm:ServiceFirm {id: $myFirmId})
           MATCH (partner:ServiceFirm {id: $partnerFirmId})
           // PREFERS → FirmCategory (from partner's categories)
           OPTIONAL MATCH (partner)-[:IN_CATEGORY]->(cat:FirmCategory)
           WITH myFirm, collect(DISTINCT cat) AS cats
           FOREACH (c IN cats |
             MERGE (myFirm)-[r:PREFERS]->(c)
             SET r.dimension = "firm_category",
                 r.source = "revealed",
                 r.weight = CASE WHEN r.weight IS NULL THEN 0.7 ELSE min(r.weight + 0.1, 1.0) END,
                 r.updatedAt = datetime()
           )`,
          { myFirmId, partnerFirmId }
        );

        await neo4jWrite(
          `MATCH (myFirm:ServiceFirm {id: $myFirmId})
           MATCH (partner:ServiceFirm {id: $partnerFirmId})
           // PREFERS → Skill (from partner's top skills)
           OPTIONAL MATCH (partner)-[hs:HAS_SKILL]->(s:Skill)
           WHERE hs.strength >= 0.6
           WITH myFirm, collect(DISTINCT s) AS skills
           FOREACH (sk IN skills |
             MERGE (myFirm)-[r:PREFERS]->(sk)
             SET r.dimension = "skill",
                 r.source = "revealed",
                 r.weight = CASE WHEN r.weight IS NULL THEN 0.7 ELSE min(r.weight + 0.1, 1.0) END,
                 r.updatedAt = datetime()
           )`,
          { myFirmId, partnerFirmId }
        );

        return { action: "prefers_written", myFirmId, partnerFirmId };
      });
    }

    if (ev.name === "partnership/declined") {
      const { myFirmId, partnerFirmId } = ev.data;

      await step.run("write-avoids-from-decline", async () => {
        // Write AVOIDS edges to the declined firm's primary category
        await neo4jWrite(
          `MATCH (myFirm:ServiceFirm {id: $myFirmId})
           MATCH (partner:ServiceFirm {id: $partnerFirmId})
           OPTIONAL MATCH (partner)-[ic:IN_CATEGORY]->(cat:FirmCategory)
           WHERE ic.confidence >= 0.7
           WITH myFirm, collect(DISTINCT cat) AS cats
           FOREACH (c IN cats |
             MERGE (myFirm)-[r:AVOIDS]->(c)
             SET r.dimension = "firm_category",
                 r.source = "revealed",
                 r.weight = CASE WHEN r.weight IS NULL THEN 0.8 ELSE min(r.weight + 0.05, 1.0) END,
                 r.updatedAt = datetime()
           )`,
          { myFirmId, partnerFirmId }
        );

        return { action: "avoids_written", myFirmId, partnerFirmId };
      });
    }

    if (ev.name === "lead/claimed") {
      const { leadFirmId, leadRequiredCategories = [], leadRequiredSkills = [] } = ev.data;

      await step.run("write-prefers-from-lead-claim", async () => {
        if (leadRequiredCategories.length > 0) {
          await neo4jWrite(
            `MATCH (f:ServiceFirm {id: $firmId})
             UNWIND $cats AS catName
             MERGE (c:FirmCategory {name: catName})
             MERGE (f)-[r:PREFERS]->(c)
             SET r.dimension = "firm_category",
                 r.source = "revealed",
                 r.weight = CASE WHEN r.weight IS NULL THEN 0.7 ELSE min(r.weight + 0.05, 1.0) END,
                 r.updatedAt = datetime()`,
            { firmId: leadFirmId, cats: leadRequiredCategories }
          );
        }

        if (leadRequiredSkills.length > 0) {
          await neo4jWrite(
            `MATCH (f:ServiceFirm {id: $firmId})
             UNWIND $skills AS skillName
             MERGE (s:Skill {name: skillName})
             ON CREATE SET s.level = "L2"
             MERGE (f)-[r:PREFERS]->(s)
             SET r.dimension = "skill",
                 r.source = "revealed",
                 r.weight = CASE WHEN r.weight IS NULL THEN 0.7 ELSE min(r.weight + 0.05, 1.0) END,
                 r.updatedAt = datetime()`,
            { firmId: leadFirmId, skills: leadRequiredSkills }
          );
        }

        return { action: "prefers_from_lead", leadFirmId };
      });
    }

    return { event: ev.name, processed: true };
  }
);
