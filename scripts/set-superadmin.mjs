import { neon } from "@neondatabase/serverless";

const DATABASE_URL = "postgresql://neondb_owner:npg_9VLUXFEiOGC4@ep-cool-king-a4xjnjed-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neon(DATABASE_URL);

const email = "masa@joincollectiveos.com";

const users = await sql`SELECT id, name, email, role FROM users WHERE email = ${email}`;

if (users.length === 0) {
  console.log(`No user found with email: ${email}`);
  process.exit(1);
}

console.log("Found user:", users[0]);

await sql`UPDATE users SET role = 'superadmin' WHERE email = ${email}`;

const updated = await sql`SELECT id, name, email, role FROM users WHERE email = ${email}`;
console.log("Updated user:", updated[0]);
console.log("✓ Done — log out and back in at cos-concept.vercel.app");
