import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon serverless PostgreSQL + Drizzle ORM connection.
 * Uses a getter function to avoid calling neon() at build time
 * when DATABASE_URL isn't available.
 */

const globalForDb = globalThis as unknown as {
  db: NeonHttpDatabase<typeof schema> | undefined;
};

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const sql = neon(url);
    globalForDb.db = drizzle(sql, { schema });
  }
  return globalForDb.db;
}

/**
 * Use `getDb()` in server code. This `db` export is a convenience
 * proxy that lazily initializes on first property access.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const realDb = getDb();
    const value = Reflect.get(realDb, prop, receiver);
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});
