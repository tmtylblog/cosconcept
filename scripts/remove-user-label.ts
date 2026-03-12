import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { neo4jWrite, neo4jRead } from "../src/lib/neo4j";

async function main() {
  const before = await neo4jRead<{ n: { low: number } }>("MATCH (n:User) RETURN count(n) AS n");
  console.log("User nodes before:", before[0]?.n?.low ?? before[0]?.n);

  await neo4jWrite("MATCH (n:User) REMOVE n:User");

  const after = await neo4jRead<{ n: { low: number } }>("MATCH (n:User) RETURN count(n) AS n");
  console.log("User nodes after:", after[0]?.n?.low ?? after[0]?.n);

  const pu = await neo4jRead<{ n: { low: number } }>("MATCH (n:PlatformUser) RETURN count(n) AS n");
  console.log("Person:PlatformUser nodes intact:", pu[0]?.n?.low ?? pu[0]?.n);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
