import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { neo4jRead } from "../src/lib/neo4j";

async function n(q: string) {
  const r = await neo4jRead<{ n: { low: number } | number }>(q);
  const v = r[0]?.n;
  return typeof v === "object" && v !== null ? (v as { low: number }).low : (v as number) ?? 0;
}

async function main() {
  console.log("Skill {level:'L1'}:", await n(`MATCH (n:Skill {level:'L1'}) RETURN count(n) AS n`));
  console.log("Skill {level:'L2'}:", await n(`MATCH (n:Skill {level:'L2'}) RETURN count(n) AS n`));
  console.log("Skill {level:'L3'}:", await n(`MATCH (n:Skill {level:'L3'}) RETURN count(n) AS n`));
  console.log("Skill total:       ", await n(`MATCH (n:Skill) RETURN count(n) AS n`));
  console.log("L2→L1 BELONGS_TO: ", await n(`MATCH (:Skill {level:'L2'})-[:BELONGS_TO]->(:Skill {level:'L1'}) RETURN count(*) AS n`));
  console.log("L3→L2 BELONGS_TO: ", await n(`MATCH (:Skill {level:'L3'})-[:BELONGS_TO]->(:Skill {level:'L2'}) RETURN count(*) AS n`));
  console.log("SkillL1 remaining:", await n(`MATCH (n:SkillL1) RETURN count(n) AS n`));
  console.log("LegacySkill:      ", await n(`MATCH (n:LegacySkill) RETURN count(n) AS n`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
