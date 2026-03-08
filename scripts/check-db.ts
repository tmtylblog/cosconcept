import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const o = await sql`SELECT COUNT(*)::int AS count FROM organizations`;
  console.log("organizations count:", o[0]?.count);

  const orgs = await sql`SELECT id, name, slug FROM organizations`;
  console.log("orgs:", orgs);

  const m = await sql`SELECT COUNT(*)::int AS count FROM members`;
  console.log("members count:", m[0]?.count);
}

main().then(() => process.exit(0));
