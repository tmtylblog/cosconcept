import neo4j, { type Driver } from "neo4j-driver";

/**
 * Neo4j Aura driver singleton.
 * Reuses the connection across serverless invocations in development.
 */

const globalForNeo4j = globalThis as unknown as { neo4jDriver: Driver };

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI!;
  const username = process.env.NEO4J_USERNAME!;
  const password = process.env.NEO4J_PASSWORD!;

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

export const neo4jDriver =
  globalForNeo4j.neo4jDriver ?? createDriver();

if (process.env.NODE_ENV !== "production") {
  globalForNeo4j.neo4jDriver = neo4jDriver;
}

/**
 * Run a read query against Neo4j.
 */
export async function neo4jRead<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Run a write query against Neo4j.
 */
export async function neo4jWrite<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
